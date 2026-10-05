// Utils/referralUtils.js
//
// Utilidades del Programa de Referidos (reintegros por compartir).
//
// Reproduce la mecánica del backend (referralService):
//   - El VENDEDOR ofrece un % de reintegro por producto (product.referral.percent).
//   - Ese % se calcula sobre el SUBTOTAL del producto (precio final, sin envío)
//     y se reparte 50/50:
//       * mitad para quien COMPARTIÓ el enlace (referidor)
//       * mitad para el COMPRADOR (reintegro)
//
// Todo se expresa en USDT (la recompensa vive en USD). Acá convertimos el
// precio en ARS a USD con la cotización cripto (misma fuente que el cashback).
import { getUsdRate } from "./cashbackUtils";

/**
 * Calcula el reparto del referido para un producto, en USDT.
 *
 * @param {number} priceArs  precio final del producto en ARS (sin envío)
 * @param {number} percent   % total ofrecido por el vendedor (ej: 10)
 * @param {number} usdRate   cotización ARS por 1 USDT
 * @returns {{ totalUsd:number, eachUsd:number }}
 */
export function calcReferralSplit(priceArs, percent, usdRate) {
  const price = Number(priceArs) || 0;
  const pct = Number(percent) || 0;
  const rate = Number(usdRate) || 0;

  if (price <= 0 || pct <= 0 || rate <= 0) {
    return { totalUsd: 0, eachUsd: 0 };
  }

  const totalUsd = Math.round(((price / rate) * (pct / 100)) * 100) / 100;
  // Reparto 50/50, redondeado a 2 decimales (igual criterio que el backend).
  const eachUsd = Math.round((totalUsd / 2) * 100) / 100;

  return { totalUsd, eachUsd };
}

/**
 * Formatea un monto en USDT para mostrar. Si es muy chico (< 0.5) y no es
 * cero, cae al valor exacto con 2 decimales para no mostrar "0.00".
 */
export function formatUsdt(amount) {
  const n = Number(amount) || 0;
  return `${n.toFixed(2)} USDT`;
}

/**
 * Construye el enlace compartible del producto con el `?ref=` del referidor.
 *
 * @param {object} product    el producto (para armar la ruta SEO)
 * @param {string} referrerId id del usuario que comparte (dbUser._id)
 * @param {string} [baseUrl]  dominio base (default: origin actual)
 * @returns {string} URL absoluta con ?ref=<referrerId>
 */
export function buildReferralUrl(product, referrerId, baseUrl) {
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

// Re-export para que los componentes no importen dos archivos.
export { getUsdRate };
