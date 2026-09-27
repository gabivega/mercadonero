import { X, Users, Clock, Lock, AlertTriangle } from "lucide-react";
import { formatMoney } from "../Utils/currencyFormatter";

const ACCENT = "#F26722";

/**
 * CreatePoolModal
 * Modal de confirmación para crear un pool de compra grupal.
 *
 * @param {boolean}  isOpen
 * @param {function} onClose
 * @param {function} onConfirm
 * @param {boolean}  isCreating
 * @param {object}   product        producto actual (name, currency, price)
 * @param {object}   socialSelling  { durationHours, tiers }
 */
export default function CreatePoolModal({
  isOpen,
  onClose,
  onConfirm,
  isCreating = false,
  product,
  socialSelling,
}) {
  if (!isOpen) return null;

  const duration = socialSelling?.durationHours || 24;
  const tiers = socialSelling?.tiers || {};
  // Precio objetivo = tier de 5 compradores
  const targetPrice = tiers[5] ?? tiers[4] ?? tiers[3] ?? tiers[2] ?? null;
  const basePrice = Number(product?.price || 0);
  const saving =
    basePrice > 0 && targetPrice ? Math.round((1 - targetPrice / basePrice) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative bg-white dark:bg-[#161616] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-[#222] transition-colors"
        >
          <X size={18} className="text-gray-400" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="p-3 rounded-2xl"
            style={{ backgroundColor: `${ACCENT}14` }}
          >
            <Users size={22} style={{ color: ACCENT }} />
          </div>
          <div>
            <h3 className="text-lg font-black dark:text-white leading-tight">
              Crear grupo de compra
            </h3>
            <p className="text-xs text-gray-400">
              Invitá compradores para bajar el precio entre todos.
            </p>
          </div>
        </div>

        {/* Resumen */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-2">
              <Users size={15} /> Tamaño del grupo
            </span>
            <span className="font-bold dark:text-white">hasta 5 compradores</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-2">
              <Clock size={15} /> Duración
            </span>
            <span className="font-bold dark:text-white">{duration} hs</span>
          </div>
          <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-gray-500">Precio objetivo</span>
            <div className="text-right">
              <span className="font-black text-lg" style={{ color: ACCENT }}>
                {targetPrice ? formatMoney(targetPrice) : "—"}
              </span>
              {saving > 0 && (
                <span className="block text-[11px] text-green-500 font-bold">
                  {saving}% OFF al llenarse
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Aviso de escrow */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 mb-5">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Al crear el grupo se <b>congela tu saldo en USDT</b> en un contrato
            inteligente. <b>No podés cancelar</b>: si el grupo no se completa,
            se te cobra el precio del tier alcanzado y, si quedás solo, se
            liberan los fondos al expirar.
          </p>
        </div>

        {/* Acciones */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm && onConfirm()}
            disabled={isCreating}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {isCreating ? (
              "Creando..."
            ) : (
              <>
                <Lock size={15} /> Crear
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
