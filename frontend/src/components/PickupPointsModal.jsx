import { useEffect } from "react";
import {
  X,
  MapPin,
  Clock,
  Phone,
  CheckCircle,
  Store,
  Truck,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// MODAL DE PUNTOS DE ENTREGA (Zipnova / integradores)
//
// Zipnova devuelve, para ciertos servicios (ej. Correo Argentino, OCA), una
// lista de `pickup_points`: sucursales donde el COMPRADOR puede retirar su
// compra en lugar de recibirla a domicilio.
//
// Este componente se usa en DOS contextos:
//   • ProductDetail (vista informativa): `selectable = false`, solo muestra
//     los puntos disponibles para que el comprador sepa dónde podría retirar.
//   • Checkout (selección): `selectable = true`, permite elegir UN punto; al
//     elegirlo se notifica al padre vía `onSelect`.
//
// Props:
//   - open:          bool, controla la visibilidad
//   - onClose:       fn, cierra el modal
//   - points:        array de pickup_points (formato crudo de Zipnova)
//   - selectable:    bool, permite seleccionar (default false)
//   - selectedPoint: punto seleccionado actualmente (para marcar el activo)
//   - onSelect:      fn(point), notifica el punto elegido
//   - serviceLabel:  string, nombre del carrier/servicio (encabezado)
//   - limit:         number|null, limita la cantidad mostrada (ej. 5 en ficha)
// ─────────────────────────────────────────────────────────────

/** Normaliza un pickup_point de Zipnova a un shape estable para la UI. */
export const normalizePickupPoint = (p) => {
  const loc = p?.location || p?.address || {};
  const geo = loc?.geolocation || {};
  return {
    id: p?.point_id ?? p?.id ?? `${loc?.street}-${loc?.street_number}`,
    name: p?.description || p?.name || "Punto de entrega",
    street: loc?.street || "",
    streetNumber: loc?.street_number || "",
    streetExtras: loc?.street_extras || "",
    city: loc?.city || "",
    state: loc?.state || "",
    zipcode: loc?.zipcode || "",
    openHours: p?.open_hours || p?.opening_hours || "",
    phone: p?.phone || "",
    distance: geo?.distance ?? null,
    raw: p,
  };
};

const formatDistance = (m) => {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`;
};

/** Devuelve la lista de puntos normalizados, limitada si se pide. */
export const usePickupPoints = (points, limit = null) => {
  if (!Array.isArray(points)) return [];
  const normalized = points.map(normalizePickupPoint);
  return limit != null ? normalized.slice(0, limit) : normalized;
};

export default function PickupPointsModal({
  open,
  onClose,
  points = [],
  selectable = false,
  selectedPoint = null,
  onSelect,
  serviceLabel = "",
  limit = null,
}) {
  // Cerramos con la tecla ESC (mejora UX en desktop).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    // Bloqueamos el scroll del fondo mientras el modal está abierto.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const list = usePickupPoints(points, limit);
  const selectedId = selectedPoint?.id ?? null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#121212] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#3483fa]/10 rounded-2xl text-[#3483fa]">
              <Store size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight dark:text-white">
                Puntos de entrega
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {selectable
                  ? "Elegí dónde querés retirar tu compra."
                  : "Sucursales disponibles para retirar tu compra."}
              </p>
              {serviceLabel && (
                <p className="text-[11px] text-[#3483fa] mt-1 flex items-center gap-1">
                  <Truck size={11} /> {serviceLabel}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-[#F26722] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* LISTA DE PUNTOS */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              No hay puntos de entrega disponibles para esta opción.
            </p>
          ) : (
            list.map((p) => {
              const isSel = selectable && selectedId != null && p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => {
                    if (!selectable) return;
                    onSelect?.(p);
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    isSel
                      ? "border-[#3483fa] bg-blue-50 dark:bg-blue-900/10"
                      : selectable
                        ? "border-zinc-200 dark:border-zinc-700 hover:border-[#3483fa]/60 cursor-pointer"
                        : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold dark:text-white flex items-center gap-2">
                        {p.name}
                        {isSel && (
                          <CheckCircle size={15} className="text-[#3483fa] shrink-0" />
                        )}
                      </p>

                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 flex items-start gap-1.5">
                        <MapPin size={13} className="shrink-0 mt-0.5 text-zinc-400" />
                        <span>
                          {[p.street, p.streetNumber].filter(Boolean).join(" ")}
                          {p.city ? `, ${p.city}` : ""}
                          {p.state ? `, ${p.state}` : ""}
                        </span>
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                        {p.openHours && (
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <Clock size={11} /> {p.openHours}
                          </span>
                        )}
                        {p.phone && (
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <Phone size={11} /> {p.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {formatDistance(p.distance) && (
                      <span className="text-[10px] font-bold text-[#3483fa] bg-[#3483fa]/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                        {formatDistance(p.distance)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* FOOTER (solo en modo selección) */}
        {selectable && (
          <div className="p-6 pt-0">
            <button
              onClick={onClose}
              disabled={!selectedPoint}
              className={`w-full py-3.5 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                selectedPoint
                  ? "bg-[#3483fa] hover:bg-[#2968c8] text-white"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
              }`}
            >
              <CheckCircle size={18} />
              {selectedPoint ? "Confirmar punto" : "Elegí un punto"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
