// Utils/referralUtils.js
//
// Utilidades del Programa de Referidos (reintegros por compartir).
//
// Reproduce la mecánica del backend (referralService):
//   - El VENDEDOR ofrece un % de reintegro por producto (product.referral.percent).
//   - Ese % se calcula sobre el SUBTOTAL del producto (precio final, sin envío)
//     y se reparte según `referrerSharePercent` (configurable, default 75/25):
//       * 75% para quien COMPARTIÓ el enlace (referidor)
//       * 25% para el COMPRADOR (reintegro)
//     El reparto real lo define `ReferralConfig.referrerSharePercent` en el
//     backend; los componentes lo leen del status/config y lo pasan acá.
//
// Todo se expresa en USDT (la recompensa vive en USD). Acá convertimos el
// precio en ARS a USD con la cotización cripto (misma fuente que el cashback).
import axios from "axios";
import { getUsdRate } from "./cashbackUtils";

/**
 * Calcula el reparto del referido para un producto, en USDT.
 *
 * Reparto CONFIGURABLE (por defecto 75/25 referidor/referido). El backend
 * define el % real en `ReferralConfig.referrerSharePercent`; acá lo recibimos
 * para previsualizar exactamente lo que se va a acreditar.
 *
 * @param {number} priceArs       precio final del producto en ARS (sin envío)
 * @param {number} percent        % total ofrecido por el vendedor (ej: 10)
 * @param {number} usdRate        cotización ARS por 1 USDT
 * @param {number} [sharePercent] % que se lleva el REFERIDOR (default 75).
 *                                El comprador recibe (100 - sharePercent).
 * @returns {{ totalUsd:number, referrerUsd:number, buyerUsd:number, eachUsd:number }}
 */
export function calcReferralSplit(priceArs, percent, usdRate, sharePercent = 75) {
  const price = Number(priceArs) || 0;
  const pct = Number(percent) || 0;
  const rate = Number(usdRate) || 0;

  if (price <= 0 || pct <= 0 || rate <= 0) {
    return { totalUsd: 0, referrerUsd: 0, buyerUsd: 0, eachUsd: 0 };
  }

  const totalUsd = Math.round(((price / rate) * (pct / 100)) * 100) / 100;

  // Reparto configurable. Clampeamos a 0-100 por seguridad (default 75).
  const rawShare = Number(sharePercent);
  const share = Number.isFinite(rawShare)
    ? Math.min(100, Math.max(0, rawShare))
    : 75;

  // Mismo criterio que el backend: el referidor se redondea y el comprador
  // se deriva como diferencia (la suma cuadra al centavo).
  const referrerUsd = Math.round(totalUsd * (share / 100) * 100) / 100;
  const buyerUsd = Math.round((totalUsd - referrerUsd) * 100) / 100;

  return {
    totalUsd,
    referrerUsd,
    buyerUsd,
    // Compatibilidad: `eachUsd` se mantiene pero AHORA es la parte del
    // REFERIDOR (la más relevante para el copy "ganá X por venta").
    eachUsd: referrerUsd,
  };
}

/**
 * Formatea un monto en USDT para mostrar. Si es muy chico (< 0.5) y no es
 * cero, cae al valor exacto con 2 decimales para no mostrar "0.00".
 */
export function formatUsdt(amount) {
  const n = Number(amount) || 0;
  return `${n.toFixed(2)} USD`;
}

/**
 * REINTEGRO EXTRA DEL COMPRADOR por haber llegado por un enlace de referido.
 *
 * Es la contraparte de `calcReferralSplit` pero pensada para la ficha del
 * producto: el comprador NO necesita saber cuánto se lleva el referidor, sólo
 * CUÁNTO le acreditan a él. Ese monto es `totalReward * (100 - referrerShare)`.
 *
 * Devuelve, además, el % efectivo para el comprador (para el fallback sin
 * cotización) y un booleano `applies` (si hay algo que mostrar).
 *
 * @param {number}  priceArs            precio final (oferta aplicada) en ARS
 * @param {number}  percent             % total ofrecido por el vendedor
 * @param {number}  usdRate             cotización ARS por 1 USDT
 * @param {number} [referrerSharePercent] % del REFERIDOR (default 75). El
 *                                       comprador recibe el resto (25).
 * @returns {{ applies:boolean, buyerUsd:number, buyerPercent:number }}
 */
export function buyerReferralReward(
  priceArs,
  percent,
  usdRate,
  referrerSharePercent = 75,
) {
  const totalPercent = Number(percent) || 0;

  // Reparto: lo que NO se lleva el referidor es del comprador.
  const rawShare = Number(referrerSharePercent);
  const referrerShare = Number.isFinite(rawShare)
    ? Math.min(100, Math.max(0, rawShare))
    : 75;
  const buyerPercent =
    Math.round((totalPercent - totalPercent * (referrerShare / 100)) * 100) /
    100;

  // El monto exacto se deriva de la MISMA función que usa el resto del front
  // (y que replica el backend), así nunca se desfasan los centavos.
  const { buyerUsd } = calcReferralSplit(
    priceArs,
    totalPercent,
    usdRate,
    referrerShare,
  );

  return {
    applies: totalPercent > 0 && buyerPercent > 0,
    buyerUsd: Number(buyerUsd) || 0,
    buyerPercent,
  };
}

/**
 * Construye el enlace compartible del producto con el `?ref=` del referidor.
 * (Enlace LARGO. Preferí `fetchReferralShortUrl` para compartir: es más corto
 * y trackea clics. Este queda como fallback si el corto falla.)
 *
 * @param {object} product    el producto (para armar la ruta SEO)
 * @param {string} referrerId id del usuario que comparte (dbUser._id)
 * @param {string} [baseUrl]  dominio base (default: origin actual)
 * @returns {string} URL absoluta con ?ref=<referrerId>
 */
export function buildReferralUrl(product, referrerId, baseUrl) {
  // Base = origin actual del navegador (en dev http://localhost:5173, en prod
  // https://mercadonero.com). Sin browser caemos al dominio de prod.
  const base =
    baseUrl ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://mercadonero.com");
  const seg = product?.slug || product?._id || "";
  const path = seg ? `${base}/producto/${seg}` : base;
  if (!referrerId) return path;
  // Preservamos un posible query ya existente y agregamos ref.
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}ref=${encodeURIComponent(referrerId)}`;
}

/**
 * Pide al backend el ENLACE CORTO reutilizable (/r/<code>) para un producto.
 * Única fuente de verdad para "compartir": la usan tanto ProductDetail
 * (ReferralShareBox) como la grilla de /referidos (ReferralProductItem), así
 * el enlace es idéntico en ambos lugares.
 *
 * Si por algún motivo falla (sin token, error de red), cae al enlace largo
 * (`buildReferralUrl`) para no romper el flujo de compartir.
 *
 * @param {object}   product
 * @param {function} getAccessToken  token de sesión (para el header Authorization)
 * @param {string}   referrerId      id del referidor (para el fallback largo)
 * @returns {Promise<string>} URL lista para compartir
 */
export async function fetchReferralShortUrl(product, getAccessToken, referrerId) {
  try {
    const token = await getAccessToken?.();
    if (!token) throw new Error("no-token");
    const { data } = await axios.post(
      `${import.meta.env.VITE_SERVER_URL}/api/referral/link`,
      { productId: product?._id },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (data?.shortUrl) return data.shortUrl;
    throw new Error("no-short-url");
  } catch {
    // Fallback: enlace largo (sigue funcionando aunque no trackee clics).
    return buildReferralUrl(product, referrerId);
  }
}

// Re-export para que los componentes no importen dos archivos.
export { getUsdRate };
