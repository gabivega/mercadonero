import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  X,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import { bscTestnet, polygonAmoy, baseSepolia } from "viem/chains";
import {
  getWalletAddress,
  readContract,
  writeContract,
  approveToken,
} from "../Utils/crossmintWallet";

// ─────────────────────────────────────────────────────────────────────────
// ⚠️ FIRMA CON CROSSMINT (NO Privy)
// ─────────────────────────────────────────────────────────────────────────
// Este modal fondea el escrow de una orden crypto. La firma la hace la SMART
// WALLET de Crossmint (device signer), vía `crossmintWallet.js` — el mismo
// motor que ya usan CollateralManager y WalletPage. NO se usa Privy ni ethers
// directamente: la smart wallet es ERC-4337 y el SDK maneja el nonce, por eso
// desaparece el "nonce has already been used" que aparecía al firmar con
// ethers contra un provider EOA.
//
// Redes firmables con Crossmint: polygon-amoy y base-sepolia. BSC testnet no
// está soportada por Crossmint (solo lectura), por eso el pago crypto se
// limita a las redes sendables.

// chainId → nombre de chain de Crossmint (el que espera el SDK).
const CHAIN_NAME_BY_ID = {
  [polygonAmoy.id]: "polygon-amoy",
  [baseSepolia.id]: "base-sepolia",
  [bscTestnet.id]: "bsc-testnet",
};

// chainId → definición viem (solo para mostrar el nombre legible).
const VIEM_CHAINS = {
  [bscTestnet.id]: bscTestnet,
  [polygonAmoy.id]: polygonAmoy,
  [baseSepolia.id]: baseSepolia,
};

// Redes donde Crossmint PUEDE firmar. Si la orden está en otra red, no se puede
// pagar con este flujo (p. ej. BSC testnet).
const SIGNABLE_CHAIN_IDS = [polygonAmoy.id, baseSepolia.id];

const ERC20_READ_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const ESCROW_ABI = [
  {
    type: "function",
    name: "fundOrder",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_orderId", type: "string" },
      { name: "_buyer", type: "address" },
      { name: "_seller", type: "address" },
      { name: "_tokenAddress", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isFunded",
    stateMutability: "view",
    inputs: [{ name: "_orderId", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
];

/** Convierte un monto legible (string) a unidades base (bigint). */
function toBaseUnits(amount, decimals) {
  const [intPart, fracPart = ""] = String(amount).trim().split(".");
  const padded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt((intPart || "0") + padded);
}

/** Convierte unidades base (bigint) a número legible. */
function fromBaseUnits(value, decimals) {
  const str = BigInt(value).toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  const fracPart = str.slice(-decimals);
  return Number(`${intPart}.${fracPart}`);
}

/**
 * Espera a que el allowance del token hacia el spender sea >= amount.
 * Evita que fundOrder revierta por transferFrom sin aprobación (carrera del
 * bundler: el approve es una UserOp que puede tardar en incluirse on-chain).
 */
async function waitForAllowance({
  tokenAddress,
  owner,
  spender,
  amount,
  chainName,
  tries = 20,
  delayMs = 2000,
}) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const current = await readContract({
        address: tokenAddress,
        abi: ERC20_READ_ABI,
        functionName: "allowance",
        args: [owner, spender],
        chain: chainName,
      });
      if (BigInt(current) >= BigInt(amount)) return true;
    } catch (err) {
      console.warn("waitForAllowance: no se pudo leer allowance:", err);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

export default function CryptoPaymentModal({
  order,
  onClose,
  onSuccess,
  getAccessToken,
  // Opciones de pago (redes) disponibles. Vienen de GET /api/config/payment-options
  // (usePaymentOptions). Hoy el checkout crea la orden con la red elegida y abre
  // este modal SIN selector (paymentOptions=[]), así que usamos la red FIJA de
  // la orden. Se mantiene el prop por compatibilidad.
  paymentOptions = [],
  // Si es true (default, usado en el Checkout), cerrar el modal SIN fondear
  // descarta la orden provisional (evita órdenes huérfanas). Desde el detalle
  // de la orden se pasa false: ahí el usuario solo cierra el modal para
  // reintentar más tarde y NO queremos borrar su orden.
  autoRollbackOnClose = true,
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [balance, setBalance] = useState(null);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  // Address REAL que firma (smart wallet Crossmint). Se resuelve al montar.
  const [activeWalletAddress, setActiveWalletAddress] = useState(null);
  const [walletResolving, setWalletResolving] = useState(true);

  // Marca si el fondeo se completó con éxito. Si el comprador cierra el modal
  // SIN haber fondeado, disparamos el rollback de la orden provisional.
  const fundedOkRef = useRef(false);

  // ── CONFIG DE PAGO (MULTICHAIN) DESDE LA ORDEN ──
  const payment = order?.payment || {};
  const chainId = Number(order?.chainId ?? payment.chainId ?? bscTestnet.id);
  const viemChain = VIEM_CHAINS[chainId] || bscTestnet;
  const chainName = CHAIN_NAME_BY_ID[chainId] || "polygon-amoy";
  const canSignHere = SIGNABLE_CHAIN_IDS.includes(chainId);
  const tokenSymbol = order?.tokenSymbol || payment.token || "USDT";
  const fundingMode = order?.fundingMode || payment.fundingMode || "token";
  const isNativeFunding = fundingMode === "native";
  const tokenAddress = order?.tokenAddress || payment.tokenAddress || "";
  const escrowContractAddress =
    order?.escrowContract || payment.escrowContract || "";

  // Monto total a fondeear = productos + envío en USD.
  const totalUsd =
    (order?.financials?.totalUsd || 0) +
    (order?.financials?.shippingCostUsd || 0);
  const amountStr = totalUsd > 0 ? totalUsd.toFixed(2) : "0.00";

  // ── RESOLVER LA WALLET CROSSMINT (address real que firma) ──
  useEffect(() => {
    let mounted = true;
    setWalletResolving(true);
    (async () => {
      try {
        const addr = await getWalletAddress({ chain: chainName });
        if (mounted) setActiveWalletAddress(addr || null);
      } catch (err) {
        console.error("No se pudo resolver la wallet Crossmint:", err);
        if (mounted) setActiveWalletAddress(null);
      } finally {
        if (mounted) setWalletResolving(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [chainName]);

  // ── LEER BALANCE + DECIMALES DEL TOKEN EN LA WALLET (por RPC) ──
  const fetchBalance = async () => {
    if (!activeWalletAddress) return;
    try {
      if (isNativeFunding) {
        setBalance(null);
        return;
      }
      if (!tokenAddress) {
        setBalance(null);
        return;
      }
      const [bal, dec] = await Promise.all([
        readContract({
          address: tokenAddress,
          abi: ERC20_READ_ABI,
          functionName: "balanceOf",
          args: [activeWalletAddress],
          chain: chainName,
        }),
        readContract({
          address: tokenAddress,
          abi: ERC20_READ_ABI,
          functionName: "decimals",
          chain: chainName,
        }).catch(() => 18),
      ]);
      const decimals = Number(dec);
      setTokenDecimals(decimals);
      setBalance(fromBaseUnits(bal, decimals).toString());
    } catch (err) {
      console.error("Error leyendo balance:", err);
      setBalance(null);
    }
  };

  useEffect(() => {
    if (activeWalletAddress) fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWalletAddress, chainId, tokenAddress, isNativeFunding]);

  // Helper para los swal.
  const Swal_alert = async (msg, icon) => {
    const Swal = (await import("sweetalert2")).default;
    const isDark = document.documentElement.classList.contains("dark");
    Swal.fire({
      title:
        icon === "success" ? "Éxito" : icon === "error" ? "Error" : "Atención",
      text: msg,
      icon,
      confirmButtonColor: "#3483fa",
      background: isDark ? "#121212" : "#ffffff",
      color: isDark ? "#f3f4f6" : "#1f2937",
    });
  };

  // ── APROBAR + FONDEAR EL ESCROW (FIRMA CROSSMINT) ──
  const handleFund = async () => {
    if (!canSignHere) {
      Swal_alert(
        `Esta red (${viemChain.name}) no es firmable con tu billetera Crossmint. Elegí Polygon Amoy o Base Sepolia.`,
        "warning",
      );
      return;
    }
    if (!activeWalletAddress) {
      Swal_alert(
        "No tenés una wallet Crossmint activa. Creá tu billetera desde 'Mi Billetera'.",
        "warning",
      );
      return;
    }
    if (!escrowContractAddress) {
      Swal_alert(
        "No se pudo determinar el contrato de escrow de esta red. Contactá a soporte.",
        "error",
      );
      return;
    }
    if (isNativeFunding) {
      Swal_alert(
        "El pago nativo no está soportado en este flujo. Contactá a soporte.",
        "error",
      );
      return;
    }
    if (!tokenAddress) {
      Swal_alert(
        "La orden no tiene dirección de token. Contactá a soporte.",
        "error",
      );
      return;
    }

    setLoading(true);
    setStatus("Preparando el fondeo...");

    try {
      // Address del vendedor: el backend la devuelve en createOrder.
      const rawSeller =
        order.sellerWallet ||
        (order.seller && typeof order.seller === "object"
          ? order.seller.walletAddress
          : null);
      const sellerAddress =
        rawSeller && /^0x[a-fA-F0-9]{40}$/.test(rawSeller) ? rawSeller : null;
      if (!sellerAddress) {
        throw new Error(
          "No se pudo determinar la wallet del vendedor. El vendedor debe tener una billetera Web3 vinculada.",
        );
      }

      const buyerAddress = activeWalletAddress;
      const amountWei = toBaseUnits(totalUsd.toFixed(2), tokenDecimals);
      const orderId = order._id.toString();

      // Verificación de balance ANTES de firmar (evita fundOrder revirtiendo
      // por saldo insuficiente tras un approve exitoso).
      try {
        const rawBal = await readContract({
          address: tokenAddress,
          abi: ERC20_READ_ABI,
          functionName: "balanceOf",
          args: [buyerAddress],
          chain: chainName,
        });
        if (BigInt(rawBal) < amountWei) {
          throw new Error(
            `Saldo insuficiente de ${tokenSymbol}. Necesitás ${amountStr} ${tokenSymbol} y tu wallet tiene ${fromBaseUnits(rawBal, tokenDecimals)}.`,
          );
        }
      } catch (e) {
        // El error de saldo que lanzamos arriba sí se propaga; otros fallos de
        // lectura no bloquean (la firma lo intentará igual).
        if (String(e?.message || "").startsWith("Saldo insuficiente")) throw e;
        console.warn("No se pudo leer el balance previo:", e);
      }

      // Paso 1: approve del escrow como spender (firma Crossmint).
      setStatus(`Paso 1/2: Aprobando ${tokenSymbol}...`);
      await approveToken({
        tokenAddress,
        spender: escrowContractAddress,
        amount: amountWei,
        chain: chainName,
      });

      // Esperamos el allowance on-chain antes de fundOrder (carrera bundler).
      setStatus("Esperando confirmación del approve...");
      const allowanceReady = await waitForAllowance({
        tokenAddress,
        owner: buyerAddress,
        spender: escrowContractAddress,
        amount: amountWei,
        chainName,
      });
      if (!allowanceReady) {
        setStatus("");
        Swal_alert(
          "La aprobación aún no se reflejó on-chain. Reintentá en unos segundos.",
          "warning",
        );
        return;
      }

      // Paso 2: fundOrder (firma Crossmint).
      setStatus("Paso 2/2: Fondeando el escrow...");
      const fundTx = await writeContract({
        address: escrowContractAddress,
        abi: ESCROW_ABI,
        functionName: "fundOrder",
        args: [orderId, buyerAddress, sellerAddress, tokenAddress, amountWei],
        chain: chainName,
      });

      setStatus("Fondeo confirmado. Sincronizando con el servidor...");

      // Notificar al backend para que verifique on-chain y active la orden.
      const accessToken = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}/escrow/fund`,
        {
          fundTxHash: fundTx.hash,
          tokenAddress,
          token: tokenSymbol,
          fundingMode,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (data.success) {
        fundedOkRef.current = true;
        setStatus("¡Escrow fondeado con éxito!");
        Swal_alert(
          "¡Pago en cripto confirmado! El vendedor podrá despachar tu pedido.",
          "success",
        );
        onSuccess?.(data.order);
      } else {
        // El escrow se fondeó on-chain pero el backend no pudo verificar.
        // Marcamos como fondeado para que el cierre NO dispare rollback.
        fundedOkRef.current = true;
        setStatus("El fondeo se realizó, pero el servidor aún no lo verificó.");
        Swal_alert(
          data.message ||
            "El fondeo se realizó on-chain. Comunicate con soporte si el estado no se actualiza.",
          "warning",
        );
      }
    } catch (error) {
      console.error("Error fondeando escrow:", error);
      const msg =
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        "Operación cancelada";
      setStatus(`Error: ${msg}`);
      Swal_alert(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── CIERRE SIN FONDEAR → ROLLBACK DE LA ORDEN PROVISIONAL ──
  const rollbackProvisionalOrder = async () => {
    if (!autoRollbackOnClose) return;
    if (fundedOkRef.current) return;
    const orderId = order?._id;
    if (!orderId) return;
    try {
      const accessToken = await getAccessToken();
      await axios.delete(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}/escrow/rollback`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch (err) {
      console.warn(
        "No se pudo descartar la orden provisional:",
        err?.message,
      );
    }
  };

  const handleClose = async () => {
    if (loading) return;
    await rollbackProvisionalOrder();
    onClose?.();
  };

  const walletLabel = walletResolving
    ? "Conectando billetera..."
    : activeWalletAddress
      ? `${activeWalletAddress.slice(0, 6)}...${activeWalletAddress.slice(-4)}`
      : "Sin wallet";

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
                Fondéa el escrow con {tokenSymbol} en {viemChain.name}. Tus fondos
                quedan protegidos.
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
              <span className="font-medium dark:text-white">{walletLabel}</span>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full font-bold uppercase">
              {activeWalletAddress ? "Conectada" : "No conectada"}
            </span>
          </div>

          {/* Red + token (fijos por la orden). */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                Red
              </p>
              <p className="text-sm font-bold dark:text-white">
                {viemChain.name}
              </p>
            </div>
            <div className="rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                Token
              </p>
              <p className="text-sm font-bold dark:text-white">{tokenSymbol}</p>
            </div>
          </div>

          {/* Monto a pagar */}
          <div className="rounded-2xl p-4 bg-[#F26722]/5 border-2 border-[#F26722]/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F26722]">
                  Total a fondeear
                </p>
                <p className="text-3xl font-black text-zinc-800 dark:text-white mt-1">
                  {amountStr}{" "}
                  <span className="text-lg font-bold">{tokenSymbol}</span>
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

          {/* Aviso de red no firmable */}
          {!canSignHere && (
            <div className="p-3 rounded-xl text-xs font-medium flex items-start gap-2 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
              <AlertTriangle size={16} />
              <span>
                Esta red no es firmable con tu billetera Crossmint. Elegí Polygon
                Amoy o Base Sepolia para pagar.
              </span>
            </div>
          )}

          {/* Estado de las operaciones */}
          {status && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                status.startsWith("¡") || status.includes("éxito")
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                  : status.startsWith("Error")
                    ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900"
                    : "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
              }`}
            >
              {loading && status.startsWith("Paso") ? (
                <LoadingSpinner size="sm" />
              ) : status.startsWith("Error") ? (
                <AlertTriangle size={16} />
              ) : status.startsWith("¡") || status.includes("éxito") ? (
                <CheckCircle2 size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              <span>{status}</span>
            </div>
          )}
        </div>

        {/* FOOTER / ACCIÓN */}
        <div className="p-6 pt-0">
          <button
            onClick={handleFund}
            disabled={
              loading || !activeWalletAddress || !canSignHere || totalUsd <= 0
            }
            className="w-full py-4 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                Procesando...
              </>
            ) : (
              <>
                Pagar {tokenSymbol} <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="mt-4 flex items-center gap-2 justify-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
            <ShieldCheck size={12} />
            El 100% de tu pago queda protegido en el contrato hasta que recibas
            tu pedido
          </div>
        </div>
      </div>
    </div>
  );
}
