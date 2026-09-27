// backend/src/services/groupBuyPricingService.js
//
// SERVICIO DE PRECIOS DE COMPRA GRUPAL.
//
// Reglas de negocio:
//   - El vendedor define `product.socialSelling.tiers`, un mapa indexado por
//     cantidad de compradores (2..5) con el PRECIO UNITARIO en ARS.
//   - Cuando un comprador se SUMA, congela on-chain el equivalente en USDT del
//     PRECIO DEL TIER ACTUAL (según cuántos compradores está en ese momento,
//     incluido él). Ej: si es el 2º, congela precioTier[2]/tdc.
//   - Al LLENARSE el grupo (o cerrarse por plazo con ≥2), el precio FINAL es
//     el del tier del total de compradores. Se recalcula y se cierra on-chain.
//   - La diferencia (lo que cada uno congeló − precioFinal) se le REINTEGRA a
//     cada comprador al liberar su porción (lo hace el contrato).
//
// PRECISIÓN:
//   - El CONTRATO guarda con precisión completa (18 decimales).
//   - El BACKEND redondea SOLO para display (2 decimales). El valor que se
//     envía on-chain va con la precisión completa calculada acá.
//

import { getTdc } from "./tdcService.js";

/**
 * Precio unitario (ARS) para una cantidad de compradores.
 * Si no hay tier exacto, cae al precio base.
 * @param {object} tiers - {2: precio, 3: precio, ...}
 * @param {number} buyersCount
 * @param {number} basePrice
 * @param {number} [baseAt]
 * @returns {number} precio unitario en ARS
 */
export function unitPriceArsForCount(tiers, buyersCount, basePrice) {
  if (tiers && tiers[buyersCount] != null) return Number(tiers[buyersCount]);
  return Number(basePrice) || 0;
}

/**
 * Redondeo SOLO para display (2 decimales). NO usar para on-chain.
 */
export function to2(x) {
  return Math.round(Number(x) * 100) / 100;
}

/**
 * Convierte un precio en ARS a USDT con el TDC.
 * Devuelve precisión completa (sin redondear) para uso on-chain.
 * @returns {Promise<{usdt:number, tdc:number}>}
 */
export async function arsToUsdtFull(amountArs, tdc) {
  const rate = tdc ?? (await getTdc()).tdc;
  if (!rate) throw new Error("TDC no disponible.");
  return { usdt: Number(amountArs) / rate, tdc: rate };
}

/**
 * Calcula TODO lo necesario para que un comprador se SUME al grupo,
 * contemplando SUS unidades (multi-unidad). Los tiers siguen siendo por
 * PERSONAS (buyersCount), pero el monto se multiplica por sus unidades.
 *
 *   usdt = units × precioUnitarioArs(tier actual) / tdc
 *
 * @param {object} opts
 * @param {object} opts.tiers        - product.socialSelling.tiers
 * @param {number} opts.buyersCount  - PERSONAS resultantes (incluido el nuevo)
 * @param {number} opts.units        - unidades que compra este comprador (>=1)
 * @param {number} opts.basePriceArs - precio base unitario del producto (ARS)
 * @param {number} [opts.tdc]        - TDC opcional (si no, se trae)
 * @returns {Promise<{priceArs:number, usdt:number, tdc:number, units:number, totalArs:number}>}
 */
export async function computeJoinAmount({
  tiers,
  buyersCount,
  units,
  basePriceArs,
  tdc,
}) {
  const purchases = Math.max(1, Math.floor(Number(units) || 1));
  const priceArs = unitPriceArsForCount(tiers, buyersCount, basePriceArs);
  const rate = tdc ?? (await getTdc()).tdc;
  if (!rate) throw new Error("TDC no disponible.");
  const totalArs = priceArs * purchases;
  const usdt = totalArs / rate;
  return { priceArs, units: purchases, totalArs, usdt, tdc: rate };
}

/**
 * Calcula el PRECIO FINAL UNITARIO (USDT) cuando el grupo se cierra con
 * `finalBuyers` PERSONAS. Es un precio POR UNIDAD (no total).
 * @returns {Promise<{priceArs:number, usdt:number, tdc:number}>}
 */
export async function computeFinalPrice({
  tiers,
  finalBuyers,
  basePriceArs,
  tdc,
}) {
  const priceArs = unitPriceArsForCount(tiers, finalBuyers, basePriceArs);
  const rate = tdc ?? (await getTdc()).tdc;
  if (!rate) throw new Error("TDC no disponible.");
  return { priceArs, usdt: priceArs / rate, tdc: rate };
}

export { getTdc };
