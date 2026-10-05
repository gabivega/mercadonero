import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import {
  Truck,
  ChevronDown,
  ChevronUp,
  MapPin,
  Loader2,
  AlertCircle,
  Store,
  CheckCircle,
} from "lucide-react";
import { toZipnovaState } from "../Utils/postalCodes";
import PickupPointsModal, { usePickupPoints } from "./PickupPointsModal";

// ─────────────────────────────────────────────────────────────
// SELECTOR DE ENVÍO PARA EL CHECKOUT — ZIPNOVA
//
// Cotiza el envío de los productos de UN vendedor según la dirección
// seleccionada y la modalidad ("shipping"). El comprador elige una de las
// opciones devueltas por Zipnova y esa opción es la que se SUMA al total
// a transferir (solo si el pedido NO tiene envío gratis).
//
// • Si el comprador eligió "retiro en sucursal" (deliveryMethod="pickup"),
//   el envío es GRATIS y no cotizamos.
// • Si TODOS los productos del vendedor tienen `shipping.free === true`,
//   tampoco cotizamos (envío $0 / "GRATIS").
//
// Props:
//   - products: array de productos del vendedor (con shipping.dimensions)
//   - address:  dirección seleccionada (street, streetNumber, city, province, zipCode)
//   - deliveryMethod: "shipping" | "pickup"
//   - onShippingChange(option|null): notifica la opción elegida (o null = gratis/no cotizado)
// ─────────────────────────────────────────────────────────────

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

/** Formatea un monto en ARS sin decimales. */
const formatArs = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

/**
 * Construye el item de Zipnova a partir de las dimensiones del producto.
 * IMPORTANTE: weight está en KG en el modelo → Zipnova espera GRAMOS ×1000.
 * dimensiones en cm. Si no hay datos, usamos defaults razonables.
 */
const buildItem = (product) => {
  const dim = product?.shipping?.dimensions || {};
  const weightKg = Number(dim.weight);
  const weightG = weightKg > 0 ? Math.ceil(weightKg * 1000) : 500;

  return {
    sku: product?.sku || undefined,
    description: product?.name || undefined,
    weight: weightG,
    height: Number(dim.height) > 0 ? Math.ceil(Number(dim.height)) : 10,
    width: Number(dim.width) > 0 ? Math.ceil(Number(dim.width)) : 15,
    length:
      Number(dim.length || dim.depth) > 0
        ? Math.ceil(Number(dim.length || dim.depth))
        : 20,
  };
};

export default function CheckoutShippingSelector({
  products = [],
  address,
  deliveryMethod = "shipping",
  onShippingChange,
}) {
  const { getAccessToken } = usePrivy();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [showAll, setShowAll] = useState(false);
  // Índice de la opción elegida dentro de `sorted` (0 = la más barata por
  // defecto). Usamos el índice porque Zipnova NO devuelve una key estable.
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Punto de entrega elegido por el comprador (solo para servicios que lo
  // ofrecen, ej. Correo Argentino/OCA con pickup_points). Se guarda normalizado
  // ({ id, name, street, ... }) y se reenvía al padre vía onShippingChange.
  const [selectedPickupPoint, setSelectedPickupPoint] = useState(null);
  const [showPointsModal, setShowPointsModal] = useState(false);

  // ¿El pedido tiene envío gratis? Basta con que TODOS los productos del
  // vendedor tengan shipping.free === true, o que algún producto sea digital.
  const isFreeShipping = useMemo(() => {
    if (!products.length) return true;
    return products.every(
      (p) => p.shipping?.free === true || p.shipping?.isDigital === true,
    );
  }, [products]);

  // Valor declarado = suma de productos (precio efectivo × cantidad). No
  // incluye envío.
  const declaredValue = useMemo(
    () =>
      products.reduce((acc, p) => {
        const effective =
          p.sale && p.sale.price > 0 ? p.sale.price : p.price;
        return acc + effective * (p.quantity || 1);
      }, 0),
    [products],
  );

  const quote = useCallback(async () => {
    if (!products.length) return;
    if (!address?.zipCode || !address?.city || !address?.province) {
      setError(
        "Completá código postal, ciudad y provincia de la dirección para cotizar el envío.",
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Iniciá sesión para calcular el envío.");
        return;
      }

      // Un item por unidad: replicamos cada producto por su cantidad para que
      // Zipnova cotice el bulto real. (Los servicios suelen agrupar por peso.)
      const items = products.flatMap((p) =>
        Array.from({ length: p.quantity || 1 }, () => buildItem(p)),
      );

      const payload = {
        declared_value: declaredValue,
        destination: {
          zipcode: String(address.zipCode).trim(),
          city: address.city,
          state: toZipnovaState(address.province),
          street: address.street,
          street_number: address.streetNumber,
        },
        items,
        type_packaging: "dynamic",
        sort_by: "price",
        // Incluye, en cada resultado que aplique, los puntos de entrega
        // (sucursales donde el comprador puede retirar su compra).
        include_dropoff_points: 1,
      };

      const { data } = await axios.post(
        `${SERVER_URL}/api/shipping/quote`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!data.success) {
        const detailMsg = data?.details?.errors
          ? Object.entries(data.details.errors)
              .map(([field, msgs]) => `${field}: ${[].concat(msgs).join(", ")}`)
              .join(" | ")
          : "";
        throw new Error(
          detailMsg
            ? `No se pudo cotizar (${detailMsg})`
            : data.message || "No se pudo cotizar el envío",
        );
      }

      const all = data.quote?.all_results || [];
      setResults(all);
      if (all.length === 0) {
        setError("No hay opciones de envío para esa ubicación.");
      }
    } catch (err) {
      console.error("Error cotizando envío (checkout):", err);
      setResults(null);
      setError(
        err.response?.data?.message ||
          err.message ||
          "No se pudo calcular el envío.",
      );
    } finally {
      setLoading(false);
    }
  }, [products, address, declaredValue, getAccessToken]);

  // Cotizamos automáticamente cuando cambian la dirección o los productos,
  // SIEMPRE que no sea gratis ni retiro en sucursal.
  useEffect(() => {
    if (deliveryMethod !== "shipping") {
      setResults(null);
      setError("");
      setSelectedIndex(0);
      return;
    }
    if (isFreeShipping) {
      setResults(null);
      setError("");
      setSelectedIndex(0);
      return;
    }
    quote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deliveryMethod,
    isFreeShipping,
    address?.zipCode,
    address?.city,
    address?.province,
    address?.street,
    address?.streetNumber,
    products.map((p) => p._id).join(","),
    products.map((p) => p.quantity).join(","),
  ]);

  // Orden: más barata primero.
  const sorted = useMemo(() => {
    if (!results) return null;
    return [...results].sort(
      (a, b) =>
        Number(a.amounts?.price_incl_tax || 0) -
        Number(b.amounts?.price_incl_tax || 0),
    );
  }, [results]);

  // Puntos de entrega de la opción seleccionada. Si el comprador cambia de
  // opción, los puntos son otros, así que limpiamos la selección previa.
  const selectedOption = sorted?.[selectedIndex] || sorted?.[0] || null;
  const optionPoints = usePickupPoints(selectedOption?.pickup_points || []);
  const requiresPickupPoint = optionPoints.length > 0;

  // Al cambiar de opción (o de cotización) reseteamos el punto elegido: los
  // puntos pertenecen a una opción concreta y no son intercambiables.
  useEffect(() => {
    setSelectedPickupPoint(null);
  }, [selectedIndex, sorted]);

  // Notificamos al padre el envío seleccionado:
  //   - gratis (envío $0) cuando corresponde.
  //   - o la opción cotizada elegida (con su pickupPoint si aplica).
  useEffect(() => {
    if (!onShippingChange) return;
    if (deliveryMethod === "pickup" || isFreeShipping) {
      onShippingChange(null);
      return;
    }
    if (!sorted || sorted.length === 0) {
      onShippingChange(null);
      return;
    }
    // Resolvemos por índice (Zipnova no devuelve key estable). Si el índice
    // quedó fuera de rango (cambió la lista tras re-cotizar), caemos a la
    // opción más barata.
    const chosen = sorted[selectedIndex] || sorted[0];
    // Adjuntamos el punto de entrega elegido (null si la opción no lo requiere
    // o el comprador todavía no eligió uno). El checkout usa esto para saber
    // si puede avanzar y para registrar el punto en la orden.
    onShippingChange({
      ...chosen,
      pickupPoint: selectedPickupPoint || null,
      requiresPickupPoint:
        (chosen?.pickup_points?.length || 0) > 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, selectedIndex, deliveryMethod, isFreeShipping, selectedPickupPoint]);

  const deliveryLabel = (r) =>
    r?.delivery_time?.min != null
      ? `${r.delivery_time.min}-${r.delivery_time.max} días`
      : "a confirmar";

  const keyOf = (r, i) =>
    `${r?.carrier?.id || r?.carrier?.name || "log"}-${
      r?.service_type?.code || r?.service_type?.name || i
    }-${r?.amounts?.price_incl_tax}-${i}`;

  // ── Retiro en sucursal: gratis, sin cotización ──
  if (deliveryMethod === "pickup") {
    return (
      <div className="flex gap-2.5 text-sm text-gray-600 dark:text-gray-400">
        <Truck size={16} className="shrink-0 mt-0.5 text-[#00bb2d]" />
        <span>Retiro en sucursal — <b className="text-[#00bb2d]">GRATIS</b></span>
      </div>
    );
  }

  // ── Envío gratis (todos los productos) ──
  if (isFreeShipping) {
    return (
      <div className="flex gap-2.5 text-sm text-gray-600 dark:text-gray-400">
        <Truck size={16} className="shrink-0 mt-0.5 text-[#00bb2d]" />
        <span>Envío — <b className="text-[#00bb2d]">GRATIS</b></span>
      </div>
    );
  }

  // ── Loading inicial ──
  if (loading && !sorted) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin" />
        Calculando costo de envío...
      </div>
    );
  }

  // ── Sin opciones / error ──
  if ((!sorted || sorted.length === 0) && !loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">No pudimos calcular el envío</p>
            {error && <p className="text-xs mt-0.5">{error}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={quote}
          className="text-[#3483fa] text-xs hover:underline"
        >
          Reintentar cotización
        </button>
      </div>
    );
  }

  // ── Opciones disponibles ──
  const cheapest = sorted[0];
  const rest = sorted.slice(1);

  return (
    <div className="space-y-2">
      {/* Opción seleccionada (más barata por defecto) */}
      <label
        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
          "border-[#3483fa] bg-blue-50 dark:bg-blue-900/10"
        }`}
      >
        <input
          type="radio"
          name="checkout-shipping"
          className="w-4 h-4 mt-0.5 accent-[#3483fa]"
          checked={selectedIndex === 0}
          onChange={() => setSelectedIndex(0)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold dark:text-white truncate">
              {cheapest.carrier?.name || "Logística"}
              {cheapest.service_type?.name
                ? ` · ${cheapest.service_type.name}`
                : ""}
            </p>
            <span className="text-sm font-black text-[#3483fa] whitespace-nowrap">
              {formatArs(cheapest.amounts?.price_incl_tax)}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
            <Truck size={11} /> llega en {deliveryLabel(cheapest)}
          </p>
        </div>
      </label>

      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[#3483fa] text-xs hover:underline inline-flex items-center gap-1 ml-1"
          >
            {showAll
              ? "Ver menos"
              : `Ver ${rest.length} opción${rest.length > 1 ? "es" : ""} más`}
            {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showAll &&
            rest.map((r, i) => {
              const idx = i + 1; // índice dentro de `sorted`
              const k = keyOf(r, idx);
              const isSel = selectedIndex === idx;
              return (
                <label
                  key={k}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    isSel
                      ? "border-[#3483fa] bg-blue-50 dark:bg-blue-900/10"
                      : "border-gray-200 dark:border-gray-800 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="checkout-shipping"
                    className="w-4 h-4 mt-0.5 accent-[#3483fa]"
                    checked={isSel}
                    onChange={() => setSelectedIndex(idx)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold dark:text-white truncate">
                        {r.carrier?.name || "Logística"}
                        {r.service_type?.name
                          ? ` · ${r.service_type.name}`
                          : ""}
                      </p>
                      <span className="text-sm font-bold dark:text-white whitespace-nowrap">
                        {formatArs(r.amounts?.price_incl_tax)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      llega en {deliveryLabel(r)}
                    </p>
                  </div>
                </label>
              );
            })}
        </>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1 ml-1">
        <MapPin size={11} />
        Calculado para CP {address?.zipCode}
        {address?.city ? ` (${address.city})` : ""}
        {loading && <Loader2 size={11} className="animate-spin ml-1" />}
      </p>

      {/* PUNTO DE ENTREGA: si la opción elegida ofrece sucursales (Correo
          Argentino/OCA), el comprador DEBE elegir dónde retira su compra.
          Mostramos el elegido o el botón para abrir el selector. */}
      {requiresPickupPoint && (
        <div className="mt-2 p-3 rounded-xl border border-[#3483fa]/40 bg-blue-50 dark:bg-blue-900/10 space-y-2">
          <div className="flex items-start gap-2">
            <Store size={16} className="shrink-0 mt-0.5 text-[#3483fa]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold dark:text-white">
                Punto de entrega
              </p>
              {selectedPickupPoint ? (
                <div className="mt-0.5">
                  <p className="text-xs text-gray-700 dark:text-gray-300 font-medium flex items-center gap-1">
                    <CheckCircle size={12} className="text-[#3483fa]" />
                    {selectedPickupPoint.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {[
                      selectedPickupPoint.street,
                      selectedPickupPoint.streetNumber,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    {selectedPickupPoint.city
                      ? `, ${selectedPickupPoint.city}`
                      : ""}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                  Elegí una sucursal donde retirar tu compra para continuar.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPointsModal(true)}
            className="w-full py-2 rounded-xl border border-[#3483fa] text-[#3483fa] text-xs font-bold uppercase tracking-wide hover:bg-[#3483fa0d] transition-colors"
          >
            {selectedPickupPoint
              ? "Cambiar punto de entrega"
              : `Elegir entre ${optionPoints.length} punto${
                  optionPoints.length > 1 ? "s" : ""
                }`}
          </button>
        </div>
      )}

      {/* Selector de punto de entrega (modal). Muestra TODAS las opciones. */}
      <PickupPointsModal
        open={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        points={selectedOption?.pickup_points || []}
        selectable
        selectedPoint={selectedPickupPoint}
        onSelect={(p) => {
          setSelectedPickupPoint(p);
          setShowPointsModal(false);
        }}
        serviceLabel={`${selectedOption?.carrier?.name || "Logística"}${
          selectedOption?.service_type?.name
            ? ` · ${selectedOption.service_type.name}`
            : ""
        }`}
      />
    </div>
  );
}
