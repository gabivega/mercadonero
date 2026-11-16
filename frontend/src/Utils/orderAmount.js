// Utils/orderAmount.js
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TRAMPA CONOCIDA: `order.totalAmount` del backend MEZCLA MONEDAS.
//
// En `createOrder` (backend/src/controllers/orderController.js) el campo se
// persiste así:
//   - SIN recompensas → está en ARS (productos + envío).
//   - CON recompensas → se guarda `financials.escrowAmountUsd`, que está en USD.
//
// Cualquier listado que haga `$ ${order.totalAmount.toLocaleString()}` asume que
// son PESOS: con una orden que usó saldo de recompensas, un efectivo de "US$3"
// se mostraba como "$3" ARS (el comprador parecía haber comprado por 3 pesos y
// el vendedor pensaba que le pagaron una miseria).
//
// El criterio ya estaba resuelto (duplicado) en OrderInfoAccordion y Checkout;
// este helper centraliza la decisión para no repetir la condición en cada
// pantalla nueva.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿El monto de la orden (`totalAmount` / `productsAmount`) está expresado en
 * USD? Ocurre cuando el comprador usó saldo de recompensas y el backend guardó
 * el efectivo real a pagar (escrowAmountUsd) en lugar del total en pesos.
 *
 * @param {Object} order  orden del backend (usa `financials`)
 * @returns {boolean}
 */
export const isOrderTotalInUsd = (order) => {
  const rewardsUsedUsd = Number(order?.financials?.rewardsUsedUsd || 0);
  if (rewardsUsedUsd <= 0) return false;
  const usdRate = Number(order?.financials?.usdRate || 0);
  // Con recompensas necesitamos el TC para mostrar la equivalencia en pesos;
  // si no está, igual lo tratamos como USD (nunca etiquetar USD como pesos,
  // que es el error visible para el usuario).
  return usdRate > 0 || order?.financials?.escrowAmountUsd != null;
};

/**
 * Tipo de cambio ARS por USD guardado en la orden (0 si no hay).
 */
export const getOrderUsdRate = (order) =>
  Number(order?.financials?.usdRate || 0);

const formatArs = (value) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  );

const formatUsd = (value) =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Arma el texto del monto de una orden respetando la moneda real.
 *
 * - Monto en ARS → "$ 1.234"
 * - Monto en USD → "US$ 3,00 (≈ $ 3.000)"  (equivalencia si hay TC)
 *
 * @param {Object} order   orden del backend
 * @param {Object} [opts]
 * @param {number} [opts.usdRateOverride]  TC a usar si la orden no lo trae
 * @param {boolean} [opts.withArsEquivalent=true]  mostrar "≈ $..." cuando es USD
 * @returns {string}
 */
export const formatOrderAmount = (order, opts = {}) => {
  const { usdRateOverride = 0, withArsEquivalent = true } = opts;
  const raw = Number(order?.totalAmount ?? 0);

  if (!isOrderTotalInUsd(order)) {
    return `$ ${formatArs(raw)}`;
  }

  const usdRate = getOrderUsdRate(order) || Number(usdRateOverride || 0);
  let text = `US$ ${formatUsd(raw)}`;

  // Equivalencia en pesos: transparencia para el comprador/vendedor (así ve que
  // el monto en USD corresponde a un total real en ARS y no a un error).
  if (withArsEquivalent && usdRate > 0) {
    text += ` (≈ $ ${formatArs(raw * usdRate)})`;
  }

  return text;
};

/**
 * Versión compacta (tablas del admin): devuelve el texto y la moneda, sin la
 * equivalencia en pesos (que agregaría ruido en una celda).
 *
 * @param {Object} order
 * @returns {{ text: string, currency: 'ARS'|'USD' }}
 */
export const formatOrderAmountCompact = (order) => {
  const inUsd = isOrderTotalInUsd(order);
  return {
    currency: inUsd ? 'USD' : 'ARS',
    text: inUsd
      ? `US$ ${formatUsd(order?.totalAmount)}`
      : `$ ${formatArs(order?.totalAmount)}`,
  };
};

export default formatOrderAmount;
