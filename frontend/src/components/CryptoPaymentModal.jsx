import React, { useState, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import axios from "axios";
import { X, Wallet, ShieldCheck, AlertTriangle, CheckCircle2, ArrowRight, Fuel } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import { bscTestnet } from "viem/chains";
import { getAuthenticatedWallet } from "../Utils/walletSelector";

// CONFIGURACION (debe coincidir con el backend y el deploy)
const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS;

// El TOKEN de pago es FIJO (USDT) y lo define el BACKEND (USDT_TOKEN_ADDRESS).
// El comprador NO elige token: el endpoint /escrow/prepare-funding devuelve
// tokenAddress, asi el front no hardcodea la direccion y siempre coincide con
// lo que espera el contrato/backend.
const PAYMENT_TOKEN_SYMBOL = "USDT";
const PAYMENT_TOKEN_DECIMALS = 18;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() public view returns (uint8)",
];

const ESCROW_ABI = [
  "function fundOrder(string _orderId, address _buyer, address _seller, address _tokenAddress, uint256 _amount) external",
  "function isFunded(string _orderId) external view returns (bool)",
  "function escrows(string) external view returns (address buyer, address seller, address token, uint256 amount, bool deposited, bool released, uint256 createdAt)",
];

export default function CryptoPaymentModal({
  order,
  onClose,
  onSuccess,
  getAccessToken,
  // Si es true (default, usado en el Checkout), cerrar el modal SIN fondear
  // descarta la orden provisional (evita órdenes huérfanas). Desde el detalle
  // de la orden se pasa false: ahí el usuario solo cierra el modal para
  // reintentar más tarde y NO queremos borrar su orden.
  autoRollbackOnClose = true,
}) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  // SIEMPRE la embedded wallet del usuario autenticado (no `wallets[0]`).
  const activeWallet = getAuthenticatedWallet(wallets, user?.wallet?.address);

  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("");
  const [balance, setBalance] = useState(null);
  // Datos que devuelve el backend (prepare-funding): token fijo + gas drip.
  const [prepared, setPrepared] = useState(null);
  const [prepError, setPrepError] = useState(null);

  // Marca si el fondeo se completó con éxito. Si el comprador cierra el modal
  // SIN haber fondeado, disparamos el rollback de la orden provisional para no
  // dejar órdenes huérfanas (creadas pero nunca pagadas).
  const fundedOkRef = useRef(false);

  // Monto total a pagar = total productos + envio en USD.
  const totalUsd =
    (order.financials?.totalUsd || 0) + (order.financials?.shippingCostUsd || 0);
  const amountStr = totalUsd > 0 ? totalUsd.toFixed(2) : "0.00";

  // Token FIJO: viene del backend (prepare-funding) o del guardado en la orden.
  const tokenAddress =
    prepared?.tokenAddress || order?.payment?.tokenAddress || "";
  const tokenSymbol =
    prepared?.token || order?.payment?.token || PAYMENT_TOKEN_SYMBOL;
  // Saldo insuficiente detectado por el backend (prepare-funding).
  const insufficient =
    !!prepError && /insuficiente|INSUFFICIENT_USDT/i.test(prepError);
  // Otro error de preparacion (gas/token/config): mostramos el mensaje
  // REAL y bloqueamos el boton en vez del criptico 'No pudimos determinar la moneda'.
  const prepFailed = !!prepError && !insufficient && !tokenAddress;

  // ── PREPARAR EL FONDEO (1 sola vez, al abrir el modal) ──
  // El backend: valida el saldo USDT on-chain, entrega el GAS DRIP (BNB) si
  // hace falta y devuelve la direccion FIJA del token. Asi el comprador nunca
  // se preocupa ni por el token ni por el gas.
  const prepareFunding = async () => {
    if (!order?._id) return;
    setPreparing(true);
    setPrepError(null);
    try {
      const accessToken = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}/escrow/prepare-funding`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (data?.success) {
        setPrepared(data);
        if (data.gasDripped) {
          setStatus("Te acreditamos un poco de BNB para cubrir el gas de la firma.");
        }
      } else {
        setPrepError(data?.message || "No se pudo preparar el pago.");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "No se pudo preparar el pago.";
      setPrepError(msg);
    } finally {
      setPreparing(false);
    }
  };

  // ── LEER BALANCE DEL TOKEN EN LA WALLET ACTIVA ──
  const fetchBalance = async () => {
    if (!activeWallet || !tokenAddress) return;
    try {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const bal = await erc20.balanceOf(activeWallet.address);
      setBalance(ethers.formatUnits(bal, PAYMENT_TOKEN_DECIMALS));
    } catch (err) {
      console.error("Error leyendo balance:", err);
      setBalance(null);
    }
  };

  // Al abrir: preparar fondeo (gas drip + token + validar saldo).
  React.useEffect(() => {
    prepareFunding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?._id]);

  React.useEffect(() => {
    if (activeWallet) fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWallet, tokenAddress]);

  // ── FONDEAR EL ESCROW ──
  // El approve es "maximo" (una sola vez): en las compras siguientes el
  // comprador firma UNA sola transaccion (fundOrder). El gas lo cubre el drip.
  const handleFund = async () => {
    if (!activeWallet) {
      Swal_alert("No tenés una wallet activa. Creá tu billetera desde 'Mi Billetera'.", "warning");
      return;
    }
    if (!tokenAddress) {
      Swal_alert(
        prepError ||
          "No pudimos determinar la moneda de pago. Reintentá en unos instantes.",
        "error",
      );
      return;
    }

    setLoading(true);
    setStatus("Preparando la firma...");

    try {
      // 0. Garantizamos gas/saldo ANTES de firmar (por si no se preparo al abrir).
      let fund = prepared;
      if (!fund?.tokenAddress) {
        const accessToken = await getAccessToken();
        const { data } = await axios.post(
          `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}/escrow/prepare-funding`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!data.success) {
          throw new Error(data.message || "No se pudo preparar el pago.");
        }
        fund = data;
        setPrepared(data);
      }

      // 1. Cambiar a BSC Testnet con la wallet activa.
      await activeWallet.switchChain(bscTestnet.id);
      await new Promise((r) => setTimeout(r, 800));

      // 2. Obtener provider y signer.
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const net = await provider.getNetwork();
      if (Number(net.chainId) !== bscTestnet.id) {
        throw new Error(
          `Tu wallet está en la red ${net.chainId} y debe estar en BSC Testnet (${bscTestnet.id}). Cambiá la red e intentá de nuevo.`,
        );
      }

      const buyerAddress = activeWallet.address;
      // Wallet del vendedor (el backend la devuelve en prepare-funding/createOrder).
      const rawSeller =
        fund.sellerWallet ||
        order.sellerWallet ||
        (order.seller && typeof order.seller === "object"
          ? order.seller.walletAddress
          : null);
      const sellerAddress =
        rawSeller && /^0x[a-fA-F0-9]{40}$/.test(rawSeller) ? rawSeller : null;
      if (!sellerAddress) {
        throw new Error(
          "No se pudo determinar la billetera del vendedor. Contactá a soporte.",
        );
      }
      const amountWei = ethers.parseUnits(totalUsd.toFixed(2), PAYMENT_TOKEN_DECIMALS);
      const orderId = order._id.toString();
      const payToken = fund.tokenAddress || tokenAddress;

      // 3. Verificacion de balance: evitamos que approve pase y fundOrder
      //    revierta con "Fallo transferencia" (error critico para el usuario).
      const erc20Read = new ethers.Contract(payToken, ERC20_ABI, provider);
      const rawBalance = await erc20Read.balanceOf(buyerAddress);
      if (rawBalance < amountWei) {
        throw new Error(
          `Saldo insuficiente de ${tokenSymbol}. Necesitás ${amountStr} ${tokenSymbol} y tu billetera tiene ${ethers.formatUnits(rawBalance, PAYMENT_TOKEN_DECIMALS)}.`,
        );
      }

      // 4. approve SOLO si la allowance actual no alcanza. Usamos MaxUint256
      //    para que sea una autorizacion UNICA: en las proximas compras el
      //    comprador firma una sola vez (directo el fundOrder).
      const erc20 = new ethers.Contract(payToken, ERC20_ABI, signer);
      let allowance = 0n;
      try {
        allowance = await erc20.allowance(buyerAddress, ESCROW_CONTRACT_ADDRESS);
      } catch {
        allowance = 0n;
      }

      if (allowance < amountWei) {
        setStatus(`Autorizando el uso de ${tokenSymbol} (1/2)...`);
        const approveTx = await erc20.approve(ESCROW_CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
      }

      // 5. Fondear el escrow (la firma "real" del pago).
      setStatus(`Fondeando el escrow con ${tokenSymbol}...`);
      const escrow = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const fundTx = await escrow.fundOrder(
        orderId,
        buyerAddress,
        sellerAddress,
        payToken,
        amountWei,
      );
      await fundTx.wait();

      setStatus("Pago confirmado. Sincronizando con el servidor...");

      // 6. Notificar al backend para que verifique on-chain y active la orden.
      const accessToken2 = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}/escrow/fund`,
        {
          fundTxHash: fundTx.hash,
          tokenAddress: payToken,
          token: tokenSymbol,
        },
        { headers: { Authorization: `Bearer ${accessToken2}` } },
      );

      if (data.success) {
        fundedOkRef.current = true;
        setStatus("¡Escrow fondeado con éxito!");
        Swal_alert("¡Pago en cripto confirmado! El vendedor podrá despachar tu pedido.", "success");
        onSuccess?.(data.order);
      } else {
        setStatus("El pago se realizó, pero el servidor no lo verificó aún.");
        Swal_alert(
          data.message || "El pago se realizó on-chain. Comunicate con soporte si el estado no se actualiza.",
          "warning",
        );
      }
    } catch (error) {
      console.error("Error fondeando escrow:", error);
      setStatus(`Error: ${error.reason || error.shortMessage || error.message || "Operación cancelada"}`);
      Swal_alert(error.reason || error.message || "Ocurrió un error al procesar el pago.", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── CIERRE SIN FONDEAR → ROLLBACK DE LA ORDEN PROVISIONAL ──
  // Si el comprador cierra el modal sin completar el fondeo, la orden quedó
  // creada en el backend (pending_payment / payment.status "funding") pero sin
  // fondos. La descartamos para no dejar órdenes huérfanas. El backend valida
  // on-chain que realmente NO esté fondeada antes de borrar (si el comprador
  // firmó pero falló la sync, NO se borra).
  const rollbackProvisionalOrder = async () => {
    if (!autoRollbackOnClose) return; // no aplica desde el detalle de la orden
    if (fundedOkRef.current) return; // se pagó: no hay nada que descartar
    const orderId = order?._id;
    if (!orderId) return;
    try {
      const accessToken = await getAccessToken();
      await axios.delete(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}/escrow/rollback`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch (err) {
      // Silencioso: si falla el rollback (ej. red), el backend igual descarta
      // órdenes crypto sin fondear a nivel de limpieza, o el usuario puede
      // reintentar el pago desde el detalle de la orden.
      console.warn("No se pudo descartar la orden provisional:", err?.message);
    }
  };

  const handleClose = async () => {
    if (loading) return; // no cerramos mientras se está procesando
    await rollbackProvisionalOrder();
    onClose?.();
  };

  // Helper para los swal (evito importar Sweetalert2 en cada render)
  const Swal_alert = async (msg, icon) => {
    const Swal = (await import("sweetalert2")).default;
    const isDark = document.documentElement.classList.contains("dark");
    Swal.fire({
      title: icon === "success" ? "Éxito" : icon === "error" ? "Error" : "Atención",
      text: msg,
      icon,
      confirmButtonColor: "#3483fa",
      background: isDark ? "#121212" : "#ffffff",
      color: isDark ? "#f3f4f6" : "#1f2937",
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#18181b] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#F26722]/10 rounded-2xl text-[#F26722]">
              <Wallet size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight dark:text-white">
                Pagar con Criptomonedas
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Pagá con {tokenSymbol}. Tus fondos quedan protegidos en el escrow.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <X size={18} className="dark:text-white" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-5">
          {/* Wallet conectada */}
          <div className="flex items-center justify-between rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm">
              <Wallet size={16} className="text-[#3483fa]" />
              <span className="font-medium dark:text-white">
                {activeWallet
                  ? `${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-4)}`
                  : "Sin wallet conectada"}
              </span>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full font-bold uppercase">
              {activeWallet ? "Conectada" : "No conectada"}
            </span>
          </div>

          {/* Moneda fija + gas cubierto por la plataforma */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Moneda
              </p>
              <p className="text-sm font-black dark:text-white mt-1">{tokenSymbol}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">Token fijo de la plataforma</p>
            </div>
            <div className="rounded-2xl p-3 bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-1.5">
                <Fuel size={12} className="text-emerald-600 dark:text-emerald-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Gas
                </p>
              </div>
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-1">
                Cubierto por la plataforma
              </p>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                No necesitás BNB
              </p>
            </div>
          </div>

          {/* Monto a pagar */}
          <div className="rounded-2xl p-4 bg-[#F26722]/5 border-2 border-[#F26722]/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F26722]">
                  Total a pagar
                </p>
                <p className="text-3xl font-black text-zinc-800 dark:text-white mt-1">
                  {amountStr} <span className="text-lg font-bold">{tokenSymbol}</span>
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Productos + envío ({totalUsd > 0 ? "USD" : "—"})
                </p>
              </div>
              {balance !== null && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                    Balance
                  </p>
                  <p className="text-sm font-bold dark:text-white">
                    {parseFloat(balance).toFixed(2)} {tokenSymbol}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Aviso de saldo insuficiente (detectado por el backend ANTES de firmar) */}
          {insufficient && (
            <div className="p-3 rounded-xl text-xs font-medium flex items-start gap-2 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
              <AlertTriangle size={16} className="shrink-0" />
              <div>
                <p>{prepError}</p>
                <button
                  onClick={prepareFunding}
                  disabled={preparing}
                  className="mt-2 font-bold underline disabled:opacity-50"
                >
                  {preparing ? "Verificando..." : "Verificar de nuevo"}
                </button>
              </div>
            </div>
          )}

          {/* Error de preparacion (gas/token/config): mostramos el motivo REAL */}
          {prepFailed && (
            <div className="p-3 rounded-xl text-xs font-medium flex items-start gap-2 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900">
              <AlertTriangle size={16} className="shrink-0" />
              <div>
                <p>{prepError}</p>
                <button
                  onClick={prepareFunding}
                  disabled={preparing}
                  className="mt-2 font-bold underline disabled:opacity-50"
                >
                  {preparing ? "Verificando..." : "Reintentar preparacion"}
                </button>
              </div>
            </div>
          )}

          {/* Estado del proceso */}
          {(status || preparing) && (
            <div className={
              "p-3 rounded-xl text-xs font-medium flex items-start gap-2 " +
              (status.startsWith("¡") || status.includes("éxito")
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                : status.startsWith("Error")
                  ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900"
                  : "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900")
            }>
              {loading || preparing ? (
                <LoadingSpinner size="sm" />
              ) : status.startsWith("Error") ? (
                <AlertTriangle size={16} />
              ) : status.startsWith("¡") || status.includes("éxito") ? (
                <CheckCircle2 size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              <span>{status || "Preparando el pago..."}</span>
            </div>
          )}
        </div>

        {/* FOOTER / ACCIÓN */}
        <div className="p-6 pt-0">
          <button
            onClick={handleFund}
            disabled={loading || preparing || !activeWallet || totalUsd <= 0 || insufficient || prepFailed}
            className="w-full py-4 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                Procesando...
              </>
            ) : (
              <>
                Pagar <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="mt-4 flex items-center gap-2 justify-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
            <ShieldCheck size={12} />
            El 100% de tu pago queda protegido en el contrato hasta que recibas tu pedido
          </div>
        </div>
      </div>
    </div>
  );
}
