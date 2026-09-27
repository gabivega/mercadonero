import React, { useState } from "react";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import Swal from "sweetalert2";
import { Truck, Package, MapPin, Plus, Trash2, Search } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import PostalCodeInput from "./PostalCodeInput";
import { toZipnovaState } from "../Utils/postalCodes";

// ─────────────────────────────────────────────────────────────
// COTIZADOR DE ENVÍOS — ZIPNOVA
// Componente 100% configurable (dev/testing). Todo por selects/inputs.
// El backend (POST /api/shipping/quote) agrega credenciales + account_id.
//
// Unidades: peso en GRAMOS, dimensiones en CM, valores en ARS.
// ─────────────────────────────────────────────────────────────

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

// Opciones según la doc de Zipnova.
const PACKAGING_TYPES = ["dynamic", "boxes", "none"];
const LOGISTIC_TYPES = ["", "carrier_pickup", "carrier_dropoff", "xd_dropoff"];
const SORT_BY = ["price", "delivery_time"];
const SERVICE_TYPE = [
  "",
  "standard_delivery",
  "express_delivery",
  "pickup_point",
  "same_day_delivery",
];

const emptyItem = () => ({
  sku: "",
  weight: "",
  height: "",
  width: "",
  length: "",
  classification_id: "",
  description: "",
  must_keep_vertical: false,
});

// Estilos reutilizables (alineados al theme de la app).
const inputCls =
  "w-full mt-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl p-3 font-medium dark:text-white outline-none focus:ring-2 focus:ring-[#F26722] text-sm";
const labelCls = "text-[10px] font-bold uppercase text-zinc-400 ml-2";

const ShippingQuoteCalculator = () => {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  // ── Configuración general ──────────────────────────────
  const [declaredValue, setDeclaredValue] = useState(10000);
  const [typePackaging, setTypePackaging] = useState("dynamic");
  const [logisticType, setLogisticType] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [sortBy, setSortBy] = useState("price");
  const [avoidRules, setAvoidRules] = useState(false);
  const [includeDropoff, setIncludeDropoff] = useState(0);

  // ── Origen (opcional; si vacío se usa el del .env) ─────
  const [originId, setOriginId] = useState("");

  // ── Destino ────────────────────────────────────────────
  const [destination, setDestination] = useState({
    city: "Rosario",
    state: "Santa Fe",
    zipcode: "2000",
    street: "",
    street_number: "",
  });

  // ── Items ──────────────────────────────────────────────
  const [items, setItems] = useState([
    {
      sku: "",
      weight: 500,
      height: 10,
      width: 15,
      length: 20,
      classification_id: "general",
      description: "",
      must_keep_vertical: false,
    },
  ]);

  const [results, setResults] = useState(null);
  const [usedRequest, setUsedRequest] = useState(null);

  const updateItem = (idx, key, value) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)),
    );
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleQuote = async () => {
    // Validación cliente mínima.
    if (!destination.city || !destination.state) {
      return Swal.fire({
        title: "FALTAN DATOS",
        text: "Completá al menos ciudad y provincia de destino.",
        icon: "warning",
        confirmButtonColor: "#F26722",
      });
    }
    if (
      items.some(
        (it) => !it.weight || !it.height || !it.width || !it.length,
      )
    ) {
      return Swal.fire({
        title: "ITEMS INCOMPLETOS",
        text: "Cada item necesita peso, alto, ancho y largo.",
        icon: "warning",
        confirmButtonColor: "#F26722",
      });
    }

    setLoading(true);
    setResults(null);
    try {
      const token = await getAccessToken();

      // Normalizamos: strings vacíos se omiten para no ensuciar el request.
      const cleanItems = items.map((it) => {
        const out = {};
        for (const [k, v] of Object.entries(it)) {
          if (v === "" || v == null) continue;
          out[k] = ["weight", "height", "width", "length"].includes(k)
            ? Number(v)
            : v;
        }
        return out;
      });

      const payload = {
        declared_value: Number(declaredValue),
        // Normalizamos la provincia al término que espera Zipnova.
        destination: {
          ...destination,
          state: toZipnovaState(destination.state),
        },
        items: cleanItems,
        type_packaging: typePackaging,
        sort_by: sortBy,
        avoid_rules: avoidRules,
        include_dropoff_points: includeDropoff,
      };
      if (logisticType) payload.logistic_type = logisticType;
      if (serviceType) payload.service_type = serviceType;
      if (originId) payload.origin_id = Number(originId);

      const { data } = await axios.post(
        `${SERVER_URL}/api/shipping/quote`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (data.success) {
        setResults(data.quote);
        setUsedRequest(data.request);
      } else {
        throw new Error(data.message || "Error al cotizar");
      }
    } catch (error) {
      console.error("Error al cotizar envío:", error);
      Swal.fire({
        title: "ERROR AL COTIZAR",
        text:
          error.response?.data?.message ||
          error.message ||
          "No se pudo obtener la cotización.",
        icon: "error",
        confirmButtonColor: "#ef4444",
      });
    } finally {
      setLoading(false);
    }
  };

  // all_results -> lista plana para mostrar.
  const allResults = results?.all_results || [];

  return (
    <div className="bg-white dark:bg-zinc-900 border-2 border-[#F26722]/20 p-6 rounded-[2.5rem] shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-[#F26722] p-2 rounded-xl text-white">
          <Truck size={20} />
        </div>
        <div>
          <h3 className="font-black uppercase tracking-tight dark:text-white">
            Cotizador de Envíos — Zipnova
          </h3>
          <p className="text-[11px] text-zinc-400">
            Configuración libre para testing. Peso en gramos · medidas en cm.
          </p>
        </div>
      </div>

      {/* ── DESTINO ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-zinc-500">
          <MapPin size={16} />
          <span className="text-xs font-black uppercase">Destino</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <PostalCodeInput
              zipCode={destination.zipcode}
              province={destination.state}
              city={destination.city}
              cityAsSelect
              labels={{ province: "Provincia / Estado", city: "Ciudad" }}
              onChange={({ zipCode, province, city }) =>
                setDestination((prev) => ({
                  ...prev,
                  ...(zipCode !== undefined ? { zipcode: zipCode } : {}),
                  ...(province !== undefined ? { state: province } : {}),
                  ...(city !== undefined ? { city } : {}),
                }))
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={labelCls}>Calle</label>
              <input
                className={inputCls}
                value={destination.street}
                onChange={(e) =>
                  setDestination({ ...destination, street: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Altura</label>
              <input
                className={inputCls}
                value={destination.street_number}
                onChange={(e) =>
                  setDestination({
                    ...destination,
                    street_number: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── PARÁMETROS ── */}
      <div className="space-y-3">
        <span className="text-xs font-black uppercase text-zinc-500">
          Parámetros de la cotización
        </span>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Valor declarado (ARS)</label>
            <input
              type="number"
              className={inputCls}
              value={declaredValue}
              onChange={(e) => setDeclaredValue(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>type_packaging</label>
            <select
              className={inputCls}
              value={typePackaging}
              onChange={(e) => setTypePackaging(e.target.value)}
            >
              {PACKAGING_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>logistic_type</label>
            <select
              className={inputCls}
              value={logisticType}
              onChange={(e) => setLogisticType(e.target.value)}
            >
              {LOGISTIC_TYPES.map((p) => (
                <option key={p || "any"} value={p}>
                  {p || "(cualquiera)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>service_type</label>
            <select
              className={inputCls}
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
            >
              {SERVICE_TYPE.map((p) => (
                <option key={p || "any"} value={p}>
                  {p || "(cualquiera)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>sort_by</label>
            <select
              className={inputCls}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_BY.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>include_dropoff_points</label>
            <select
              className={inputCls}
              value={includeDropoff}
              onChange={(e) => setIncludeDropoff(Number(e.target.value))}
            >
              <option value={0}>0 — No</option>
              <option value={1}>1 — Sí</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>origin_id (opcional)</label>
            <input
              className={inputCls}
              placeholder="usa el del .env si vacío"
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs font-bold text-zinc-500 ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={avoidRules}
                onChange={(e) => setAvoidRules(e.target.checked)}
                className="accent-[#F26722]"
              />
              avoid_rules
            </label>
          </div>
        </div>
      </div>

      {/* ── ITEMS ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <Package size={16} />
            <span className="text-xs font-black uppercase">Items</span>
          </div>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-[11px] font-black uppercase text-[#F26722] hover:underline"
          >
            <Plus size={14} /> Agregar item
          </button>
        </div>

        {items.map((it, idx) => (
          <div
            key={idx}
            className="border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 space-y-3"
          >
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-zinc-400">
                Item #{idx + 1}
              </span>
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(idx)}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>SKU</label>
                <input
                  className={inputCls}
                  value={it.sku}
                  onChange={(e) => updateItem(idx, "sku", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Peso (g)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={it.weight}
                  onChange={(e) => updateItem(idx, "weight", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Alto (cm)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={it.height}
                  onChange={(e) => updateItem(idx, "height", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Ancho (cm)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={it.width}
                  onChange={(e) => updateItem(idx, "width", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Largo (cm)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={it.length}
                  onChange={(e) => updateItem(idx, "length", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>classification_id</label>
                <input
                  className={inputCls}
                  value={it.classification_id}
                  onChange={(e) =>
                    updateItem(idx, "classification_id", e.target.value)
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Descripción</label>
                <input
                  className={inputCls}
                  value={it.description}
                  onChange={(e) =>
                    updateItem(idx, "description", e.target.value)
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-zinc-500 cursor-pointer">
              <input
                type="checkbox"
                checked={it.must_keep_vertical}
                onChange={(e) =>
                  updateItem(idx, "must_keep_vertical", e.target.checked)
                }
                className="accent-[#F26722]"
              />
              must_keep_vertical
            </label>
          </div>
        ))}
      </div>

      <button
        onClick={handleQuote}
        disabled={loading}
        className="w-full py-4 bg-zinc-900 dark:bg-white dark:text-black text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" /> Cotizando...
          </>
        ) : (
          <>
            <Search size={18} /> Cotizar envío
          </>
        )}
      </button>

      {/* ── RESULTADOS ── */}
      {results && (
        <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <span className="text-xs font-black uppercase text-zinc-500">
            {allResults.length} opción(es) encontrada(s)
          </span>

          {allResults.length === 0 && (
            <p className="text-sm text-zinc-400">
              Sin resultados para los parámetros elegidos.
            </p>
          )}

          <div className="space-y-3">
            {allResults.map((r, i) => (
              <div
                key={i}
                className="border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {r.carrier?.logo && (
                    <img
                      src={r.carrier.logo}
                      alt={r.carrier?.name}
                      className="w-10 h-10 object-contain"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-black dark:text-white truncate">
                      {r.carrier?.name || "Carrier"}
                    </p>
                    <p className="text-[11px] text-zinc-400 uppercase">
                      {r.service_type?.name || r.service_type?.code} ·{" "}
                      {r.logistic_type}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {r.delivery_time?.min != null
                        ? `${r.delivery_time.min}-${r.delivery_time.max} días`
                        : ""}
                      {r.delivery_time?.estimated_delivery
                        ? ` · ent. máx ${new Date(
                            r.delivery_time.estimated_delivery,
                          ).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-[#F26722] text-lg">
                    ${Number(r.amounts?.price_incl_tax ?? 0).toLocaleString("es-AR")}
                  </p>
                  <p className="text-[10px] text-zinc-400">IVA incl.</p>
                </div>
              </div>
            ))}
          </div>

          {usedRequest && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer font-bold uppercase">
                Ver request enviado
              </summary>
              <pre className="mt-2 bg-zinc-100 dark:bg-zinc-800 p-3 rounded-xl overflow-x-auto">
                {JSON.stringify(usedRequest, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default ShippingQuoteCalculator;
