import React, { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { X, Copy, Check, Wallet, ExternalLink, ShieldCheck, Store } from "lucide-react";

/**
 * MODAL DE DEPÓSITO USDT.
 * Se muestra en el checkout cuando el comprador eligió pagar con cripto pero
 * NO tiene saldo USDT suficiente en su wallet. Le muestra su dirección de
 * depósito (copiable) y le ofrece el acceso a proveedores de cripto.
 */
export default function DepositUsdtModal({ onClose }) {
  const { wallets } = useWallets();
  const activeWallet = wallets?.find((w) => w.connected) || wallets?.[0];
  const [copied, setCopied] = useState(false);
  const [copiedRecharge, setCopiedRecharge] = useState(false);

  const walletAddress = activeWallet?.address || "";

  // Copia texto al portapapeles con feedback visual.
  const handleCopy = async (text, setFlag) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      setTimeout(() => setFlag(false), 1500);
    } catch (err) {
      console.error("Error copiando:", err);
    }
  };

  // BSC Testnet faucet (depositar tokens de prueba).
  const BSC_FAUCET_URL = "https://www.bnbchain.org/en/testnet-faucet";

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#18181b] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#F26722]/10 rounded-2xl text-[#F26722]">
              <Wallet size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight dark:text-white">
                Depositá USDT
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sumá saldo a tu wallet para poder proceder con la compra.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} className="dark:text-white" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-5">
          {/* ADVERTENCIA */}
          <div className="rounded-2xl p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 flex items-start gap-3">
            <ShieldCheck className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" size={18} />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Depositá USDT en tu wallet para proceder con la compra.
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                Tus fondos quedan protegidos en el contrato escrow de Mercado Nero
                hasta que recibas tu pedido.
              </p>
            </div>
          </div>

          {/* DIRECCIÓN DE DEPÓSITO */}
          {walletAddress ? (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Tu dirección de depósito (BSC)
              </label>
              <div className="flex items-center gap-2 mt-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="flex-1 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                  {walletAddress}
                </p>
                <button
                  onClick={() => handleCopy(walletAddress, setCopied)}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors shrink-0"
                  title="Copiar dirección"
                >
                  {copied ? (
                    <Check size={16} className="text-emerald-500" />
                  ) : (
                    <Copy size={16} className="text-zinc-500 dark:text-zinc-400" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">
                Usá la red <b>BSC (BNB Smart Chain)</b> para depositar USDT.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No tenés una wallet conectada aún.
              </p>
            </div>
          )}

          {/* BOTONES DE ACCIÓN */}
          <div className="space-y-3">
            {/* Botón para ver dónde comprar USDT (proveedor) */}
            <button
              onClick={() => {
                window.open(
                  "https://www.binance.com/es/trade/USDT_BUSD",
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              className="w-full py-3.5 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
            >
              <Store size={18} /> Comprar USDT a proveedor
              <ExternalLink size={14} />
            </button>

            {/* Faucet de test en BSC (por ahora, para pruebas) */}
            <button
              onClick={() => {
                window.open(BSC_FAUCET_URL, "_blank", "noopener,noreferrer");
              }}
              className="w-full py-3 border-2 border-[#F26722] text-[#F26722] rounded-2xl font-black uppercase tracking-widest transition-all hover:bg-[#F26722]/10 flex items-center justify-center gap-2"
            >
              Probar con tokens de test (faucet BSC)
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 pt-0">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold uppercase tracking-widest transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            Volver al checkout
          </button>
          <p className="mt-3 text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} />
            Tu saldo y tus compras están protegidos por Mercado Nero
          </p>
        </div>
      </div>
    </div>
  );
}
