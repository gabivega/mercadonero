import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Store, MapPin, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// OPCIÓN DE RETIRO EN SUCURSAL (GRATIS)
//
// Muestra el retiro en local/sucursal del vendedor SIN CARGO.
// Reutilizable en ProductDetail (informativo) y Checkout (selección).
//
// Fuente de datos: GET /api/user/pickup-locations/seller/:sellerId
//   → devuelve SOLO los puntos activos del vendedor.
// Filtrado: si el producto define `shipping.delivery.pickupLocationIds`,
//   solo se muestran esas sucursales; si está vacío, se muestran todas.
//
// Props:
//   - product: el producto (necesita seller._id y shipping.delivery)
//   - selectedLocationId: id del punto elegido (checkout)
//   - onSelect(location): callback al elegir un punto (checkout)
//   - compact: modo compacto para ProductDetail (sin radio de selección)
// ─────────────────────────────────────────────────────────────

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

const buildAddressLine = (loc) =>
  [
    [loc.street, loc.streetNumber].filter(Boolean).join(" "),
    loc.floor ? `Piso ${loc.floor}` : "",
    loc.apartment ? `Depto ${loc.apartment}` : "",
    [loc.city, loc.state].filter(Boolean).join(", "),
    loc.zipcode ? `(${loc.zipcode})` : "",
  ]
    .filter(Boolean)
    .join(" · ");

export default function PickupOption({
  product,
  selectedLocationId,
  onSelect,
  compact = false,
  defaultExpanded = false,
}) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const sellerId = useMemo(
    () => product?.seller?._id || product?.seller,
    [product],
  );

  // IDs de sucursales habilitadas por el vendedor para ESTE producto.
  const allowedIds = useMemo(
    () => product?.shipping?.delivery?.pickupLocationIds || [],
    [product],
  );

  useEffect(() => {
    let cancelled = false;
    const fetchLocations = async () => {
      if (!sellerId) return;
      try {
        setLoading(true);
        const { data } = await axios.get(
          `${SERVER_URL}/api/user/pickup-locations/seller/${sellerId}`,
        );
        if (cancelled || !data?.success) return;
        let list = data.pickupLocations || [];
        // Si el producto restringe sucursales, filtramos.
        if (allowedIds.length > 0) {
          list = list.filter((l) => allowedIds.includes(l._id));
        }
        setLocations(list);
      } catch (err) {
        console.error("Error cargando puntos de retiro:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchLocations();
    return () => {
      cancelled = true;
    };
  }, [sellerId, allowedIds]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin" />
        Buscando puntos de retiro...
      </div>
    );
  }

  if (locations.length === 0) return null;

  // ── MODO COMPACTO (ProductDetail): solo informa que hay retiro gratis ──
  if (compact) {
    const showsAll = allowedIds.length === 0;
    return (
      <div className="flex gap-2.5">
        <Store className="w-4 h-4 shrink-0 mt-0.5 text-[#00bb2d]" />
        <div className="min-w-0">
          <p className="text-[#00bb2d] text-sm font-medium">
            Retiro en sucursal — GRATIS
          </p>
          <p className="text-gray-500 text-xs">
            {locations.length} punto{locations.length > 1 ? "s" : ""} de retiro
            {showsAll ? " disponibles" : " habilitados"}
            {" · "}
            <span
              className="text-[#3483fa] cursor-pointer hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              Ver {expanded ? "menos" : "sucursales"}
            </span>
          </p>

          {expanded && (
            <ul className="mt-2 space-y-2">
              {locations.map((loc) => (
                <li
                  key={loc._id}
                  className="text-xs text-gray-600 dark:text-gray-400 border-l-2 border-[#00bb2d]/40 pl-3"
                >
                  <span className="font-semibold dark:text-gray-300">
                    {loc.name}
                  </span>
                  {loc.isDefault && (
                    <span className="ml-2 text-[10px] bg-[#00bb2d] text-white px-1.5 py-0.5 rounded font-bold uppercase">
                      Principal
                    </span>
                  )}
                  <p className="flex items-start gap-1 mt-0.5">
                    <MapPin size={11} className="mt-0.5 shrink-0" />
                    {buildAddressLine(loc)}
                  </p>
                  {loc.hours && (
                    <p className="flex items-center gap-1 mt-0.5">
                      <Clock size={11} />
                      {loc.hours}
                    </p>
                  )}
                  {loc.notes && (
                    <p className="italic text-gray-400 mt-0.5">{loc.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── MODO SELECCIÓN (Checkout): radio para elegir la sucursal ──
  return (
    <div className="space-y-2">
      <div className="flex gap-2.5">
        <Store className="w-5 h-5 shrink-0 mt-0.5 text-[#00bb2d]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[#00bb2d] text-sm font-bold">
              Retiro en sucursal — GRATIS
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[#3483fa] text-xs hover:underline inline-flex items-center gap-1"
            >
              {expanded ? "Ocultar" : `${locations.length} punto${locations.length > 1 ? "s" : ""}`}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          <p className="text-gray-500 text-xs">
            Retirás vos mismo en el local del vendedor, sin costo de envío.
          </p>

          {expanded && (
            <div className="mt-3 space-y-2">
              {locations.map((loc) => {
                const selected = selectedLocationId === loc._id;
                return (
                  <label
                    key={loc._id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selected
                        ? "border-[#00bb2d] bg-[#00bb2d]/5"
                        : "border-gray-200 dark:border-gray-800 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pickup-location"
                      className="w-4 h-4 mt-0.5 accent-[#00bb2d]"
                      checked={selected}
                      onChange={() => onSelect?.(loc)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold dark:text-white">
                        {loc.name}
                        {loc.isDefault && (
                          <span className="ml-2 text-[10px] bg-[#00bb2d] text-white px-1.5 py-0.5 rounded font-bold uppercase">
                            Principal
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 flex items-start gap-1 mt-0.5">
                        <MapPin size={11} className="mt-0.5 shrink-0" />
                        {buildAddressLine(loc)}
                      </p>
                      {loc.hours && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock size={11} />
                          {loc.hours}
                        </p>
                      )}
                      {loc.notes && (
                        <p className="text-[11px] italic text-gray-400 mt-0.5">
                          {loc.notes}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
