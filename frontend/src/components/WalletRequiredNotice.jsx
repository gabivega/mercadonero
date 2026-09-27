import { useState } from "react";
import { useCreateWallet, useWallets } from "@privy-io/react-auth";
import {
  Wallet,
  PlusCircle,
  Info,
  AlertTriangle,
  RefreshCcw,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import Swal from "sweetalert2";
import LoadingSpinner from "./LoadingSpinner";

const ACCENT = "#F26722";

/** Nombre legible de la red en la que opera el escrow del grupo. */
const CHAIN_NAME = "BNB Smart Chain (BEP-20)";

/**
 * DepositAddressCard
 * ──────────────────────────────────────────────────────────────────────
 * Muestra la dirección de depósito de la billetera del usuario con botón de
 * copiado y una guía desplegable "¿Cómo deposito USDT?". Pensado para usarse
 * DENTRO del flujo de compra grupal (no rompe el contexto): el usuario puede
 * depositar sin irse a la página de billetera.
 *
 * @param {object} opts
 * @param {string} [opts.address] Dirección a mostrar (si no, la toma de useWallets).
 */
export function DepositAddressCard({ address: addressProp }) {
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const address = addressProp || wallets?.[0]?.address || "";

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const short = address
    ? `${address.slice(0, 8)}...${address.slice(-6)}`
    : "—";

  return (
    <div className="rounded-2xl border border-green-300/60 dark:border-green-700/40 bg-green-50 dark:bg-green-950/20 p-4 space-y-3 text-left">
      {/* Dirección de depósito + copiar */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Check size={15} className="text-green-600 dark:text-green-400" />
          <p className="text-xs font-black uppercase tracking-wide text-green-800 dark:text-green-200">
            Tu dirección de depósito
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate text-xs font-mono bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2.5 text-gray-700 dark:text-gray-200">
            {address || "Generá tu billetera para verla"}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!address}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-black text-white transition-all hover:brightness-95 disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
            title="Copiar dirección"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="text-[10px] text-green-700/80 dark:text-green-300/70 mt-1.5 flex items-center gap-1">
          <Info size={11} /> Enviá <b>USDT por la red {CHAIN_NAME}</b>Otra red
          u otro token pueden hacerte perder los fondos.
        </p>
      </div>

      {/* Guía desplegable: ¿cómo deposito USDT? */}
      <div className="border-t border-green-200/70 dark:border-green-800/50 pt-2">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left text-xs font-black text-green-800 dark:text-green-200 hover:opacity-80 transition-opacity"
        >
          ¿Cómo deposito USDT?
          <ChevronDown
            size={16}
            className={`shrink-0 transition-transform ${showGuide ? "rotate-180" : ""}`}
          />
        </button>

        {showGuide && (
          <div className="mt-3 space-y-3 text-[11px] text-gray-700 dark:text-gray-300 animate-in fade-in slide-in-from-top-1">
            {/* Opción 1: desde un exchange */}
            <div className="flex gap-2">
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                style={{ backgroundColor: ACCENT }}
              >
                1
              </span>
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100">
                  Una billetera de exchange o fintech (Binance, Lemon, Belo, etc.)
                </p>
                <p className="mt-0.5">
                  Buscá <b>Retirar USDT</b>, elegí la red <b>{CHAIN_NAME}</b> y
                  pegá tu dirección de arriba. Es el camino más simple.
                </p>
              </div>
            </div>

            {/* Opción 2: desde otra billetera */}
            <div className="flex gap-2">
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                style={{ backgroundColor: ACCENT }}
              >
                2
              </span>
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100">
                  Desde otra billetera (MetaMask, Trust, etc.)
                </p>
                <p className="mt-0.5">
                  Enviá <b>USDT</b> a esta dirección usando la red{" "}
                  <b>{CHAIN_NAME}</b>. Verificá la red dos veces antes de
                  confirmar.
                </p>
              </div>
            </div>

            {/* Opción 3: comprar con tarjeta (si hay proveedor) */}
            <div className="flex gap-2">
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                style={{ backgroundColor: ACCENT }}
              >
                3
              </span>
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100">
                  ¿No tenés USDT todavía?
                </p>
                <p className="mt-0.5">
                  Podés comprar USDT con pesos desde un exchange local y luego
                  retirarlo a esta dirección. También con tarjeta desde apps
                  compatibles.
                </p>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Los depósitos suelen acreditarse en 1–3 minutos. Si no ves tu
              saldo, esperá unos minutos y tocá <b>Verificar de nuevo</b>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * WalletRequiredNotice
 * ──────────────────────────────────────────────────────────────────────
 * Aviso + CTA para que el usuario genere su billetera Web3 (Privy) cuando
 * intenta una acción que la requiere (p. ej. Compra Grupal, que congela USDT
 * en escrow on-chain).
 *
 * Reutiliza EXACTAMENTE la misma mecánica que WalletPage.jsx
 * (`useCreateWallet` de Privy) para no divergir en la creación de billeteras.
 *
 * @param {object}  opts
 * @param {string}  [opts.title]        Título del aviso.
 * @param {string}  [opts.message]      Texto explicativo.
 * @param {string}  [opts.onCreated]    Callback tras crear la wallet (para reintentar la acción).
 * @param {boolean} [opts.compact]      Versión compacta (inline).
 */
export default function WalletRequiredNotice({
  title = "Necesitás una billetera Web3",
  message = "Para comprar en grupo tu pago se congela en un contrato inteligente en USDT. Activá tu billetera para continuar.",
  onCreated,
  compact = false,
}) {
  const { createWallet } = useCreateWallet();
  const [isCreating, setIsCreating] = useState(false);
  // Tras crear la wallet mostramos el paso "depositá USDT" para no cortar el
  // flujo (el usuario puede recargar sin irse a la página de billetera).
  const [justCreated, setJustCreated] = useState(false);

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      await createWallet();

      const isDark = document.documentElement.classList.contains("dark");
      await Swal.fire({
        title: "¡Billetera creada!",
        text: "Tu billetera Web3 se generó correctamente. Ya podés operar en Mercado Nero.",
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: ACCENT,
        confirmButtonText: "Continuar",
      });

      // Mostramos la dirección + guía de depósito (depositá sin salir del flujo).
      setJustCreated(true);
      if (typeof onCreated === "function") onCreated();
    } catch (error) {
      console.error("Error al crear la wallet:", error);
      const isDark = document.documentElement.classList.contains("dark");
      Swal.fire({
        title: "Error",
        text: "No se pudo generar la billetera. Intentalo nuevamente.",
        icon: "error",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: ACCENT,
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (compact) {
    return (
      <div
        className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}0d` }}
      >
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Info size={16} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
          <p className="text-xs text-gray-600 dark:text-gray-300">
            <b className="dark:text-white">{title}.</b> {message}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:brightness-95 disabled:opacity-50"
          style={{ backgroundColor: ACCENT }}
        >
          {isCreating ? (
            <>
              <LoadingSpinner size="sm" />
              Generando...
            </>
          ) : (
            <>
              <PlusCircle size={16} />
              Crear billetera
            </>
          )}
        </button>
      </div>
    );
  }

  // Tras crear la wallet: paso de depósito (dirección + guía), sin salir del flujo.
  if (justCreated) {
    return (
      <div className="rounded-2xl border p-5 text-center space-y-4"
        style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}08` }}>
        <div className="space-y-1">
          <h3 className="text-base font-black dark:text-white">
            ¡Billetera lista! Ahora cargá USDT
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Depositá USDT en tu nueva billetera para completar tu compra en
            grupo. Podés hacerlo ahora mismo, acá.
          </p>
        </div>

        <DepositAddressCard />

        <button
          onClick={() => onCreated && onCreated()}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-black text-white transition-all hover:brightness-95 shadow-lg"
          style={{ backgroundColor: ACCENT, boxShadow: `${ACCENT}33 0 8px 20px` }}
        >
          Ya deposité, continuar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-6 text-center space-y-4"
      style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}08` }}>
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
        style={{ backgroundColor: `${ACCENT}1a` }}
      >
        <Wallet style={{ color: ACCENT }} size={28} />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-black dark:text-white">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          {message}
        </p>
      </div>

      <div
        className="text-left rounded-xl border p-3 flex items-start gap-2"
        style={{ borderColor: `${ACCENT}33` }}
      >
        <Info size={15} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
        <p className="text-[11px] text-gray-600 dark:text-gray-300">
          Se genera en un clic, sin frases de recuperación ni instalaciones.
          Tu pago queda <b>congelado en garantía</b> (USDT) hasta que el grupo
          cierre.
        </p>
      </div>

      <button
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-black text-white transition-all hover:brightness-95 shadow-lg disabled:opacity-50"
        style={{ backgroundColor: ACCENT, boxShadow: `${ACCENT}33 0 8px 20px` }}
      >
        {isCreating ? (
          <>
            <LoadingSpinner size="sm" />
            Generando billetera...
          </>
        ) : (
          <>
            <PlusCircle size={18} />
            Crear mi billetera
          </>
        )}
      </button>
    </div>
  );
}

/**
 * InsufficientBalanceNotice
 * ──────────────────────────────────────────────────────────────────────
 * Aviso + CTA cuando el usuario YA tiene billetera pero le falta saldo USDT
 * para fondear su porción en el grupo de compra.
 *
 * @param {object} opts
 * @param {number} opts.required    USDT que necesita (su porción a congelar).
 * @param {number} opts.balance     USDT que tiene hoy.
 * @param {function} [opts.onRefresh] Callback para reintentar la verificación.
 */
export function InsufficientBalanceNotice({
  required = 0,
  balance = 0,
  onRefresh,
}) {
  const shortfall = Math.max(0, Number(required) - Number(balance));
  return (
    <div className="rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-4 text-left">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 rounded-xl shrink-0">
          <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-sm text-amber-800 dark:text-amber-200">
            Te falta saldo en USDT
          </h3>
          <p className="text-sm text-amber-800/90 dark:text-amber-200/80 mt-1">
            Para comprar en grupo necesitás reservar{" "}
            <b>{Number(required).toFixed(2)} USDT</b>. Tenés{" "}
            <b>{Number(balance).toFixed(2)} USDT</b> disponibles.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            Te faltan <b>{shortfall.toFixed(2)} USDT</b>. Recargá tu billetera
            para continuar.
          </p>
        </div>
      </div>

      {/* Depósito in-situ: dirección copiable + guía, sin salir del flujo. */}
      <DepositAddressCard />

      <div className="flex flex-col sm:flex-row gap-2">
        {typeof onRefresh === "function" && (
          <button
            onClick={onRefresh}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-all hover:brightness-95"
            style={{ backgroundColor: ACCENT }}
          >
            <RefreshCcw size={15} /> Verificar
          </button>
        )}
        <a
          href="/billetera"
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Wallet size={15} /> Ver mi billetera
        </a>
      </div>
    </div>
  );
}
