import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { Truck, ChevronDown, ChevronUp, MapPin, Loader2, Store } from "lucide-react";
import { useUserStore } from "../store/useUserStore";
import PostalCodeInput from "./PostalCodeInput";
import PickupPointsModal, { usePickupPoints } from "./PickupPointsModal";
import { toZipnovaState } from "../Utils/postalCodes";

// ─────────────────────────────────────────────────────────────
// CAJA DE COTIZACIÓN DE ENVÍOS — ZIPNOVA
//
// Muestra al COMPRADOR el costo estimado de envío del producto.
// Reutilizable (ProductDetail y, a futuro, Checkout/Cart).
//
// Flujo UX (SOLO cotizamos con sesión iniciada, para cuidar el rate limit
// y la cuota de la cuenta de Zipnova):
//   0. Si no hay sesión → mostramos un aviso e invitamos a iniciar sesión.
//   1. Si hay sesión y el comprador tiene una dirección guardada,
//      usamos su CP/ciudad/provincia y cotizamos automáticamente.
//   2. Si hay sesión pero no tiene dirección, mostramos "Calcular envío"
//      que despliega los campos CP + Ciudad + Provincia (Zipnova exige
//      city+state cuando no se usa un destination.id del address book).
//   3. Se muestra la opción más BARATA por defecto; el resto queda
//      colapsado detrás de "Ver N opciones más".
//
// NOTA (pendiente futuro): hoy `product.shipping.free` es solo un
// label del vendedor. Cuando se resuelva, si `free === false` el
// costo cotizado debería sumarse al total a pagar por el comprador.
// Por ahora es puramente informativo.
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
 * IMPORTANTE: `product.shipping.dimensions.weight` está en KG según el
 * modelo, pero Zipnova espera GRAMOS → multiplicamos por 1000.
 * Las dimensiones (width/height/length) están en cm y se envían tal cual.
 * Si el producto no tiene dimensiones cargadas, usamos un default razonable
 * para no romper la cotización.
 */
const buildItem = (product) => {
  const dim = product?.shipping?.dimensions || {};
  const weightKg = Number(dim.weight);
  // Convertimos kg → gramos y redondeamos HACIA ARRIBA: Zipnova exige enteros
  // y preferimos sobreestimar levemente antes que subestimar la tarifa.
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

export default function ShippingQuoteBox({ product, onQuoteChange }) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const dbUser = useUserStore((s) => s.dbUser);

  // Dirección principal guardada (si existe) para el prefill automático.
  const savedAddress = useMemo(() => {
    const list = dbUser?.addresses || [];
    return list.find((a) => a.isDefault) || list[0] || null;
  }, [dbUser]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // Modal de puntos de entrega (solo lectura en la ficha de producto).
  // `pickupPoints` guarda los puntos de la opción cotizada que se está viendo.
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pickupPoints, setPickupPoints] = useState([]);

  // Datos manuales cuando no hay dirección guardada / no está logueado.
  // Zipnova exige CP + Ciudad + Provincia (a menos que mandemos un
  // destination.id de su address book, que no es el caso).
  const [manual, setManual] = useState({
    zipcode: "",
    city: "",
    province: "",
  });
  const [showManual, setShowManual] = useState(false);

  // Avisamos al padre cuál es la opción seleccionada (la más barata).
  useEffect(() => {
    if (onQuoteChange) onQuoteChange(results?.[0] || null);
  }, [results, onQuoteChange]);

  const quote = useCallback(
    async ({ zipcode, city, province, street, streetNumber }) => {
      if (!product?._id) return;

      // Sólo cotizamos con sesión iniciada (protege el rate limit / cuota
      // de la cuenta Zipnova). El backend igual lo exige con verifyPrivyToken.
      if (!authenticated) {
        setError("Iniciá sesión para calcular el envío.");
        return;
      }

      // Zipnova exige: destination.id  Ó  (destination.city + destination.state).
      // Como cotizamos por dirección literal, mandamos city+state (+zipcode).
      const destination = {};
      if (zipcode) destination.zipcode = String(zipcode).trim();
      if (city) destination.city = city;
      // Normalizamos la provincia al término que espera Zipnova
      // (ej: "Capital Federal" → "CABA").
      if (province) destination.state = toZipnovaState(province);
      if (street) destination.street = street;
      if (streetNumber) destination.street_number = streetNumber;

      // Validación local: evitar llamar a la API con datos incompletos.
      if (!destination.zipcode || !destination.city || !destination.state) {
        setError(
          "Completá código postal, ciudad y provincia para cotizar el envío.",
        );
        return;
      }

      setLoading(true);
      setError("");
      try {
        const token = await getAccessToken();
        // Si no hay token (sesión no lista / expirada), no llamamos a la API:
        // evita mandar "Bearer null" y recibir un 401 críptico.
        if (!token) {
          setError("Iniciá sesión para calcular el envío.");
          return;
        }

        const payload = {
          declared_value:
            Number(product.sale?.active ? product.sale.price : product.price) ||
            0,
          destination,
          items: [buildItem(product)],
          type_packaging: "dynamic",
          sort_by: "price",
          // Pedimos a Zipnova que incluya, en cada resultado que aplique
          // (ej. Correo Argentino, OCA), los puntos de entrega donde el
          // comprador puede retirar su compra.
          include_dropoff_points: 1,
        };

        const { data } = await axios.post(
          `${SERVER_URL}/api/shipping/quote`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!data.success) {
          // El backend propaga `details` con los errores de validación de Zipnova.
          const detailMsg = data?.details?.errors
            ? Object.entries(data.details.errors)
                .map(
                  ([field, msgs]) => `${field}: ${[].concat(msgs).join(", ")}`,
                )
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
        console.error("Error cotizando envío:", err);
        setResults(null);
        setError(
          err.response?.data?.message ||
            err.message ||
            "No se pudo calcular el envío.",
        );
      } finally {
        setLoading(false);
      }
    },
    [product, getAccessToken, authenticated],
  );

  // Auto-cotización: sólo si hay sesión y dirección guardada con datos completos.
  useEffect(() => {
    if (
      authenticated &&
      savedAddress?.zipCode &&
      savedAddress?.city &&
      savedAddress?.province
    ) {
      quote({
        zipcode: savedAddress.zipCode,
        city: savedAddress.city,
        province: savedAddress.province,
        street: savedAddress.street,
        streetNumber: savedAddress.streetNumber,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, savedAddress?.zipCode, product?._id]);

  const handleManualQuote = (e) => {
    e.preventDefault();
    quote({
      zipcode: manual.zipcode,
      city: manual.city,
      province: manual.province,
    });
  };

  // Orden: más barata primero (por si el backend no lo garantiza).
  const sorted = useMemo(() => {
    if (!results) return null;
    return [...results].sort(
      (a, b) =>
        Number(a.amounts?.price_incl_tax || 0) -
        Number(b.amounts?.price_incl_tax || 0),
    );
  }, [results]);

  const cheapest = sorted?.[0] || null;
  const rest = sorted?.slice(1) || [];

  // Puntos de entrega de la opción más barata (la que se muestra arriba).
  // En la ficha solo los visualizamos, por eso limitamos a 5 en el modal.
  const cheapestPoints = usePickupPoints(cheapest?.pickup_points || []);

  const deliveryLabel = (r) =>
    r?.delivery_time?.min != null
      ? `${r.delivery_time.min}-${r.delivery_time.max} días`
      : "a confirmar";

  // ── Render ────────────────────────────────────────────────

  // Sin sesión: no cotizamos. Invitamos a iniciar sesión.
  if (!authenticated) {
    return (
      <div className="flex gap-2.5">
        <Truck className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 dark:text-gray-200 text-sm font-medium">
            Envío a cargo del comprador
          </p>
          <button
            type="button"
            onClick={() => login?.()}
            className="text-[#3483fa] text-xs cursor-pointer hover:underline"
          >
            Iniciá sesión para ver el costo de envío
          </button>
        </div>
      </div>
    );
  }

  // Estado de carga inicial
  if (loading && !results) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin" />
        Calculando costo de envío...
      </div>
    );
  }

  // Resultado disponible
  if (cheapest) {
    return (
      <>
      <div className="space-y-2">
        <div className="flex gap-2.5">
          <Truck className="w-4 h-4 shrink-0 mt-0.5 text-green-500" />
          <div className="min-w-0">
            <p className="text-green-600 dark:text-green-500 text-sm font-medium">
              Envío desde {formatArs(cheapest.amounts?.price_incl_tax)}
            </p>
            <p className="text-gray-500 text-xs">
              {cheapest.carrier?.name || "Logística"} · llega en{" "}
              {deliveryLabel(cheapest)}
              {cheapest.service_type?.name
                ? ` · ${cheapest.service_type.name}`
                : ""}
            </p>

            {rest.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 text-[#3483fa] text-xs hover:underline inline-flex items-center gap-1"
              >
                {showAll
                  ? "Ver menos"
                  : `Ver ${rest.length} opción${rest.length > 1 ? "es" : ""} más`}
                {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}

            {/* PUNTOS DE ENTREGA (Correo Argentino, OCA, etc.): la opción más
                barata ofrece sucursales donde el comprador puede retirar. Como
                en la ficha solo informamos, mostramos un botón que abre un
                modal con las primeras 5. */}
            {cheapestPoints.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPickupPoints(cheapest?.pickup_points || []);
                  setShowPointsModal(true);
                }}
                className="mt-1.5 text-[#3483fa] text-xs hover:underline inline-flex items-center gap-1"
              >
                <Store size={12} />
                Ver {Math.min(cheapestPoints.length, 5)} punto
                {Math.min(cheapestPoints.length, 5) > 1 ? "s" : ""} de entrega
              </button>
            )}
          </div>
        </div>

        {showAll && rest.length > 0 && (
          <ul className="ml-6 space-y-1.5 border-l border-gray-100 dark:border-gray-800 pl-3">
            {rest.map((r, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium dark:text-gray-300">
                  {formatArs(r.amounts?.price_incl_tax)}
                </span>{" "}
                · {r.carrier?.name || "Logística"} · {deliveryLabel(r)}
                {r?.pickup_points?.length > 0 && (
                  <span className="text-[#3483fa] ml-1">
                    · {r.pickup_points.length} puntos de entrega
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Ubicación usada para la cotización */}
        <p className="text-[11px] text-gray-400 flex items-center gap-1 ml-6">
          <MapPin size={11} />
          {savedAddress?.zipCode
            ? `Calculado para CP ${savedAddress.zipCode}${
                savedAddress.city ? ` (${savedAddress.city})` : ""
              }`
            : "Cotización estimada"}
          {!savedAddress?.zipCode && (
            <button
              type="button"
              onClick={() => {
                setResults(null);
                setShowManual(true);
              }}
              className="text-[#3483fa] hover:underline ml-1"
            >
              Cambiar
            </button>
          )}
        </p>
      </div>

      {/* Modal de puntos de entrega — SOLO LECTURA en la ficha (el comprador
          elige el punto definitivo recién en el checkout). Máximo 5 puntos. */}
      <PickupPointsModal
        open={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        points={pickupPoints}
        selectable={false}
        limit={5}
        serviceLabel={`${cheapest.carrier?.name || "Logística"}${
          cheapest.service_type?.name ? ` · ${cheapest.service_type.name}` : ""
        }`}
      />
      </>
    );
  }

  // Sin resultado: pedir CP + Ciudad + Provincia (manual o por falta de datos/sesión)
  return (
    <div className="flex gap-2.5">
      <Truck className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 dark:text-gray-200 text-sm font-medium">
          Envío a cargo del comprador
        </p>

        {!showManual ? (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="text-[#3483fa] text-xs cursor-pointer hover:underline"
          >
            Calcular costo de envío
          </button>
        ) : (
          <form onSubmit={handleManualQuote} className="mt-2 space-y-2">
            <PostalCodeInput
              zipCode={manual.zipcode}
              province={manual.province}
              city={manual.city}
              cityAsSelect
              onChange={({ zipCode, province, city }) =>
                setManual((prev) => ({
                  ...prev,
                  ...(zipCode !== undefined ? { zipcode: zipCode } : {}),
                  ...(province !== undefined ? { province } : {}),
                  ...(city !== undefined ? { city } : {}),
                }))
              }
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-xl bg-[#3483fa] text-white text-xs font-bold uppercase tracking-wide hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Calculando..." : "Calcular envío"}
            </button>
          </form>
        )}

        {error && <p className="text-red-500 text-[11px] mt-1">{error}</p>}
      </div>
    </div>
  );
}
