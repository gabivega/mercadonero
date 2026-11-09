import { useEffect, useState } from 'react';
import { usePrivy } from "../../Utils/authClient";
import { createPublicClient, http, formatUnits } from 'viem';
import { polygonAmoy, bscTestnet, baseSepolia } from 'viem/chains';

import { Wallet, RefreshCcw, ArrowUpRight, ArrowDownLeft, ArrowUpRight as ArrowOut, ExternalLink, Copy, PlusCircle, Sparkles, BadgePercent, ChevronDown, Gift, Users, History, ShieldCheck, HandCoins, Info } from 'lucide-react';
import axios from 'axios';
import SendTokenModal from '../../components/SendTokenModal';
import Swal from 'sweetalert2';
import CollateralManager from '../../components/CollateralManager';
import TokenIcon from '../../components/TokenIcon';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useUserStore } from '../../store/useUserStore';
import { useSyncUser } from '../../Utils/userSync';
import { ensureUserWallet, sendToken, activateForChains, APP_EVM_CHAINS, isDeviceActivatedForAll } from '../../Utils/crossmintWallet';
import { isJwtExpiredError, handleUnauthorized } from '../../Utils/axiosAuth';
import { ensureGas } from '../../Utils/ensureGas';
import { checkOpRateLimit, registerOp, describeLimit } from '../../Utils/opRateLimit';
import { OP_POLICY, getOpLimit } from '../../config/opPolicy';

/**
 * Redes soportadas por la billetera, agrupadas por red.
 *
 * Las smart wallets de Crossmint comparten la MISMA address en todas las redes
 * EVM. Acá mostramos el saldo de cada token en su red correspondiente y leemos
 * cada red con un public client explícito (las lecturas no requieren firma).
 *
 * `native: true` → saldo nativo (POL/ETH/tBNB) se lee con getBalance.
 * El resto son ERC-20: se leen con balanceOf en su propia red.
 * `locator` es el identificador que usa Crossmint para `send()` (opcional).
 */
const RPC_BY_CHAIN = {
  [polygonAmoy.id]:
    import.meta.env.VITE_POLYGON_AMOY_RPC ||
    'https://polygon-amoy-bor-rpc.publicnode.com',
  [bscTestnet.id]: 'https://bsc-testnet-rpc.publicnode.com',
  [baseSepolia.id]: 'https://sepolia.base.org',
};

/**
 * Solo mostramos STABLECOINS. La plataforma absorbe el gas de todas las
 * transacciones (paymaster), así que el usuario NO necesita ni debe depositar
 * la moneda nativa de la red. Mostrar saldos de POL/tBNB/ETH solo generaba
 * confusión ("no tengo gas, ¿puedo operar?"), así que se ocultaron.
 *
 * Tokens vigentes (uno por red):
 *   · USDC  → Polygon (testnet hoy usa USDXM; migraremos a USDC)
 *   · USDT  → BSC
 *   · USDC  → Base
 *
 * Si en el futuro se necesitara volver a exponer el saldo nativo, alcanza con
 * reincorporar el token con `native: true` (la lógica de lectura/envío ya lo
 * soporta). Lo dejamos documentado abajo.
 */
const WALLET_NETWORKS = [
  {
    chainId: polygonAmoy.id,
    chain: polygonAmoy,
    label: 'Polygon Amoy',
    explorer: 'https://amoy.polygonscan.com',
    tokens: [
      {
        symbol: 'USDXM',
        name: 'USDXM (Testnet)',
        // Token de colateral en Polygon Amoy (respaldado por USDC, 6 dec).
        address: '0x14196F08a4Fa0B66B7331bC40dd6bCd8A1dEeA9F',
        decimals: 6,
        locator: 'usdxm',
      },
      // { symbol: 'POL', name: 'Polygon (Testnet)', address: null, native: true, decimals: 18 },
    ],
  },
  {
    chainId: bscTestnet.id,
    chain: bscTestnet,
    label: 'BNB Smart Chain Testnet',
    explorer: 'https://testnet.bscscan.com',
    tokens: [
      {
        symbol: 'USDT',
        name: 'USDT (BSC Testnet)',
        // USDT de prueba en BSC testnet (18 decimales en esta red).
        address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
        decimals: 18,
      },
      // { symbol: 'tBNB', name: 'BNB (Testnet)', address: null, native: true, decimals: 18 },
    ],
  },
  {
    chainId: baseSepolia.id,
    chain: baseSepolia,
    label: 'Base Sepolia',
    explorer: 'https://sepolia.basescan.org',
    tokens: [
      {
        symbol: 'USDC',
        name: 'USDC (Base Sepolia)',
        // USDC de Circle en Base Sepolia (6 decimales).
        address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        decimals: 6,
      },
      // { symbol: 'ETH', name: 'Ethereum (Base Sepolia)', address: null, native: true, decimals: 18 },
    ],
  },
];

// Clave única de balance por red (evita colisiones de símbolos entre redes).
const balanceKey = (token) => `${token.chainId}:${token.symbol}`;

// Nombre de chain que usa Crossmint en `send(chain)` por chainId.
// Nota: Crossmint soporta base-sepolia y polygon-amoy en testnet; BSC testnet
// puede NO estar soportada por Crossmint (BSC solo existe como mainnet "bsc").
// Lo dejamos mapeado igual para que, si el SDK lo soporta, funcione.
const NETWORK_CHAIN_NAME = {
  [polygonAmoy.id]: 'polygon-amoy',
  [bscTestnet.id]: 'bsc-testnet',
  [baseSepolia.id]: 'base-sepolia',
};

// Public clients por red (cacheados) para lecturas de balance.
const publicClientByChain = {};
function getPublicClient(chainId, chain) {
  if (!publicClientByChain[chainId]) {
    publicClientByChain[chainId] = createPublicClient({
      chain,
      transport: http(RPC_BY_CHAIN[chainId]),
    });
  }
  return publicClientByChain[chainId];
}

// ── Config del historial de movimientos ────────────────────────────────────
// Los RPC públicos no permiten `eth_getLogs` sobre rangos enormes de bloques
// (ni el full range). Para no reventar el endpoint, escaneamos hacia atrás en
// tramos ("chunks") de bloques, como máximo LOOKBACK_BLOCKS atrás, hasta
// juntar los últimos N movimientos. Es una heurística: si la wallet tuvo mucha
// actividad hace mucho tiempo, puede que los 10 movimientos no estén dentro de
// la ventana; en ese caso mostramos los que haya. Alcanza para testnets.
const TX_HISTORY_LIMIT = 10;
const TX_HISTORY_CHUNK_BLOCKS = 2000n; // tamaño de cada tramo de getLogs
const TX_HISTORY_LOOKBACK_BLOCKS = 200000n; // ~cuánto hacia atrás escaneamos (aprox)

// Topic del evento ERC-20: Transfer(address,address,uint256)
// keccak256("Transfer(address,address,uint256)")
const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Abi mínimo solo con el evento (viem lo usa para `getLogs` / decodificar).
const erc20TransferAbi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
];

// topic de una address (32 bytes, padded a la izquierda)
const addressToTopic = (addr) =>
  `0x${String(addr).toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;

const minERC20Abi = [
  { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  { constant: false, inputs: [{ name: "_to", type: "address" }, { name: "_value", type: "uint256" }], name: "transfer", outputs: [{ name: "success", type: "bool" }], type: "function" }
];

// Muestra/oculta el aviso proactivo de "activar billetera". Oculto por ahora:
// la smart wallet firma sin activación previa y el OTP aparece solo si el SDK
// lo pide. Cambiar a true para volver a mostrar la UI de activación.
const SHOW_ACTIVATION_UI = false;

export default function WalletPage() {
  const { user, authenticated, getAccessToken } = usePrivy();
  const { dbUser, setDbUser } = useUserStore();
  // Re-sincroniza el usuario desde la BD tras asociar la wallet, para que el
  // store refleje `walletAddress` (y `authClient` recomponga user.wallet).
  const { syncUser } = useSyncUser(setDbUser);

      // Solo los vendedores gestionan garantías (colateral para vender).
  // El flag isSeller de la BD no siempre se actualiza al crear productos,
  // así que además del flag oficial consideramos vendedor a quien tenga
  // al menos una publicacion creada (ver checkSellerByProducts).
  const [hasProducts, setHasProducts] = useState(false);
  const [isCollateralOpen, setIsCollateralOpen] = useState(false);
  const isSeller = Boolean(dbUser?.isSeller) || hasProducts;
  // ¿El usuario está habilitado como referidor? Si NO, la tarjeta de referidos
  // solo muestra su saldo usable en checkout (sin retiro ni textos de referidor).
  const isApprovedReferrer = dbUser?.referralStatus === "approved";

  const [balances, setBalances] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isCreatingWallet, setIsCreatingWallet] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
  // ¿El dispositivo ya está activado en todas las redes? Se relee tras activar.
  const [activatedAll, setActivatedAll] = useState(false);

  // Historial de movimientos on-chain (ingresos/egresos de las stablecoins).
  // Se calcula a partir de los eventos ERC-20 `Transfer` leídos con getLogs;
  // no depende del backend. Se consulta junto con los balances.
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState(null);

    // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [sendForm, setSendForm] = useState({ to: '', amount: '' });
  const [isSending, setIsSending] = useState(false);

    // Estados de Cashback / Reintegros
  const [cashback, setCashback] = useState(null);
  const [cashbackLoading, setCashbackLoading] = useState(false);

  // Estados de Referidos (recompensas por compartir). Comparten el mismo
  // fondo de recompensas que el cashback: se muestran en dos tarjetas pero
  // el total combinado es la suma de ambos saldos.
  const [referral, setReferral] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // Saldo retirable real (ganancia como referidor) + saldo usable en checkout.
  const [rewardsSummary, setRewardsSummary] = useState(null);

  // Historial unificado (cashback + referidos): se consulta bajo demanda al
  // desplegar la tabla, para no traer movimientos que el usuario no va a ver.
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTxs, setHistoryTxs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySource, setHistorySource] = useState("all"); // all | cashback | referral

    // Modal de retiro (sirve tanto para cashback como para referidos).
  const [withdrawModal, setWithdrawModal] = useState(null); // { source, balance, minUsd, allow }
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // ── Saldo a favor como vendedor (SellerCredit) ──
  // Cuando un comprador paga con recompensas, el vendedor cobra menos en el
  // escrow/pago directo. La plataforma le queda debiendo ese monto, que se
  // registra como SellerCredit (pendiente) y se paga manualmente. Acá mostramos
  // ese saldo y permitimos solicitar el claim. Los datos vienen ya en
  // `rewardsSummary.sellerCreditPendingUsd` / `sellerCreditItems`.
  const [isClaimingSeller, setIsClaimingSeller] = useState(false);
  // Toggle "ver detalle" del saldo a favor (oculto por defecto, igual que el
  // historial de recompensas). Se despliega al clickear.
  const [isSellerCreditOpen, setIsSellerCreditOpen] = useState(false);
  // Paginación "ver más" del detalle de saldo a favor: arrancamos mostrando 10
  // ventas y sumamos de a 10 para no hacer un scroll infinito.
  const [sellerCreditVisible, setSellerCreditVisible] = useState(10);

  // Paginación "ver más" del historial de recompensas (cashback + referidos).
  // Mostramos los últimos 10 movimientos y sumamos de a 10 al clickear.
  const [historyVisible, setHistoryVisible] = useState(10);

    // Dirección de la wallet del usuario. Fuente de verdad: Mongo (dbUser).
  // Fallback al user mapeado (authClient ya incluye dbUser.walletAddress ahí).
  const walletAddress = dbUser?.walletAddress || user?.wallet?.address || null;
  const hasWallet = Boolean(walletAddress);

  // Crea la wallet EVM con Crossmint (polygon-amoy) y la asocia a la cuenta.
  // Flujo:
  //   1. Crossmint crea la smart wallet (owner = sub del JWT de Supabase).
  //   2. Guardamos la address en la BD (POST /api/user/wallet).
  //   3. Re-sincronizamos el store para reflejar walletAddress en toda la app.
    const handleCreateWallet = async () => {
    try {
      setIsCreatingWallet(true);

      // 1. OBTENER O CREAR la wallet en Crossmint (idempotente).
      //    Si por un fallo previo la wallet YA existe en Crossmint pero no se
      //    persistió en Mongo, `ensureUserWallet` la reutiliza en vez de fallar
      //    con "The owner already holds a wallet...". Así recuperamos usuarios
      //    con la wallet "a medio crear".
      const { address, created } = await ensureUserWallet();

      // 2. Persistir la dirección en la BD (endpoint idempotente: si ya existe,
      //    devuelve la misma sin error).
      const token = await getAccessToken();
      await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/user/wallet`,
        { address },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // 3. Re-traer el usuario para que el store tenga walletAddress.
      await syncUser();

      const isDark = document.documentElement.classList.contains("dark");
      Swal.fire({
        title: created ? "¡Billetera Creada!" : "¡Billetera Recuperada!",
        text: created
          ? "Tu billetera Web3 ha sido generada y vinculada correctamente."
          : "Recuperamos tu billetera ya existente y la vinculamos a tu cuenta.",
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    } catch (error) {
      console.error("Error al crear la wallet:", error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "No se pudo generar la billetera. Inténtalo nuevamente.";
      Swal.fire({
        title: "Error",
        text: message,
        icon: "error",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsCreatingWallet(false);
    }
  };

  // Activa el device signer de la billetera para las redes que usamos (colateral
  // + pagos crypto). Muestra un aviso CLARO antes, porque el usuario va a recibir
  // un código por email de CROSSMINT (distinto del remitente de Mercado Nero) la
  // primera vez por dispositivo/red. Después, las firmas son silenciosas.
  const handleActivate = async () => {
    const isDark = document.documentElement.classList.contains("dark");
    const confirm = await Swal.fire({
      icon: "info",
      title: "Activar billetera para operar",
      html:
        `<p style="text-align:left;margin:0 0 10px">Vas a habilitar tu billetera para <b>depositar garantías y pagar</b> en las redes soportadas (Polygon Amoy y Base Sepolia).</p>` +
        `<p style="text-align:left;margin:0 0 10px">Te enviaremos un <b>código de verificación por email</b>. Importante: el correo llega desde nuestro proveedor de billetera <b>Crossmint</b> — <b>no es de Mercado Nero</b>. Revisá también spam/promociones.</p>` +
        `<p style="text-align:left;margin:0;font-size:13px;opacity:.75">Este paso se hace <b>una sola vez por dispositivo</b> (y una vez por cada red la primera vez).</p>`,
      showCancelButton: true,
      confirmButtonText: "Enviar código y activar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#F26722",
      cancelButtonColor: "#6b7280",
      background: isDark ? "#252525" : "#fff",
      color: isDark ? "#fff" : "#111",
    });
    if (!confirm.isConfirmed) return;

        setIsActivating(true);
    try {
      const results = await activateForChains(APP_EVM_CHAINS);
      const failed = results.filter((r) => !r.ok);
      if (failed.length && failed.length === results.length) {
        throw new Error(failed[0]?.error || "No se pudo activar la billetera.");
      }
      // Recalculamos el estado tras activar (el flag local se marcó por red).
      setActivatedAll(
        isDeviceActivatedForAll({ address: walletAddress, chains: APP_EVM_CHAINS }),
      );
      Swal.fire({
        title: "¡Billetera activada!",
        text:
          failed.length > 0
            ? "Se activó en la mayoría de las redes. Si una falló, podés reintentar."
            : "Ya podés depositar garantías y pagar sin verificaciones adicionales.",
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    } catch (error) {
      console.error("Error al activar billetera:", error);
      const msg =
        error?.code === "AUTH_REJECTED"
          ? "Cancelaste la verificación. Podés reintentar cuando quieras."
          : error?.message || "No se pudo activar la billetera.";
      Swal.fire({
        title: "No se pudo activar",
        text: msg,
        icon: "error",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      const isDark = document.documentElement.classList.contains("dark");
      const Toast = Swal.mixin({
        toast: true,
        position: "bottom-end",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        iconColor: "#3483fa",
      });
      Toast.fire({
        icon: "success",
        title: "Dirección copiada al portapapeles",
      });
    } catch (error) {
      console.error("Error al copiar dirección:", error);
    }
  };

      const fetchAllBalances = async () => {
    if (!walletAddress) return;
    setIsLoading(true);

    try {
      const newBalances = {};

      // Recorremos cada red y cada token de esa red, leyendo con el public
      // client de la red correspondiente (la TX firma aparte; esto es lectura).
      const jobs = WALLET_NETWORKS.flatMap((net) =>
        net.tokens.map(async (token) => {
          const key = balanceKey({ ...token, chainId: net.chainId });
          try {
            const client = getPublicClient(net.chainId, net.chain);
            if (token.native) {
              const balanceRaw = await client.getBalance({
                address: walletAddress,
              });
              newBalances[key] = formatUnits(balanceRaw, token.decimals);
            } else {
              const data = await client.readContract({
                address: token.address,
                abi: minERC20Abi,
                functionName: 'balanceOf',
                args: [walletAddress],
              });
              newBalances[key] = formatUnits(data, token.decimals);
            }
          } catch (tokenError) {
            console.error(
              `Error cargando balance de ${token.symbol} (chain ${net.chainId}):`,
              tokenError,
            );
            newBalances[key] = "0.00";
          }
        }),
      );

      await Promise.all(jobs);
      setBalances(newBalances);
    } catch (error) {
      console.error("Error general en fetchAllBalances:", error);
    } finally {
      setIsLoading(false);
    }
  };

      // ── Historial de movimientos on-chain ────────────────────────────────────
  // Lee los eventos ERC-20 `Transfer` de cada token/red con getLogs y arma un
  // listado unificado de ingresos y egresos de la wallet.
  //
  // Estrategia:
  //   · Por cada token, hacemos DOS queries con `topics` de 3 posiciones
  //     ([Transfer, address|null, address|null]) — una con `from = wallet`
  //     (egreso) y otra con `to = wallet` (ingreso). NO se puede pasar un array
  //     de dos address en la misma posición porque viem lo trata como AND, no
  //     como OR, y no devolvería nada.
  //   · Escaneamos hacia atrás en tramos de TX_HISTORY_CHUNK_BLOCKS, como
  //     máximo TX_HISTORY_LOOKBACK_BLOCKS, hasta juntar >= LIMIT movimientos.
  //   · Enriqucemos cada log con el timestamp del bloque (cacheado) y su hash.
  //   · Mergeamos todas las chains, ordenamos por bloque/fecha desc y cortamos.
  const fetchRecentTransfers = async () => {
    if (!walletAddress) return;
    setTransfersLoading(true);
    setTransfersError(null);

    try {
      const walletLower = walletAddress.toLowerCase();
      const walletTopic = addressToTopic(walletLower);
      const allEvents = [];

      // Cache de timestamps por chain+blockNumber para no consultar dos veces
      // el mismo bloque (varias transfers suelen compartir bloque).
      const tsCache = new Map();

      const jobs = WALLET_NETWORKS.flatMap((net) =>
        net.tokens
          .filter((t) => !t.native && t.address) // sólo ERC-20
          .map(async (token) => {
            try {
              const client = getPublicClient(net.chainId, net.chain);
              const latest = await client.getBlockNumber();

              let scanned = 0n;
              let cursor = latest;
              const tokenEvents = [];

              // Escaneamos hacia atrás hasta acumular el límite o agotar lookback.
              while (
                scanned < TX_HISTORY_LOOKBACK_BLOCKS &&
                tokenEvents.length < TX_HISTORY_LIMIT &&
                cursor >= 0n
              ) {
                const fromBlock =
                  cursor > TX_HISTORY_CHUNK_BLOCKS
                    ? cursor - TX_HISTORY_CHUNK_BLOCKS + 1n
                    : 0n;
                const toBlock = cursor;

                // Ingresos (`to = wallet`) y egresos (`from = wallet`) en paralelo.
                const [incoming, outgoing] = await Promise.all([
                  client.getLogs({
                    address: token.address,
                    event: erc20TransferAbi[0],
                    args: { to: walletAddress },
                    fromBlock,
                    toBlock,
                  }),
                  client.getLogs({
                    address: token.address,
                    event: erc20TransferAbi[0],
                    args: { from: walletAddress },
                    fromBlock,
                    toBlock,
                  }),
                ]);

                for (const log of [...incoming, ...outgoing]) {
                  // topic[2] = "to"; si coincide con la wallet ⇒ ingreso.
                  const toTopic = log.topics?.[2]?.toLowerCase();
                  const isIncoming = toTopic === walletTopic;

                  // En viem v5 el log trae args decodificados con el evento.
                  const rawValue = log.args?.value;
                  const from = log.args?.from || '0x0';
                  const to = log.args?.to || '0x0';

                  tokenEvents.push({
                    id: `${net.chainId}:${log.transactionHash}:${log.logIndex}`,
                    chainId: net.chainId,
                    chainLabel: net.label,
                    explorer: net.explorer,
                    symbol: token.symbol,
                    tokenName: token.name,
                    decimals: token.decimals,
                    direction: isIncoming ? 'in' : 'out',
                    counterparty: isIncoming ? from : to,
                    amountFormatted: formatUnits(rawValue ?? 0n, token.decimals),
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                    // timestamp se completa abajo (cache por bloque).
                    timestamp: null,
                  });
                }

                // Siguiente tramo hacia atrás.
                if (fromBlock === 0n) break;
                cursor = fromBlock - 1n;
                scanned += TX_HISTORY_CHUNK_BLOCKS;
              }

              // Rellenar timestamps (uno por bloque, cacheado por chain).
              for (const ev of tokenEvents) {
                const cacheKey = `${ev.chainId}:${ev.blockNumber}`;
                if (tsCache.has(cacheKey)) {
                  ev.timestamp = tsCache.get(cacheKey);
                  continue;
                }
                try {
                  const client = getPublicClient(net.chainId, net.chain);
                  const block = await client.getBlock({ blockNumber: ev.blockNumber });
                  const ts = Number(block.timestamp) * 1000;
                  tsCache.set(cacheKey, ts);
                  ev.timestamp = ts;
                } catch {
                  ev.timestamp = null;
                }
              }

              allEvents.push(...tokenEvents);
            } catch (chainErr) {
              // No abortamos todas las chains por una que falle; logueamos y
              // seguimos. Si TODAS fallan, el listado quedará vacío.
              console.error(
                `Error cargando movimientos de ${token.symbol} (chain ${net.chainId}):`,
                chainErr,
              );
            }
          }),
      );

      await Promise.all(jobs);

      // Merge global: orden por bloques (no comparable entre chains) / timestamp.
      const merged = allEvents
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, TX_HISTORY_LIMIT);

      setRecentTransfers(merged);
    } catch (error) {
      console.error('Error general en fetchRecentTransfers:', error);
      setTransfersError(
        'No pudimos cargar los movimientos en este momento. Probá refrescar.',
      );
      setRecentTransfers([]);
    } finally {
      setTransfersLoading(false);
    }
  };

  // Carga el cashback (reintegros) del usuario autenticado.
  const fetchCashback = async () => {
    setCashbackLoading(true);
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/cashback`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setCashback(res.data.cashback || null);
    } catch (err) {
      console.error("Error cargando cashback:", err);
            setCashback(null);
    } finally {
            setCashbackLoading(false);
    }
  };

  // Carga el saldo de referidos (recompensas por compartir) del usuario.
  const fetchReferral = async () => {
    setReferralLoading(true);
    try {
            const token = await getAccessToken();
            const res = await axios.get(
              `${import.meta.env.VITE_SERVER_URL}/api/referral`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            setReferral(res.data.referral || null);
    } catch (err) {
            console.error("Error cargando referidos:", err);
            setReferral(null);
    } finally {
            setReferralLoading(false);
    }
  };

  // Resumen de recompensas (usable en checkout + retirable como referidor).
  const fetchRewardsSummary = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/rewards/summary`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.success) setRewardsSummary(res.data);
    } catch (err) {
      console.error("Error cargando resumen de recompensas:", err);
      setRewardsSummary(null);
    }
  };

  // Consulta el historial unificado al desplegar la tabla. Trae ambos
  // endpoints en paralelo y mergea las transacciones por fecha desc.
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
            const token = await getAccessToken();
            const [cbRes, refRes] = await Promise.all([
              axios.get(`${import.meta.env.VITE_SERVER_URL}/api/cashback`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
              axios.get(`${import.meta.env.VITE_SERVER_URL}/api/referral`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
            ]);

            const mapTx = (arr, source) =>
              (arr || []).map((tx) => ({ ...tx, source }));

            const merged = [
              ...mapTx(cbRes.data?.transactions, "cashback"),
              ...mapTx(refRes.data?.transactions, "referral"),
            ].sort(
              (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
            );

            setHistoryTxs(merged);
    } catch (err) {
            console.error("Error cargando historial de recompensas:", err);
            setHistoryTxs([]);
    } finally {
            setHistoryLoading(false);
    }
  };

  // Abre el modal de retiro para la fuente indicada ("cashback" | "referral").
  const openWithdrawModal = (source) => {
    const info =
            source === "cashback"
              ? { balance: cashback?.available ?? cashback?.balance ?? 0, minUsd: cashback?.minWithdrawalUsd ?? 5, allow: cashback?.allowWithdraw !== false }
              : { balance: rewardsSummary?.referrerWithdrawableUsd ?? 0, minUsd: referral?.minWithdrawalUsd ?? 5, allow: referral?.allowWithdraw !== false };
    setWithdrawAmount("");
    setWithdrawModal({ source, ...info });
  };

  // Confirma el retiro: descuenta el saldo al instante (sin aprobación),
  // igual que el cashback. El envío on-chain se resuelve aparte.
  const handleWithdraw = async () => {
    if (!withdrawModal) return;
    const amount = Number(withdrawAmount);
    const { source, balance, minUsd } = withdrawModal;

    if (!amount || amount <= 0) {
            return Swal.fire({ title: "Monto inválido", text: "Ingresá un monto mayor a 0.", icon: "warning", confirmButtonColor: "#F26722" });
    }
    if (amount < minUsd) {
            return Swal.fire({ title: "Monto mínimo", text: `El mínimo de retiro es US$ ${minUsd}.`, icon: "warning", confirmButtonColor: "#F26722" });
    }
    if (amount > balance) {
            return Swal.fire({ title: "Saldo insuficiente", text: "El monto supera tu saldo disponible.", icon: "warning", confirmButtonColor: "#F26722" });
    }

    try {
            setIsWithdrawing(true);
            const token = await getAccessToken();
            await axios.post(
              `${import.meta.env.VITE_SERVER_URL}/api/${source === "cashback" ? "cashback" : "referral"}/withdraw`,
              { amountUsd: amount },
              { headers: { Authorization: `Bearer ${token}` } },
            );

            const isDark = document.documentElement.classList.contains("dark");
            Swal.fire({
              title: "Retiro solicitado",
              text: `Registramos tu retiro de US$ ${amount.toFixed(2)}. Se acreditará a tu wallet a la brevedad.`,
              icon: "success",
              background: isDark ? "#1f2937" : "#ffffff",
              color: isDark ? "#f3f4f6" : "#1f2937",
              confirmButtonColor: "#F26722",
            });

            setWithdrawModal(null);
            // Refrescamos la fuente afectada y el historial si está abierto.
            if (source === "cashback") await fetchCashback();
            else await fetchReferral();
            if (isHistoryOpen) fetchHistory();
        } catch (err) {
            // Si el JWT de la sesión venció, cerramos sesión y redirigimos en
            // vez de mostrar un error genérico y dejar la UI "viva" pero muerta.
            if (isJwtExpiredError(err)) {
              setWithdrawModal(null);
              handleUnauthorized();
              return;
            }
            const message =
              err?.response?.data?.error ||
              err?.response?.data?.message ||
              "No se pudo procesar el retiro. Intentá nuevamente.";
            Swal.fire({ title: "No se pudo retirar", text: message, icon: "error", confirmButtonColor: "#F26722" });
        } finally {
            setIsWithdrawing(false);
    }
  };

  // Solicita el CLAIM del saldo a favor como vendedor (SellerCredit pendiente).
  // En esta etapa es off-chain/manual: marca los créditos como "claimed" y la
  // plataforma transfiere el monto a la wallet del vendedor. Pedimos confirmación
  // explícita porque es una acción de "reclamo" de dinero.
    const handleClaimSellerCredit = async () => {
    const total = Number(rewardsSummary?.sellerCreditClaimableUsd || 0);
    if (total <= 0) return;

    const isDark = document.documentElement.classList.contains("dark");
    const confirm = await Swal.fire({
      icon: "question",
      title: "Reclamar saldo a favor",
      html: `Se solicitará el pago de <b>US$ ${total.toFixed(2)}</b> a favor tuyo (producto de compras pagadas con saldo de recompensas). La plataforma procesará la transferencia a tu billetera a la brevedad.`,
      showCancelButton: true,
      confirmButtonText: "Solicitar claim",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#F26722",
      cancelButtonColor: "#6b7280",
      background: isDark ? "#252525" : "#fff",
      color: isDark ? "#fff" : "#111",
    });
    if (!confirm.isConfirmed) return;

    try {
      setIsClaimingSeller(true);
      const token = await getAccessToken();
      const res = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/rewards/seller-claim`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      Swal.fire({
        title: "Claim solicitado",
        text:
          res.data?.message ||
          `Registramos tu saldo a favor de US$ ${total.toFixed(2)}. Se acreditará a tu billetera a la brevedad.`,
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });

      // Refrescamos el resumen para reflejar el saldo pendiente ya reclamado.
      await fetchRewardsSummary();
    } catch (err) {
      if (isJwtExpiredError(err)) {
        handleUnauthorized();
        return;
      }
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "No se pudo procesar el claim. Intentá nuevamente.";
      Swal.fire({
        title: "No se pudo reclamar",
        text: message,
        icon: "error",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsClaimingSeller(false);
    }
  };

  // Verifica si el usuario tiene publicaciones creadas, para considerarlo
  // vendedor incluso cuando el flag isSeller de la BD no se actualiza.
    const checkSellerByProducts = async () => {
    try {
      const token = await getAccessToken();
            // Pedimos solo 1 producto: alcanza para saber si es vendedor y evita
      // traer todo el catálogo (un vendedor masivo puede tener miles).
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/product/my-products?limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // `total` es el conteo real del vendedor (no depende de la página).
      setHasProducts(Number(res.data?.total ?? res.data?.count ?? 0) > 0);
    } catch (err) {
      console.error("Error verificando publicaciones del usuario:", err);
      setHasProducts(false);
    }
  };

    // Envía tokens desde la wallet Crossmint del usuario (device signer, sin OTP).
  // Reutiliza el mismo modal que el resto de los tokens.
    const handleSend = async () => {
    if (!selectedToken) return;
    const isDark = document.documentElement.classList.contains("dark");

    // La red donde vive el token: la firma la hace la smart wallet EN esa red.
    const chainName = NETWORK_CHAIN_NAME[selectedToken.chainId];

    // ── ANTI-ABUSO (1/2): cuota de frecuencia + monto mínimo ──
    // Los envíos son el flujo de MAYOR riesgo (cualquier user con wallet).
    // checkOpRateLimit valida el monto mínimo (siempre) y la cuota/hora (sólo
    // si OP_POLICY.enforce=true). En testnet enforce=false → sólo avisa.
    const limit = checkOpRateLimit({
      address: walletAddress,
      chain: chainName,
      opType: "send",
      amountUsd: Number(sendForm.amount),
    });
    if (limit.belowMin) {
      // El mínimo lo valida el backend/modal; acá reforzamos con un mensaje claro.
      return Swal.fire({
        title: "Monto mínimo",
        text: describeLimit(limit),
        icon: "warning",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    }
    if (limit.blocked) {
      return Swal.fire({
        title: "Límite de envíos",
        text: describeLimit(limit),
        icon: "warning",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    }

    setIsSending(true);
    try {
            // Resolvemos el locator del token que espera Crossmint.
            //   - Native (POL/ETH/BNB): Crossmint usa su símbolo nativo.
            //   - ERC-20: preferimos el locator de Crossmint (p. ej. "usdxm") cuando
            //     lo conocemos; si no, caemos a la dirección del contrato.
            const tokenLocator = selectedToken.native
              ? selectedToken.symbol.toLowerCase()
              : (selectedToken.locator || selectedToken.address);

            // ── GAS PATROCINADO: garantizar gas nativo antes de firmar ──
            // La firma es client-side, así que el backend no ve la tx. Le
            // pedimos que haga el "drip" de gas (BNB/POL/ETH) para que la
            // smart wallet tenga con qué firmar. Es idempotente: si ya tiene
            // gas, responde sin gastar nada.
            const gas = await ensureGas({
              chain: chainName,
              opType: "send",
              getAccessToken,
            });
            if (!gas.ok) {
              return Swal.fire({
                title: gas.rateLimited ? "Límite alcanzado" : "No se pudo preparar el envío",
                text: gas.message,
                icon: "warning",
                background: isDark ? "#1f2937" : "#ffffff",
                color: isDark ? "#f3f4f6" : "#1f2937",
                confirmButtonColor: "#F26722",
              });
            }

            await sendToken({
              to: sendForm.to,
              token: tokenLocator,
              amount: sendForm.amount,
              chain: chainName,
            });

            // ── ANTI-ABUSO (2/2): registrar la operación exitosa ──
            registerOp({ address: walletAddress, chain: chainName, opType: "send" });

      Swal.fire({
        title: "¡Envío exitoso!",
        text: `Tus ${selectedToken.symbol} fueron enviados correctamente.`,
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });

      setIsModalOpen(false);
      setSendForm({ to: "", amount: "" });
            // Refrescamos balances tras un breve delay para dejar minar la tx.
      setTimeout(() => fetchAllBalances(), 3000);
      // Y el historial de movimientos on-chain.
      setTimeout(() => fetchRecentTransfers(), 3000);
    } catch (error) {
      console.error("Error en envío:", error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "La transacción falló o fue rechazada. Verificá el saldo y la dirección, e intentá nuevamente.";
      const isDark = document.documentElement.classList.contains("dark");
      Swal.fire({
        title: "Envío fallido",
        text: message,
        icon: "error",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsSending(false);
    }
  };

        useEffect(() => {
    if (authenticated) {
      // El cashback vive en la BD de la plataforma (no on-chain), por lo que
      // lo cargamos siempre, incluso si todavía no tiene wallet web3 creada.
      fetchCashback();
      // El saldo de referidos también vive en la BD: se carga siempre.
      fetchReferral();
      fetchRewardsSummary();
      // Verificamos si el usuario es vendedor (tiene publicaciones creadas).
      checkSellerByProducts();
            if (hasWallet) {
        fetchAllBalances();
        // Movimientos on-chain (ingresos/egresos) de las stablecoins.
        fetchRecentTransfers();
        // ¿Ya está activado el dispositivo en todas las redes? (flag local)
        setActivatedAll(
          isDeviceActivatedForAll({ address: walletAddress, chains: APP_EVM_CHAINS }),
        );
      }
    }
  }, [authenticated, walletAddress]);

  if (!authenticated) return null;

  // 🔴 VISTA CUANDO EL USUARIO NO TIENE WALLET
  if (!hasWallet) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white dark:bg-[#252525] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xl text-center space-y-6">
        <div className="w-20 h-20 bg-[#F26722]/10 rounded-full flex items-center justify-center mx-auto">
          <Wallet className="text-[#F26722]" size={40} />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white">
            Activa tu Billetera
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
            Actualmente no posees una billetera Web3 vinculada. Generala en un solo clic para operar, recibir pagos y gestionar tus garantías.
          </p>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/30 text-left flex flex-col items-start gap-3">
          {/* <Sparkles className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} /> */}
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Sin frases de recuperación ni instalaciones extras. Tu billetera estará resguardada de forma segura mediante tu cuenta de acceso.
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 italic">
            *No somos custodios de los fondos de tu billetera, no tenemos acceso a tus claves privadas. Es tu responsabilidad mantener tu cuenta segura y no compartir tus credenciales con nadie.
            Para mas informacion sobre tu billetera, vista nuestra pagina de <a href="/ayuda" className="underline hover:text-amber-600 dark:hover:text-amber-400">ayuda</a>
          </p>
        </div>

        <button
          onClick={handleCreateWallet}
          disabled={isCreatingWallet}
          className="w-full py-4 bg-[#F26722] hover:brightness-110 text-white rounded-2xl font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#F26722]/20 disabled:opacity-50"
        >
          {isCreatingWallet ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Generando billetera...</span>
            </>
                                        ) : (
            <>
              <PlusCircle size={20} />
              <span>Crear mi Billetera</span>
            </>
          )}
        </button>

                {/* Saldo acumulado de recompensas (cashback + referidos, en BD,
            visible aunque todavía no tenga wallet web3 creada) */}
        <div className="w-full text-left mt-6 p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/30">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
              <Gift className="text-emerald-600" size={20} />
            </div>
            <h3 className="font-bold text-sm dark:text-white">
              Tus recompensas acumuladas
            </h3>
          </div>
          {(cashbackLoading || referralLoading) && !cashback ? (
            <div className="py-3">
              <LoadingSpinner size="sm" text="Cargando saldo..." />
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Saldo de recompensas (para usar en checkout):{" "}
                <b className="text-emerald-600 dark:text-emerald-400">

                  US$ {(rewardsSummary?.usable?.totalUsableUsd ?? (((cashback?.available ?? cashback?.balance ?? 0) + (referral?.balance ?? 0)))).toFixed(2)} USDT
                </b>
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Cashback: US$ {(cashback?.available ?? cashback?.balance ?? 0).toFixed(2)} · Reintegro por referidos: US$ {(rewardsSummary?.usable?.referralUsd ?? 0).toFixed(2)}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                Activá tu wallet para poder usar tus recompensas al comprar.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // 🟢 VISTA NORMAL CUANDO SÍ TIENE WALLET
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold dark:text-white">Mi Billetera</h2>
        <button 
          onClick={fetchAllBalances} 
          disabled={isLoading} 
          className="flex items-center gap-2 text-sm text-blue-600 font-medium disabled:opacity-50 hover:underline"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" />
              Actualizando...
            </>
          ) : (
            <>
              <RefreshCcw size={16} />
              Actualizar
            </>
          )}
        </button>
      </div>
       <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
        <Wallet className="text-blue-600 mt-1" size={20} />
        <div className="flex-1">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
            Dirección de depósito (la misma en todas las redes)
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-blue-600/70 break-all">{walletAddress}</p>
            <button
              onClick={handleCopyAddress}
              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Copiar dirección"
            >
              <Copy size={14} className="text-blue-600 dark:text-blue-400" />
            </button>
          </div>
                              <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 mt-1">
            Podés recibir USDXM/USDC (Polygon Amoy), USDT (BSC) y USDC (Base) en esta misma dirección.
          </p>
                    <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 mt-1">
            No necesitás cargar cripto nativo para el gas: las comisiones de red las cubre la plataforma.
          </p>
          {/* Política anti-abuso: se muestra como referencia. Hoy OP_POLICY.enforce
              está en false (sólo aviso), por lo que no bloquea; el texto igual
              informa los límites para que el usuario sepa a qué atenerse. */}
          <p className="text-[11px] text-blue-600/60 dark:text-blue-400/60 mt-1">
            Límite de envíos: hasta {getOpLimit("send").maxPerHour} por hora ·
            mínimo US$ {getOpLimit("send").minUsd} por envío.
          </p>
        </div>
      </div>    
            {/* Saldos por red: la MISMA address en todas las redes EVM soportadas. */}
      <div className="space-y-5">
        {WALLET_NETWORKS.map((net) => (
          <div key={net.chainId}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {net.label}
              </span>
              <a
                href={`${net.explorer}/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-600 hover:underline"
              >
                ver en explorer
              </a>
            </div>
                                    {/* Un solo token (stablecoin) por red: una única tarjeta de ancho
                tope (max-w) para que no quede un hueco vacío al lado. */}
            <div className="flex flex-col gap-4">
              {net.tokens.map((token) => {
                const key = balanceKey({ ...token, chainId: net.chainId });
                const tokenWithChain = {
                  ...token,
                  chainId: net.chainId,
                  chain: net.chain,
                };
                return (
                  <div
                    key={key}
                    className="group w-full sm:max-w-sm px-5 py-4 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TokenIcon symbol={token.symbol} size={34} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                          {token.name}
                        </p>
                        <p className="text-lg font-bold leading-tight dark:text-white">
                          {isLoading
                            ? '...'
                            : parseFloat(balances[key] || 0).toLocaleString(
                                undefined,
                                { minimumFractionDigits: 2 },
                              )}
                          <span className="ml-1.5 text-xs font-medium text-gray-400">
                            {token.symbol}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedToken(tokenWithChain);
                        setSendForm({ to: '', amount: '' });
                        setIsModalOpen(true);
                      }}
                      className="flex items-center justify-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shrink-0"
                    >
                      <span className="font-bold text-xs">Enviar</span>
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
      </div>
        ))}
      </div>

      {/* ────────────────────────────────────────────────
          ÚLTIMOS MOVIMIENTOS ON-CHAIN
          Se leen de los eventos ERC-20 `Transfer` de cada red. Muestra
          ingresos y egresos de las stablecoins (hoy: USDXM, USDT, USDC)
          en las últimas transacciones. Se refresca con el botón o al
          enviar fondos. Sin backend: lectura directa del RPC.
      ──────────────────────────────────────────────── */}
      <section className="p-6 bg-white dark:bg-[#252525] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold text-lg flex items-center gap-2 dark:text-white">
            <History className="text-[#F26722]" size={20} />
            Últimos movimientos
            <span className="text-xs font-normal text-zinc-400">
              (últimos {TX_HISTORY_LIMIT})
            </span>
          </h3>
          <button
            onClick={fetchRecentTransfers}
            disabled={transfersLoading}
            className="flex items-center gap-1.5 text-xs text-[#F26722] font-medium hover:underline disabled:opacity-50"
          >
            {transfersLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <RefreshCcw size={14} />
            )}
            Actualizar
          </button>
        </div>

        {transfersLoading ? (
          <div className="py-8 text-center">
            <LoadingSpinner size="md" text="Buscando movimientos on-chain..." />
          </div>
        ) : transfersError ? (
          <p className="text-sm text-red-500 py-6 text-center">
            {transfersError}
          </p>
        ) : recentTransfers.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-6 text-center">
            Todavía no hay movimientos en tus redes.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Red / Token</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Contraparte</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Monto</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentTransfers.map((tx) => {
                  const isIn = tx.direction === 'in';
                  return (
                    <tr
                      key={tx.id}
                      className="dark:text-zinc-200 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400 text-xs">
                        {tx.timestamp
                          ? new Date(tx.timestamp).toLocaleString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isIn
                              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                              : 'bg-orange-100 dark:bg-orange-950/40 text-[#F26722]'
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownLeft size={12} />
                          ) : (
                            <ArrowOut size={12} />
                          )}
                          {isIn ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <TokenIcon symbol={tx.symbol} size={20} />
                          <span className="text-xs">
                            <span className="block font-semibold text-zinc-700 dark:text-zinc-200">
                              {tx.symbol}
                            </span>
                            <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                              {tx.chainLabel}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        {isIn ? 'de' : 'a'} {tx.counterparty?.slice(0, 6)}…
                        {tx.counterparty?.slice(-4)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-bold whitespace-nowrap ${
                          isIn
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {isIn ? '+' : '−'}
                        {parseFloat(tx.amountFormatted || 0).toLocaleString(
                          undefined,
                          { minimumFractionDigits: 2, maximumFractionDigits: 6 },
                        )}{' '}
                        <span className="text-xs font-medium text-zinc-400">
                          {tx.symbol}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <a
                          href={`${tx.explorer}/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                          title="Ver transacción en el explorer"
                        >
                          ver
                          <ExternalLink size={11} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3">
          Se muestran las últimas {TX_HISTORY_LIMIT} transferencias de
          stablecoins detectadas en tus redes. Las comisiones de red (gas) no
          aparecen porque las cubre la plataforma.
        </p>
      </section>


     

            {/* ACTIVAR BILLETERA: OCULTO por ahora.
                En pruebas, la smart wallet de Crossmint firma SIN activación previa
                (el OTP solo aparece si el SDK lo pide, vía el CrossmintOtpModal
                global). El aviso proactivo resultaba ruido innecesario, así que se
                oculta. Si en algún dispositivo el SDK pide OTP, el modal real lo
                gestiona en el momento. Para reactivar la UI, poner
                SHOW_ACTIVATION_UI = true. */}
            {SHOW_ACTIVATION_UI && !activatedAll && (
      <div className="p-4 bg-[#F26722]/5 dark:bg-[#F26722]/10 rounded-xl border border-[#F26722]/20 flex items-start gap-3 flex-wrap">
        <Sparkles className="text-[#F26722] mt-1 shrink-0" size={20} />
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-bold text-[#F26722]">
            Activá tu billetera para operar
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
            Habilitá las firmas para <b>depositar garantías y pagar</b>. Recibirás un código
            de verificación por email desde <b>Crossmint</b> (no de Mercado Nero). Se pide
            una sola vez por dispositivo.
          </p>
        </div>
        <button
          onClick={handleActivate}
          disabled={isActivating}
          className="px-4 py-2.5 rounded-xl font-bold text-sm bg-[#F26722] hover:brightness-110 text-white disabled:opacity-60 flex items-center justify-center gap-2 shrink-0"
        >
          {isActivating ? (
            <>
              <LoadingSpinner size="sm" />
              Activando...
            </>
          ) : (
            <>
              <ShieldCheck size={16} />
              Activar
            </>
          )}
        </button>
      </div>
      )}

                        {/* ────────────────────────────────────────────────
          BILLETERA DE RECOMPENSAS
          Un único fondo de recompensas (cashback + referidos) que se
          presenta en DOS tarjetas para ver el desglose por fuente. El
          total combinado es la suma de ambos saldos. El detalle de
          movimientos se consulta bajo demanda (tabla desplegable).
      ──────────────────────────────────────────────── */}
      <section className="p-6 bg-white dark:bg-[#252525] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold text-lg flex items-center gap-2 dark:text-white">
            <Gift className="text-[#F26722]" size={22} />
            Billetera de Recompensas
          </h3>
          <button
            onClick={() => { fetchCashback(); fetchReferral(); fetchRewardsSummary(); if (isHistoryOpen) fetchHistory(); }}
            disabled={cashbackLoading || referralLoading}
            className="flex items-center gap-1.5 text-xs text-[#F26722] font-medium hover:underline disabled:opacity-50"
          >
            {(cashbackLoading || referralLoading) ? (
              <LoadingSpinner size="sm" />
            ) : (
              <RefreshCcw size={14} />
            )}
            Actualizar
          </button>
        </div>

        {/* Total combinado: cashback + referidos = mismo fondo */}
        <div className="mb-5 p-5 rounded-2xl bg-gradient-to-r from-[#F26722]/10 to-emerald-500/10 border border-[#F26722]/20 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">
              Total disponible en recompensas
            </p>
            <p className="text-3xl font-black text-[#F26722] mt-1">
              US$ {(rewardsSummary?.usable?.totalUsableUsd ?? (((cashback?.available ?? cashback?.balance ?? 0) + (referral?.balance ?? 0)))).toFixed(2)}
            </p>
          </div>
          <div className="max-w-[18rem] text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
            <p>
              <b className="text-emerald-600 dark:text-emerald-400">
                US$ {(rewardsSummary?.usable?.totalUsableUsd ?? 0).toFixed(2)}
              </b>{" "}
              para usar en el checkout (cashback + reintegros).
            </p>
            {isApprovedReferrer && (
              <p>
                <b className="text-[#F26722]">
                  US$ {(rewardsSummary?.referrerWithdrawableUsd ?? 0).toFixed(2)}
                </b>{" "}
                retirables a tu wallet (ganancia como referidor).
              </p>
            )}
          </div>
        </div>

        {/* SALDO A FAVOR COMO VENDEDOR (SellerCredit).
            Solo vendedores. Aparece cuando algún comprador pagó con saldo de
            recompensas: el vendedor cobró menos en el escrow y la plataforma
            le queda debiendo ese monto. Se puede solicitar el claim. */}
        {isSeller && (rewardsSummary?.sellerCreditPendingUsd ?? 0) > 0 && (
          <div className="mb-5 p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/30">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
                  <HandCoins className="text-indigo-600" size={20} />
                </div>
                <div>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300 font-bold uppercase tracking-widest">
                    Saldo a favor como vendedor
                  </p>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                    US$ {(rewardsSummary?.sellerCreditPendingUsd ?? 0).toFixed(2)}
                  </p>
                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-md">
                    Es la plata que la plataforma te debe porque tus compradores
                    pagaron usando saldo de recompensas (vos cobraste menos en el
                    pago directo). Se te transfiere a tu billetera: la parte de
                    órdenes <b>completadas</b> ya se puede reclamar; el resto se
                    acredita al cerrarse cada venta.
                    {rewardsSummary?.sellerCreditPendingCount
                      ? ` (${rewardsSummary.sellerCreditPendingCount} orden(es))`
                      : ""}
                  </p>
                  <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 mt-1">
                    Reclamable ahora: US$ {(rewardsSummary?.sellerCreditClaimableUsd ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
                            <button
                onClick={handleClaimSellerCredit}
                disabled={isClaimingSeller || (rewardsSummary?.sellerCreditClaimableUsd ?? 0) <= 0}
                className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 flex items-center justify-center gap-2"
                title={
                  (rewardsSummary?.sellerCreditClaimableUsd ?? 0) <= 0
                    ? "Se podrá reclamar cuando se completen las ventas"
                    : "Solicitar el pago a tu billetera"
                }
              >
                {isClaimingSeller ? <LoadingSpinner size="sm" /> : <HandCoins size={16} />}
                Reclamar
              </button>
            </div>

                        {/* Detalle por orden: PLEGABLE (oculto por defecto). Se despliega
                al clickear, igual que "Ver historial de movimientos", para no
                ocupar media pantalla. Muestra los últimos 10 + "Cargar más". */}
            {Array.isArray(rewardsSummary?.sellerCreditItems) &&
              rewardsSummary.sellerCreditItems.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setIsSellerCreditOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white/60 dark:bg-zinc-900/40 border border-indigo-200 dark:border-indigo-900/30 hover:bg-white dark:hover:bg-zinc-900/70 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      <History size={16} className="text-indigo-500" />
                      Ver detalle de ventas ({rewardsSummary.sellerCreditItems.length})
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-indigo-400 transition-transform ${isSellerCreditOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isSellerCreditOpen && (() => {
                    const items = rewardsSummary.sellerCreditItems;
                    const shown = items.slice(0, sellerCreditVisible);
                    const hasMore = items.length > shown.length;
                    // Barra de scroll interna: limita la altura visible (~10 filas)
                    // para que la sección NO se estire si hay decenas de ventas.
                    return (
                      <div className="mt-3 rounded-xl border border-indigo-200 dark:border-indigo-900/30">
                        <div className="max-h-80 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 sticky top-0 z-[1]">
                              <tr className="text-left">
                                <th className="px-4 py-2 font-bold text-[11px] uppercase tracking-wide">Fecha</th>
                                <th className="px-4 py-2 font-bold text-[11px] uppercase tracking-wide">Orden</th>
                                <th className="px-4 py-2 font-bold text-[11px] uppercase tracking-wide text-right">Monto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-indigo-100 dark:divide-indigo-900/30 bg-white dark:bg-zinc-900/30">
                              {shown.map((item, idx) => (
                                <tr key={idx} className="dark:text-zinc-200">
                                  <td className="px-4 py-2 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                                    {item.createdAt
                                      ? new Date(item.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
                                      : "—"}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-xs font-mono">
                                    #{item.code || "------"}
                                  </td>
                                  <td className="px-4 py-2 text-right font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                    US$ {Number(item.amountUsd || 0).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {hasMore && (
                          <button
                            onClick={() => setSellerCreditVisible((n) => n + 10)}
                            className="w-full py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors border-t border-indigo-200 dark:border-indigo-900/30"
                          >
                            Cargar más ({items.length - shown.length} restantes)
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
          </div>
        )}

        {/* Dos tarjetas: Cashback y Referidos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* TARJETA CASHBACK */}
          <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/30 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
                <BadgePercent className="text-emerald-600" size={18} />
              </div>
              <span className="font-bold text-sm dark:text-white">Cashback</span>
            </div>
            <div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium uppercase tracking-wide">Saldo disponible</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                US$ {(cashback?.available ?? cashback?.balance ?? 0).toFixed(2)}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Reintegrado histórico: US$ {(cashback?.earned ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="mt-auto pt-2 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900/30 px-3 py-2 text-center">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                Se usa como saldo de recompensas en el checkout
              </p>
            </div>
          </div>

          {/* TARJETA REFERIDOS */}
          <div className="p-5 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/30 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
                <Users className="text-[#F26722]" size={18} />
              </div>
              <span className="font-bold text-sm dark:text-white">
                {isApprovedReferrer
                  ? "Recompensas por Referidos"
                  : "Recompensas por enlace de referidos"}
              </span>
            </div>
            {isApprovedReferrer ? (
              <>
                <div>
                  <p className="text-xs text-orange-700 dark:text-orange-300 font-medium uppercase tracking-wide">Retirable (como referidor)</p>
                  <p className="text-2xl font-black text-[#F26722]">
                    US$ {(rewardsSummary?.referrerWithdrawableUsd ?? 0).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Ganado histórico: US$ {(referral?.earned ?? 0).toFixed(2)}
                    {referral?.referralsCount ? ` · ${referral.referralsCount} referido(s)` : ""}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Tu reintegro como comprador se usa en el checkout, no se retira.
                  </p>
                </div>
                <button
                  onClick={() => openWithdrawModal("referral")}
                  disabled={(rewardsSummary?.referrerWithdrawableUsd ?? 0) < (referral?.minWithdrawalUsd ?? 5)}
                  className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm transition-all bg-[#F26722] hover:brightness-110 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    (rewardsSummary?.referrerWithdrawableUsd ?? 0) < (referral?.minWithdrawalUsd ?? 5)
                      ? `Mínimo US$ ${referral?.minWithdrawalUsd ?? 5}`
                      : "Retirar ganancia como referidor"
                  }
                >
                  Retirar
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-orange-700 dark:text-orange-300 font-medium uppercase tracking-wide">Saldo disponible</p>
                  <p className="text-2xl font-black text-[#F26722]">
                    US$ {(rewardsSummary?.usable?.referralUsd ?? 0).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Reintegro por comprar con enlaces de referidos.
                  </p>
                </div>
                <div className="mt-auto pt-2 rounded-xl bg-[#F26722]/10 border border-[#F26722]/20 px-3 py-2 text-center">
                  <p className="text-[11px] font-bold text-[#F26722]">
                    Se usa como saldo de recompensas en el checkout
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Historial unificado bajo demanda */}
        <div className="mt-5">
          <button
            onClick={() => {
              const next = !isHistoryOpen;
              setIsHistoryOpen(next);
              // Consultamos la BD recién al abrir (no antes).
              if (next) fetchHistory();
            }}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-bold dark:text-white">
              <History size={16} className="text-zinc-500" />
              Ver historial de movimientos
            </span>
            <ChevronDown
              size={18}
              className={`text-zinc-400 transition-transform ${isHistoryOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isHistoryOpen && (
            <div className="mt-3">
              {/* Filtro por origen */}
              <div className="flex items-center gap-2 mb-3">
                {[
                  { key: "all", label: "Todos" },
                  { key: "cashback", label: "Cashback" },
                  { key: "referral", label: "Referidos" },
                ].map((opt) => (
                                    <button
                    key={opt.key}
                    onClick={() => {
                      setHistorySource(opt.key);
                      // Al cambiar de filtro volvemos a mostrar solo los últimos
                      // 10 (evita arrastrar un "cargar más" ya expandido a otro
                      // subconjunto con menos filas).
                      setHistoryVisible(10);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      historySource === opt.key
                        ? "bg-[#F26722] text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {historyLoading ? (
                <div className="py-8 text-center">
                  <LoadingSpinner size="md" text="Cargando historial..." />
                </div>
              ) : (() => {
                const rows = historyTxs.filter(
                  (tx) => historySource === "all" || tx.source === historySource,
                );
                if (rows.length === 0) {
                  return (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 py-6 text-center">
                      {historySource === "referral"
                        ? "Todavía no tenés recompensas por referidos."
                        : historySource === "cashback"
                          ? "Todavía no tenés movimientos de cashback."
                          : "Todavía no tenés movimientos de recompensas."}
                    </p>
                  );
                }
                                // Paginación "ver más": mostramos sólo los primeros
                // `historyVisible` para no estirar el scroll, y sumamos de a 10.
                const shown = rows.slice(0, historyVisible);
                const hasMore = rows.length > shown.length;
                return (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="max-h-96 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400 sticky top-0 z-[1]">
                        <tr className="text-left">
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Fecha</th>
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Origen</th>
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Descripción</th>
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {shown.map((tx, idx) => {
                          const isEarned = tx.type === "earned";
                          return (
                            <tr key={idx} className="dark:text-zinc-200">
                              <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400 text-xs">
                                {tx.createdAt
                                  ? new Date(tx.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
                                  : "—"}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  tx.source === "referral"
                                    ? "bg-orange-100 dark:bg-orange-950/40 text-[#F26722]"
                                    : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                                }`}>
                                  {tx.source === "referral" ? <Users size={12} /> : <BadgePercent size={12} />}
                                  {tx.source === "referral" ? "Referidos" : "Cashback"}
                                </span>
                              </td>
                                                            <td className="px-4 py-2.5">
                                <span className="block">
                                  {tx.description || (isEarned ? "Reintegro" : "Movimiento")}
                                </span>
                                {tx.source === "referral" && (tx.productTitle || tx.role) && (
                                  <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                    {tx.role === "referrer"
                                      ? "Como referidor"
                                      : tx.role === "buyer"
                                        ? "Como comprador (reintegro)"
                                        : ""}
                                    {tx.role && tx.productTitle ? " · " : ""}
                                    {tx.productTitle || ""}
                                  </span>
                                )}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold whitespace-nowrap ${
                                Number(tx.amount) >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-zinc-500 dark:text-zinc-400"
                              }`}>
                                {Number(tx.amount) >= 0 ? "+" : ""}US$ {Math.abs(Number(tx.amount)).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                                            </tbody>
                    </table>
                    </div>
                    {hasMore && (
                      <button
                        onClick={() => setHistoryVisible((n) => n + 10)}
                        className="w-full py-2.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors border-t border-zinc-200 dark:border-zinc-800"
                      >
                        Cargar más ({rows.length - shown.length} restantes)
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>


            {/* ── GARANTÍAS DE VENDEDOR ──
           Solo visible para vendedores. Como es una sección de uso
           esporádico, se muestra plegada y se despliega a pedido. */}
      {isSeller && (
        <section className="bg-white dark:bg-[#252525] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <button
            onClick={() => setIsCollateralOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-5 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="text-lg font-bold dark:text-white">Garantías de Vendedor</span>
              <span className="text-xs text-gray-400">Gestión de colateral para vender</span>
            </span>
            <ChevronDown
              size={20}
              className={`text-gray-400 transition-transform ${isCollateralOpen ? "rotate-180" : ""}`}
            />
          </button>
          {isCollateralOpen && (
            <div className="px-5 pb-5">
              <CollateralManager />
            </div>
          )}
        </section>
      )}

      {/* MODAL DE RETIRO (cashback o referidos) */}
      {withdrawModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${withdrawModal.source === "referral" ? "bg-orange-100 dark:bg-orange-950/40" : "bg-emerald-100 dark:bg-emerald-950/30"}`}>
                {withdrawModal.source === "referral"
                  ? <Users className="text-[#F26722]" size={20} />
                  : <BadgePercent className="text-emerald-600" size={20} />}
              </div>
              <div>
                <h3 className="font-black text-lg dark:text-white">
                  Retirar {withdrawModal.source === "referral" ? "referidos" : "cashback"}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Saldo disponible: US$ {withdrawModal.balance.toFixed(2)}
                </p>
              </div>
            </div>

            {withdrawModal.allow === false ? (
              <p className="text-sm text-red-500">
                El retiro está deshabilitado por la plataforma.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">
                    Monto (mín. US$ {withdrawModal.minUsd})
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0.00"
                      className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 pr-16 text-sm outline-none focus:ring-2 focus:ring-[#F26722] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setWithdrawAmount(String(withdrawModal.balance))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#F26722] hover:underline"
                    >
                      Máx
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    La dirección de destino es tu wallet vinculada. El depósito se acredita a la brevedad.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setWithdrawModal(null)}
                    disabled={isWithdrawing}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleWithdraw}
                    disabled={isWithdrawing}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm bg-[#F26722] text-white hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isWithdrawing ? <LoadingSpinner size="sm" /> : null}
                    Confirmar retiro
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

            <SendTokenModal  
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        token={selectedToken} 
        balance={
          selectedToken
            ? balances[balanceKey(selectedToken)]
            : undefined
        } 
        formData={sendForm} 
        setFormData={setSendForm} 
        onConfirm={handleSend} 
        isLoading={isSending} 
      />
    </div>
  );
}