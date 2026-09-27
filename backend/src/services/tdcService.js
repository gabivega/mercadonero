// backend/src/services/tdcService.js
//
// SERVICIO DE TIPO DE CAMBIO (TDC) — ARS por USDT.
//
// Fuente: dolarapi.com/v1/dolares/cripto → campo `venta` (≈ precio del USDT en ARS).
// Se usa para convertir los precios en ARS de los productos a USDT on-chain
// (que es lo que realmente se congela en el escrow).
//
// IMPORTANTE:
//   - El TDC se cachea por un período corto (default 5 min) para no golpear la
//     API en cada request ni variar el monto dentro de una misma operación.
//   - El monto que se congela on-chain (en USDT) es el que MANDA. El precio en
//     ARS es referencial/display. Ver groupBuyPricingService.
//
// Fallback: si la API falla y hay un valor cacheado previo, se usa ese (stale).
//

const DOLARAPI_URL =
  process.env.DOLARAPI_URL || "https://dolarapi.com/v1/dolares/cripto";
// Tiempo de vida del cache en ms (default 5 min).
const TDC_CACHE_TTL_MS = Number(process.env.TDC_CACHE_TTL_MS || 5 * 60 * 1000);

let _cache = { value: null, fetchedAt: 0 };
let _inflight = null; // evita requests concurrentes duplicados

/**
 * Trae el TDC (ARS por USDT) desde dolarapi, con cache.
 * @param {object} [opts]
 * @param {boolean} [opts.force] - ignora el cache y vuelve a pedir.
 * @returns {Promise<{success:boolean, tdc?:number, source?:string, fetchedAt?:number, stale?:boolean, error?:string}>}
 */
export async function getTdc({ force = false } = {}) {
  const now = Date.now();

  // Cache fresco.
  if (!force && _cache.value != null && now - _cache.fetchedAt < TDC_CACHE_TTL_MS) {
    return {
      success: true,
      tdc: _cache.value,
      source: "cache",
      fetchedAt: _cache.fetchedAt,
      stale: false,
    };
  }

  // Request en curso → reusamos la misma promesa.
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const res = await fetch(DOLARAPI_URL, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const venta = Number(data?.venta);
      if (!venta || Number.isNaN(venta) || venta <= 0) {
        throw new Error("Respuesta sin 'venta' válida");
      }
      _cache = { value: venta, fetchedAt: Date.now() };
      return {
        success: true,
        tdc: venta,
        source: "dolarapi",
        fetchedAt: _cache.fetchedAt,
        stale: false,
      };
    } catch (error) {
      console.error("[TDC] Error obteniendo cotización:", error.message);
      // Fallback: último valor cacheado (aunque esté vencido).
      if (_cache.value != null) {
        return {
          success: true,
          tdc: _cache.value,
          source: "cache_stale",
          fetchedAt: _cache.fetchedAt,
          stale: true,
          error: error.message,
        };
      }
      return { success: false, error: error.message };
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

/**
 * Convierte un monto en ARS a USDT usando el TDC actual.
 * @param {number} amountArs
 * @param {number} [tdc] - si no se pasa, se trae del servicio.
 * @returns {Promise<{success:boolean, usdt?:number, tdc?:number, error?:string}>}
 */
export async function arsToUsdt(amountArs, tdc) {
  const rate = tdc ?? (await getTdc()).tdc;
  if (!rate) return { success: false, error: "TDC no disponible." };
  return { success: true, usdt: Number(amountArs) / rate, tdc: rate };
}

export { TDC_CACHE_TTL_MS, DOLARAPI_URL };
