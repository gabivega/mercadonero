import { useState } from "react";
import { Users, Clock, Share2, Check } from "lucide-react";
import useCountdown from "../hooks/useCountdown";
import { formatMoney } from "../Utils/currencyFormatter";
import { showCopiedToast } from "../Utils/copiedToast";
import UserAvatar from "./UserAvatar";

// Acento propio del feature (naranja Mercado Nero)
const ACCENT = "#F26722";

/**
 * SocialPoolCard
 * Card de un pool de compra grupal (Social Selling) dentro del ProductDetail.
 * Distinto del PoolCard de mayoristas (mock).
 *
 * @param {object}   pool
 * @param {function} onJoin            (pool) => void
 * @param {function} [onOpen]          (pool) => void   // abrir detalle /pool/:id
 * @param {function} [onShare]         (pool) => void   // deep-link del pool
 * @param {boolean}  [isJoining]
 * @param {string}   [currentUserId]
 */
export default function SocialPoolCard({
  pool,
  onJoin,
  onOpen,
  onShare,
  isJoining = false,
  currentUserId,
}) {
  const { label, isExpired } = useCountdown(pool.expiresAt);
  const [copied, setCopied] = useState(false);

  const filled = pool.members?.length || 0;
  const target = pool.targetBuyers || 5;
  const isMember = pool.members?.some((m) => m._id === currentUserId);
  const isFull = filled >= target;

  const handleShare = async (e) => {
    e.stopPropagation();
    if (onShare) {
      onShare(pool);
      return;
    }
    // Fallback: copiar deep-link del pool al portapapeles
    try {
      const link = `${window.location.origin}/pool/${pool._id}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showCopiedToast("Compartí el enlace para sumar compradores");
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className={`border rounded-2xl p-3.5 bg-white dark:bg-[#161616] transition-all hover:shadow-md ${
        onOpen ? "cursor-pointer" : ""
      }`}
      style={{ borderColor: `${ACCENT}33` }}
      onClick={() => onOpen && onOpen(pool)}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Avatares + progreso */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2">
            {pool.members?.slice(0, 5).map((m, i) => (
              <UserAvatar
                key={m._id || i}
                avatar={m.avatar}
                name={m.username}
                size={32}
                className="border-2 border-white dark:border-[#161616]"
              />
            ))}
            {filled < target &&
              Array.from({ length: target - filled }).map((_, i) => (
                <span
                  key={`empty-${i}`}
                  className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1f1f1f] flex items-center justify-center"
                >
                  <Users size={12} className="text-gray-400" />
                </span>
              ))}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold dark:text-white truncate">
              {filled}/{target} compradores
            </p>
            <p className="text-[11px] text-gray-400 truncate">
              Creado por @
              {[
                pool.creator?.firstName,
                pool.creator?.lastName,
              ]
                .map((v) => (typeof v === "string" ? v.trim() : ""))
                .filter(Boolean)
                .join(" ") ||
                pool.creator?.username ||
                "vendedor"}
            </p>
          </div>
        </div>

        {/* Countdown */}
        <div
          className="flex items-center gap-1 shrink-0 text-xs font-bold px-2 py-1 rounded-lg"
          style={{
            color: isExpired ? "#9ca3af" : ACCENT,
            backgroundColor: isExpired ? "#9ca3af1a" : `${ACCENT}14`,
          }}
        >
          <Clock size={13} />
          <span>{label}</span>
        </div>
      </div>

      {/* Precios + Acciones en una sola fila */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        {/* Precios */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="leading-tight">
            <p className="text-[9px] uppercase font-black text-gray-400 tracking-widest">
              Objetivo
            </p>
            <span className="text-base font-black" style={{ color: ACCENT }}>
              {formatMoney(pool.targetUnitPrice)}
            </span>
      </div>
          {!isFull && pool.currentUnitPrice && (
            <div className="leading-tight">
              <p className="text-[9px] uppercase font-black text-gray-400 tracking-widest">
                Ahora
              </p>
              <span className="text-lg font-black dark:text-white">
                {formatMoney(pool.currentUnitPrice)}
              </span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            disabled={isExpired || isFull || isMember || isJoining}
            onClick={(e) => {
              e.stopPropagation();
              onJoin && onJoin(pool);
            }}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor:
                isExpired || isFull || isMember ? "#9ca3af" : ACCENT,
            }}
          >
            {isJoining
              ? "Procesando..."
              : isMember
                ? "Ya estás dentro"
                : isFull
                  ? "Completo"
                  : isExpired
                    ? "Expirado"
                    : "Unirme"}
          </button>

          <button
            type="button"
            onClick={handleShare}
            title="Compartir pool"
            className="w-10 shrink-0 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors"
          >
            {copied ? (
              <Check size={18} className="text-green-500" />
            ) : (
              <Share2 size={18} className="text-gray-500" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
