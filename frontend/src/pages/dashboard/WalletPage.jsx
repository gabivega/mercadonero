import { useEffect, useState } from 'react';
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import { createPublicClient, http, formatUnits, createWalletClient, custom, parseUnits } from 'viem';
import { bscTestnet } from 'viem/chains';

import { Wallet, RefreshCcw, ArrowUpRight, Copy, PlusCircle, Sparkles, BadgePercent, ChevronDown, Gift, Users, History } from 'lucide-react';
import axios from 'axios';
import SendTokenModal from '../../components/SendTokenModal';
import Swal from 'sweetalert2';
import CollateralManager from '../../components/CollateralManager';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useUserStore } from '../../store/useUserStore';
import { getAuthenticatedWallet } from '../../Utils/walletSelector';


const TESTNET_TOKENS = [
  { 
    symbol: 'USDT', 
    name: 'Tether USD (Testnet)', 
    address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', 
    decimals: 18 
  },
  { 
    symbol: 'USDC', 
    name: 'USD Coin (Testnet)', 
    address: '0x64544969ed7EBf5f083679233325356EbE738930', 
    decimals: 18 
  },
  { symbol: 'BNB', name: 'Binance Coin', address: null, decimals: 18 },
];

const minERC20Abi = [
  { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  { constant: false, inputs: [{ name: "_to", type: "address" }, { name: "_value", type: "uint256" }], name: "transfer", outputs: [{ name: "success", type: "bool" }], type: "function" }
];

export default function WalletPage() {
  const { user, authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { dbUser } = useUserStore();

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

  // Verificación directa en el objeto user de Privy
  const hasWallet = Boolean(user?.wallet?.address);

  const handleCreateWallet = async () => {
    try {
      setIsCreatingWallet(true);
      await createWallet();
      
      const isDark = document.documentElement.classList.contains("dark");
      Swal.fire({
        title: "¡Billetera Creada!",
        text: "Tu billetera Web3 ha sido generada exitosamente.",
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    } catch (error) {
      console.error("Error al crear la wallet:", error);
      Swal.fire({
        title: "Error",
        text: "No se pudo generar la billetera. Inténtalo nuevamente.",
        icon: "error",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsCreatingWallet(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!user?.wallet?.address) return;
    try {
      await navigator.clipboard.writeText(user.wallet.address);
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

  const publicClient = createPublicClient({
    chain: bscTestnet,
    transport: http('https://bsc-testnet-rpc.publicnode.com')
  });

  const fetchAllBalances = async () => {
    if (!user?.wallet?.address) return;
    setIsLoading(true);

    try {
      const newBalances = {};

      await Promise.all(TESTNET_TOKENS.map(async (token) => {
        try {
          if (token.symbol === 'BNB') {
            const balanceRaw = await publicClient.getBalance({
              address: user.wallet.address,
            });
            newBalances[token.symbol] = formatUnits(balanceRaw, token.decimals);
          } else {
            const data = await publicClient.readContract({
              address: token.address,
              abi: minERC20Abi,
              functionName: 'balanceOf',
              args: [user.wallet.address],
            });
            newBalances[token.symbol] = formatUnits(data, token.decimals);
          }
        } catch (tokenError) {
          console.error(`Error cargando balance de ${token.symbol}:`, tokenError);
          newBalances[token.symbol] = "0.00";
        }
      }));

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
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/product/my-products`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setHasProducts(Number(res.data?.count ?? 0) > 0);
    } catch (err) {
      console.error("Error verificando publicaciones del usuario:", err);
      setHasProducts(false);
    }
  };

    const handleSend = async () => {
    try {
      setIsSending(true);
      // Usamos SIEMPRE la embedded wallet del usuario autenticado
      // (no `wallets[0]` que puede apuntar a otra wallet y causar
      // "User is not part of a key quorum").
      const wallet = getAuthenticatedWallet(wallets, user?.wallet?.address);
      if (!wallet) return;

      await wallet.switchChain(bscTestnet.id);
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        chain: bscTestnet, 
        transport: custom(provider) 
      });

      const amountInWei = parseUnits(sendForm.amount, selectedToken.decimals);
      
      let hash;

      if (selectedToken.symbol === 'BNB') {
        hash = await walletClient.sendTransaction({
          account: wallet.address,
          to: sendForm.to,
          value: amountInWei,
        });
      } else {
        hash = await walletClient.writeContract({
          address: selectedToken.address,
          abi: minERC20Abi,
          functionName: 'transfer',
          args: [sendForm.to, amountInWei],
          account: wallet.address,
        });
      }
      // ... existing code ...

      const isDark = document.documentElement.classList.contains("dark");

      Swal.fire({
        title: "¡Envío Exitoso!",
        html: `
          <p style="color: ${isDark ? "#9ca3af" : "#4b5563"}; margin-bottom: 8px;">
            Tu transacción fue procesada correctamente.
          </p>
          <p style="font-family: monospace; font-size: 12px; color: ${isDark ? "#60a5fa" : "#2563eb"}; word-break: break-all;">
            ${hash}
          </p>
        `,
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
        confirmButtonText: "Listo",
        showCancelButton: true,
        cancelButtonText: "Ver en explorador",
        cancelButtonColor: "#3483fa",
      }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
          window.open(`https://testnet.bscscan.com/tx/${hash}`, "_blank");
        }
      });
      setIsModalOpen(false);
      
      setTimeout(() => {
        fetchAllBalances();
      }, 2000);

    } catch (error) {
      console.error("Error envío:", error);
      const isDark = document.documentElement.classList.contains("dark");
      Swal.fire({
        title: "Envío Fallido",
        text: "La transacción falló o fue rechazada. Verificá el saldo y la dirección, e intentá nuevamente.",
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
      }
    }
  }, [authenticated, user?.wallet?.address]);

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
                *Retiros habilitados a partir de 5 USDT.
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TESTNET_TOKENS.map((token) => (
          <div key={token.symbol} className="p-6 bg-white dark:bg-[#252525] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold dark:text-gray-300">
                {token.symbol[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{token.name}</p>
                <p className="text-xl font-bold dark:text-white">
                  {isLoading ? "..." : parseFloat(balances[token.symbol] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} 
                  <span className="ml-2 text-sm font-normal text-gray-400">{token.symbol}</span>
                </p>
              </div>
            </div>
            <button 
              onClick={() => { setSelectedToken(token); setSendForm({to:'', amount:''}); setIsModalOpen(true); }}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all min-w-[100px]"
            >
              <span className="font-bold text-sm">Enviar</span>
              <ArrowUpRight size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
        <Wallet className="text-blue-600 mt-1" size={20} />
        <div className="flex-1">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Dirección de depósito (BSC)</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-blue-600/70 break-all">{user.wallet.address}</p>
            <button
              onClick={handleCopyAddress}
              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Copiar dirección"
            >
              <Copy size={14} className="text-blue-600 dark:text-blue-400" />
            </button>
          </div>
        </div>
      </div>

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
            Es un único fondo: podés retirarlo desde cualquiera de las dos fuentes.
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
                                {tx.description || (isEarned ? "Reintegro" : "Movimiento")}
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
        balance={balances[selectedToken?.symbol]} 
        formData={sendForm} 
        setFormData={setSendForm} 
        onConfirm={handleSend} 
        isLoading={isSending} 
      />
    </div>
  );
}