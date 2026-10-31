import { useEffect, useState } from 'react';
import { usePrivy } from "../../Utils/authClient";
import { createPublicClient, http, formatUnits } from 'viem';
import { polygonAmoy, bscTestnet, baseSepolia } from 'viem/chains';

import { Wallet, RefreshCcw, ArrowUpRight, Copy, PlusCircle, Sparkles, BadgePercent, ChevronDown, Gift, Users, History, ShieldCheck } from 'lucide-react';
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

  const [balances, setBalances] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  // ¿El dispositivo ya está activado en todas las redes? Se relee tras activar.
  const [activatedAll, setActivatedAll] = useState(false);

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
              ? { balance: cashback?.balance ?? 0, minUsd: cashback?.minWithdrawalUsd ?? 5, allow: cashback?.allowWithdraw !== false }
              : { balance: referral?.balance ?? 0, minUsd: referral?.minWithdrawalUsd ?? 5, allow: referral?.allowWithdraw !== false };
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
    setIsSending(true);
    try {
      const isDark = document.documentElement.classList.contains("dark");

            // Resolvemos el locator del token que espera Crossmint.
            //   - Native (POL/ETH/BNB): Crossmint usa su símbolo nativo.
            //   - ERC-20: preferimos el locator de Crossmint (p. ej. "usdxm") cuando
            //     lo conocemos; si no, caemos a la dirección del contrato.
            const tokenLocator = selectedToken.native
              ? selectedToken.symbol.toLowerCase()
              : (selectedToken.locator || selectedToken.address);

            // La red donde vive el token: la firma la hace la smart wallet EN esa red.
            const chainName = NETWORK_CHAIN_NAME[selectedToken.chainId];

            await sendToken({
              to: sendForm.to,
              token: tokenLocator,
              amount: sendForm.amount,
              chain: chainName,
            });

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
      // Verificamos si el usuario es vendedor (tiene publicaciones creadas).
      checkSellerByProducts();
      if (hasWallet) {
        fetchAllBalances();
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
                Total disponible (cashback + referidos):{" "}
                <b className="text-emerald-600 dark:text-emerald-400">
                  US$ {(((cashback?.balance ?? 0) + (referral?.balance ?? 0))).toFixed(2)} USDT
                </b>
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Cashback: US$ {(cashback?.balance ?? 0).toFixed(2)} · Referidos: US$ {(referral?.balance ?? 0).toFixed(2)}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                Activá tu wallet para poder usarlas o retirarlas.
              </p>
              <p className="text-xs text-zinc-500 italic dark:text-zinc-400 mt-2">
                *Uso habilitado a partir de 5 USDT.
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
            onClick={() => { fetchCashback(); fetchReferral(); if (isHistoryOpen) fetchHistory(); }}
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
              US$ {(((cashback?.balance ?? 0) + (referral?.balance ?? 0))).toFixed(2)}
            </p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[16rem]">
            Es un único fondo: podés retirarlo desde cualquiera de las dos fuentes. <br /> *Retiros habilitados a partir de 5 usd
          </p>
        </div>

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
                US$ {(cashback?.balance ?? 0).toFixed(2)}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Reintegrado histórico: US$ {(cashback?.earned ?? 0).toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => openWithdrawModal("cashback")}
              disabled={(cashback?.balance ?? 0) < (cashback?.minWithdrawalUsd ?? 5)}
              className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm transition-all bg-emerald-600 hover:brightness-110 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              title={(cashback?.balance ?? 0) < (cashback?.minWithdrawalUsd ?? 5) ? `Mínimo US$ ${cashback?.minWithdrawalUsd ?? 5}` : "Retirar cashback"}
            >
              Retirar
            </button>
          </div>

          {/* TARJETA REFERIDOS */}
          <div className="p-5 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/30 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
                <Users className="text-[#F26722]" size={18} />
              </div>
              <span className="font-bold text-sm dark:text-white">Recompensas por Referidos</span>
            </div>
            <div>
              <p className="text-xs text-orange-700 dark:text-orange-300 font-medium uppercase tracking-wide">Saldo disponible</p>
              <p className="text-2xl font-black text-[#F26722]">
                US$ {(referral?.balance ?? 0).toFixed(2)}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                Ganado histórico: US$ {(referral?.earned ?? 0).toFixed(2)}
                {referral?.referralsCount ? ` · ${referral.referralsCount} referido(s)` : ""}
              </p>
            </div>
            <button
              onClick={() => openWithdrawModal("referral")}
              disabled={referral?.allowWithdraw === false || (referral?.balance ?? 0) < (referral?.minWithdrawalUsd ?? 5)}
              className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm transition-all bg-[#F26722] hover:brightness-110 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                referral?.allowWithdraw === false
                  ? "Retiro de referidos deshabilitado"
                  : (referral?.balance ?? 0) < (referral?.minWithdrawalUsd ?? 5)
                    ? `Mínimo US$ ${referral?.minWithdrawalUsd ?? 5}`
                    : "Retirar referidos"
              }
            >
              Retirar
            </button>
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
                    onClick={() => setHistorySource(opt.key)}
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
                return (
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                        <tr className="text-left">
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Fecha</th>
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Origen</th>
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Descripción</th>
                          <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {rows.map((tx, idx) => {
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