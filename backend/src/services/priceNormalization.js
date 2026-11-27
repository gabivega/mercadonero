// backend/src/services/priceNormalization.js
//
// ════════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN DE PRECIOS A ARS (productos publicados en USD)
//
// POR QUÉ EXISTE:
//   El vendedor puede publicar un producto en ARS o en USD (`product.currency`,
//   ver ProductForm → select "Moneda"). El modelo Order, en cambio, guarda
//   `productsAmount` / `totalAmount` SIEMPRE en ARS (el flujo de transferencia
//   bancaria, el envío de Zipnova y los montos bancarios son en pesos).
//
//   El bug que esto corrige: `createOrder` sumaba `product.price` tal cual,
//   sin mirar `product.currency`. Un producto listado a "US$ 1.200" generaba
//   una orden por "$1.200 ARS" (≈ US$ 1), y el "Total a transferir" que veía
//   el comprador era literalmente el número del dólar leído como pesos.
//
//   Regla: el precio en USD se convierte a ARS con el MISMO TDC que después
//   se usa para calcular los montos on-chain (`calculateOrderFinancials` →
//   dolarapi "cripto" venta), así el comprador paga en ARS lo exacto que se
//   congela en USDT en el escrow.
// ════════════════════════════════════════════════════════════════════════════

import { getTdc } from "./tdcService.js";

/**
 * ¿El producto está publicado en USD?
 * Solo el string exacto "USD" cuenta; cualquier otra cosa (undefined, "ARS",
 * datos viejos) se trata como ARS, que es el default histórico del modelo.
 * @param {{currency?: string}} product
 * @returns {boolean}
 */
export const isProductInUsd = (product) =>
  String(product?.currency || "").toUpperCase() === "USD";

/**
 * Trae el tipo de cambio (ARS por 1 USD/USDT) que hay que usar para el
 * checkout. Es el mismo `usdRate` que después consume `calculateOrderFinancials`
 * para el escrow, para que el ARS mostrado y el USDT congelado coincidan.
 *
 * @returns {Promise<number|null>} ARS por USD (null si no se pudo obtener)
 */
export async function fetchUsdRate() {
  const res = await getTdc();
  const rate = Number(res?.tdc);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Convierte el precio de un producto a ARS.
 * Los productos en ARS se devuelven intactos (no dependen de la cotización).
 *
 * @param {{price?: number, currency?: string}} product
 * @param {number|null} usdRate  ARS por USD (solo se usa si el producto es USD)
 * @returns {{amountArs: number, converted: boolean}}
 * @throws {Error} si el producto es USD y no hay cotización disponible
 */
export function toArs(product, usdRate) {
  const price = Number(product?.price) || 0;

  if (!isProductInUsd(product)) {
    return { amountArs: price, converted: false };
  }

  if (!usdRate || !Number.isFinite(usdRate) || usdRate <= 0) {
    // Preferimos fallar la creación de la orden antes que cobrarle al
    // comprador el número del dólar como si fueran pesos.
    throw new Error(
      "No pudimos obtener la cotización del dólar para convertir el precio en USD de este producto. Intentá de nuevo en unos minutos.",
    );
  }

  // Redondeamos a centavos: es plata que se transfiere.
  return {
    amountArs: Number((price * usdRate).toFixed(2)),
    converted: true,
  };
}

export default { isProductInUsd, fetchUsdRate, toArs };
