import React, { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import axios from "axios";
import { X, Wallet, ShieldCheck, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import { bscTestnet } from "viem/chains";

// ── CONFIGURACIÓN (debe coincidir con el backend y el deploy) ──
const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS;
// Tokens BSC Testnet (mismo set que WalletPage)
const TOKENS = {
  USDT: {
    address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    symbol: "USDT",
    decimals: 18,
  },
  USDC: {
    address: "0x64544969ed7EBf5f083679233325356EbE738930",
    symbol: "USDC",
    decimals: 18,
  },
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
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
}) {
  const { wallets } = useWallets();
  const activeWallet = wallets?.[0];

  const [selectedToken, setSelectedToken] = useState("USDT");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [balance, setBalance] = useState(null);

  // Monto total a fondeear = total productos + envío en USD
  const totalUsd =
    (order.financials?.totalUsd || 0) + (order.financials?.shippingCostUsd || 0);
  // Monto a retener según lo que configuró el backend (legado de fe, pero ya
  // guardado en la orden).
  const amountStr = totalUsd > 0 ? totalUsd.toFixed(2) : "0.00";

  const token = TOKENS[selectedToken];

  // ── LEER BALANCE DEL TOKEN EN LA WALLET ACTIVA ──
  const fetchBalance = async () => {
    if (!activeWallet || !token) return;
    try {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
      const bal = await erc20.balanceOf(activeWallet.address);
      setBalance(ethers.formatUnits(bal, 18));
    } catch (err) {
      console.error("Error leyendo balance:", err);
      setBalance(null);
    }
  };

  React.useEffect(() => {
    if (activeWallet) fetchBalance();
  }, [activeWallet, selectedToken]);

  // ── APROBAR + FONDEAR EL ESCROW ──
  const handleFund = async () => {
    if (!activeWallet) {
      Swal_alert("No tenés una wallet activa. Creá tu billetera desde 'Mi Billetera'.", "warning");
      return;
    }

    setLoading(true);
    setStatus("Preparando el fondeo...");

    try {
      // 1. Cambiar a BSC Testnet con la wallet activa.
      await activeWallet.switchChain(bscTestnet.id);

      // 2. Obtener provider y signer
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const buyerAddress = activeWallet.address;
      const sellerAddress = order.sellerWallet || order.seller?.walletAddress || order.seller;
      if (!sellerAddress) {
        throw new Error("No se pudo determinar la wallet del vendedor.");
      }
      const amountWei = ethers.parseUnits(totalUsd.toFixed(2), token.decimals);
      const orderId = order._id.toString();

      setStatus("Paso 1/2: Solicitando aprobación de " + token.symbol + "...");
      const usdt = new ethers.Contract(token.address, ERC20_ABI, signer);
      const approveTx = await usdt.approve(ESCROW_CONTRACT_ADDRESS, amountWei);
      await approveTx.wait();

      setStatus("Paso 2/2: Fondear el escrow en el contrato...");
      const escrow = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const fundTx = await escrow.fundOrder(
        orderId,
        buyerAddress,
        sellerAddress,
        token.address,
        amountWei,
      );
      await fundTx.wait();

      setStatus("Fondeo confirmado. Sincronizando con el servidor...");

      // 3. Notificar al backend para que verifique on-chain y active la orden.
      const accessToken = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}/escrow/fund`,
        {
          fundTxHash: fundTx.hash,
          tokenAddress: token.address,
          token: token.symbol,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (data.success) {
        setStatus("¡Escrow fondeado con éxito!");
        Swal_alert("¡Pago en cripto confirmado! El vendedor podrá despachar tu pedido.", "success");
        onSuccess?.(data.order);
      } else {
        // El escrow se fondeó pero el backend no pudo verificar (caso raro).
        setStatus("El fondeo se realizó, pero el servidor no lo verificó aún.");
        Swal_alert(
          data.message || "El fondeo se realizó on-chain. Comunicate con soporte si el estado no se actualiza.",
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
                Fondéa el escrow con {token.symbol}. Tus fondos quedan protegidos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
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

          {/* Selector de token */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Token
            </label>
            <div className="flex gap-2 mt-2">
              {Object.keys(TOKENS).map((tk) => (
                <button
                  key={tk}
                  onClick={() => setSelectedToken(tk)}
                  disabled={loading}
                  className={`flex-1 py-2.5 rounded-xl border font-bold text-sm transition-colors ${
                    selectedToken === tk
                      ? "bg-[#3483fa] text-white border-[#3483fa]"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-[#3483fa]"
                  }`}
                >
                  {tk}
                </button>
              ))}
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
                  {amountStr} <span className="text-lg font-bold">{token.symbol}</span>
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
                    {parseFloat(balance).toFixed(2)} {token.symbol}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Estado de las partituras */}
          {status && (
            <div className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
              status.startsWith("¡") || status.includes("éxito")
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                : status.startsWith("Error")
                  ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900"
                  : "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
            }`}>
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
            disabled={loading || !activeWallet || totalUsd <= 0}
            className="w-full py-4 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                Procesando...
              </>
            ) : (
              <>
                Fondear Escrow <ArrowRight size={18} />
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
