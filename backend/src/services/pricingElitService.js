// ─────────────────────────────────────────────────────────────────────────────
// PRICING DE PRODUCTOS ELIT (fuente única de verdad)
//
// POR QUÉ EXISTE:
//   El import inicial aplicaba un markup FIJO de 20% a todo el catálogo. Con
//   ~1000 productos que van de $3.000 a $3.500.000 de costo, un % fijo es
//   incoherente: en un parlante de $14k son $2.800 (no cubre ni el envío) y en
//   una notebook de $1M son $200.000 (te saca de mercado).
//
// ESTRATEGIA (híbrida): MARKUP POR ESCALONES + REGLA DE ENVÍO GRATIS
//
//   1. Markup escalonado según el COSTO de Elit (`providerRef.costPvpArs`).
//      Barato → markup alto (necesita cubrir costos fijos). Caro → markup bajo
//      (el margen absoluto ya es grande y hay que ser competitivo).
//
//   2. Envío gratis con DOS condiciones simultáneas:
//        a) PISO DURO DE PRECIO: debajo de $50.000 el envío SIEMPRE se cotiza
//           aparte. No hay excepción. Un accesorio de $5.000 no puede absorber
//           un flete de $12.000: el comprador lo ve cotizado y decide. (No es
//           venta a pérdida: si no le cierra, simplemente no lo compra.)
//        b) REGLA DE MARGEN: arriba de $50.000, es gratis SOLO si
//              margen_neto_$ ≥ 1,25 × envío_estimado
//           Es más robusto que un umbral redondo: un monitor pesado de $180k
//           con flete de $20k y un accesorio liviano de $55k con flete de $12k
//           caen distinto según su propio margen y su propio envío.
//
//   3. Embalaje: costo fijo de $2.000 por unidad, sumado ANTES del markup
//      (es un costo real del vendedor, no una comisión).
//
// COMISIONES (no las aplicamos acá, pero condicionan el piso del markup):
//   3% del precio de venta = 2,5% cashback al comprador + 0,5% plataforma.
//   Se le descuenta al vendedor al liquidar; por eso el piso es 40% y no 30%:
//   en un producto de $20k, 30% ($6k) − 3% ($600) − $2k embalaje = $3.400.
//
// ENVÍO ESTIMADO: se deriva de los datos reales medidos por Zipnova
// (notebook $40k, monitor $20k, soporte $15k, parlante $12k) con un colchón
// del 25% para cubrir variabilidad de tarifas (seguro, combustible, zona).
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. MARKUP POR ESCALONES ──────────────────────────────────────────────────
// Cada tramo es [costoMaxInclusive, markup]. Se recorre en orden y gana el
// primero cuyo `costoMax` alcance al costo. El último tramo es abierto.
export const MARKUP_TIERS = [
  { maxCost: 40000, markup: 0.4, label: 'hasta $40.000' },
  { maxCost: 80000, markup: 0.35, label: '$40.001 - $80.000' },
  { maxCost: 150000, markup: 0.28, label: '$80.001 - $150.000' },
  { maxCost: 300000, markup: 0.2, label: '$150.001 - $300.000' },
  { maxCost: 800000, markup: 0.14, label: '$300.001 - $800.000' },
  { maxCost: Infinity, markup: 0.09, label: '> $800.000' },
];

// Embalaje por unidad (cajas, relleno, cinta, etiqueta). Costo real del
// vendedor: se suma ANTES del markup para que el margen lo cubra.
export const PACKAGING_COST_ARS = 2000;

// Comisión de plataforma: se informa en el resumen, no se aplica al precio
// (el precio es lo que paga el comprador).
export const PLATFORM_FEE_PERCENT = 3; // 2,5% cashback + 0,5% plataforma

// ── PISO DURO PARA ENVÍO GRATIS ──────────────────────────────────────────────
// Debajo de este PRECIO DE VENTA (no de costo) el envío NUNCA es gratis: se
// cotiza aparte. Es la regla de negocio de la plataforma, deliberadamente
// simple: los tickets bajos no pueden subsidiar un flete de ~$12.000.
// Referencia de mercado: Mercado Libre exige envío gratis desde ~$33.000 y los
// vendedores se quejan porque el flete se les come el margen. Nosotros ponemos
// el piso más alto ($50.000) para que el envío gratis sea un beneficio sano,
// no una carga que empuja a vender a pérdida.
export const FREE_SHIPPING_MIN_PRICE = 50000;

// ── 2. ENVÍO ESTIMADO POR PESO ───────────────────────────────────────────────
// Derivado de cotizaciones reales de Zipnova (CP 3000 → CABA/Neuquén/Chaco).
// La distancia casi no incide (2-3%), el peso y el volumen sí.
// Cada tramo: [pesoMaxKg, costoEnvioEstimadoARS]. Último tramo cerrado a 25kg
// porque arriba de eso la cotización real manda (no hay "envío gratis").
export const SHIPPING_ESTIMATE_TIERS = [
  { maxWeightKg: 0.5, cost: 12000 },
  { maxWeightKg: 1, cost: 13000 },
  { maxWeightKg: 2, cost: 14000 },
  { maxWeightKg: 5, cost: 17000 },
  { maxWeightKg: 10, cost: 26000 },
  { maxWeightKg: 25, cost: 45000 },
];

// Peso de referencia por SUBCATEGORÍA cuando el producto no trae peso útil.
// Calibrado con el promedio REAL del catálogo (ver análisis de 986 productos).
// Los valores están tomados del percentil típico, no del promedio (que se
// inflaba con outliers: hubo motherboards cargados en gramos como 3520kg).
export const WEIGHT_BY_SUBCATEGORY = {
  'componentes-de-pc': 2, // promedio limpio ~1kg; gabinetes y fuentes suben
  'perifericos-de-pc': 0.5,
  impresion: 3,
  audio: 1,
  almacenamiento: 0.3,
  'monitores-y-accesorios': 8,
  'notebooks-y-accesorios': 1,
  'cables-y-hubs-usb': 0.15,
  'seguridad-para-el-hogar': 0.2,
  'conectividad-y-redes': 1,
  'estabilizadores-y-ups': 10,
  'pc-de-escritorio': 1.5,
  'accesorios-para-pc-gaming': 2.5,
  'pilas-y-cargadores': 0.2,
  'proyectores-y-pantallas': 3.3,
  'lectores-y-scanners': 2.6,
  'iluminacion-para-el-hogar': 0.1,
  otros: 0.5,
  'energia-renovable': 5,
  consolas: 1,
  'tablets-y-accesorios': 0.3,
  software: 0.05,
};

// Peso por defecto si no hay dato ni subcategoría conocida.
const DEFAULT_WEIGHT_KG = 1;

// Peso MÁXIMO razonable: arriba de esto asumimos que el dato está mal cargado
// (el caso real: motherboard con "3520" kg). Usamos la tabla de subcategoría.
const MAX_SANE_WEIGHT_KG = 60;

// Colchón sobre el envío estimado. Cubre variabilidad de tarifas sin dejar el
// precio en un punto donde el flete se coma el margen.
const SHIPPING_SAFETY_FACTOR = 1.25;

// ── HELPERS ─────────────────────────────────────────────────────────────────

/** Redondea a múltiplo de 10 hacia arriba (estilo comercial, ej: 12.340 → 12.340). */
export const roundCommercial = (n) => {
  const v = Number(n) || 0;
  if (v <= 0) return 0;
  return Math.ceil(v / 10) * 10;
};

/**
 * Devuelve el tramo de markup aplicable a un costo dado.
 * @param {number} cost  Costo del producto (ARS).
 */
export const getMarkupTier = (cost = 0) => {
  const c = Math.max(0, Number(cost) || 0);
  return MARKUP_TIERS.find((t) => c <= t.maxCost) || MARKUP_TIERS[MARKUP_TIERS.length - 1];
};

/**
 * Peso confiable del producto. Prefiere el peso real si es plausible;
 * si está ausente, en 0 o es absurdo (>60kg en una subcategoría liviana),
 * cae a la tabla por subcategoría.
 *
 * @param {{weight?:number, subCategory?:string}} input
 * @returns {number} kg
 */
export const resolveWeightKg = ({ weight, subCategory } = {}) => {
  const w = Number(weight);
  const fallback = WEIGHT_BY_SUBCATEGORY[subCategory] ?? DEFAULT_WEIGHT_KG;

  // Peso plausible → lo usamos (es más preciso que la categoría).
  if (Number.isFinite(w) && w > 0 && w <= MAX_SANE_WEIGHT_KG) return w;

  // Peso ausente/absurdo → fallback por subcategoría.
  // (Un gabinete full tower de 31kg es plausible y se respeta.)
  if (Number.isFinite(w) && w > MAX_SANE_WEIGHT_KG) {
    // Peso absurdo: aplicamos el fallback de categoría, pero si el valor
    // excede 10x el fallback asumimos error de unidad y lo normalizamos
    // (ej: "3520" en una motherboard = 3520 g = 3,52 kg).
    if (w > fallback * 10) {
      const asGrams = w / 1000;
      if (asGrams <= MAX_SANE_WEIGHT_KG) return asGrams;
    }
  }
  return fallback;
};

/**
 * Costo de envío estimado para un peso dado (sin colchón).
 * Arriba de 25kg devuelve `null`: se usa la cotización real de Zipnova.
 * @param {number} weightKg
 * @returns {number|null}
 */
export const estimateShippingCost = (weightKg = 0) => {
  const w = Math.max(0, Number(weightKg) || 0);
  const tier = SHIPPING_ESTIMATE_TIERS.find((t) => w <= t.maxWeightKg);
  return tier ? tier.cost : null; // null = "muy pesado, cotizar real"
};

/**
 * Cálculo completo de precio y envío para un producto.
 *
 * @param {Object} input
 * @param {number} input.cost                  Costo del producto (pvp_ars de Elit).
 * @param {number} [input.weight]              Peso en kg (del producto).
 * @param {string} [input.subCategory]         Slug de subcategoría MN.
 * @param {boolean} [input.freeShippingOverride] Fuerza on/off (ajuste manual).
 * @returns {{
 *   cost:number, markup:number, markupTier:string, markupAmount:number,
 *   packaging:number, price:number, netMargin:number,
 *   weightKg:number, shippingEstimate:number|null,
 *   freeShipping:boolean, freeShippingReason:string, platformFee:number,
 *   marginAfterFees:number
 * }}
 */
export const calculateElitPricing = (input = {}) => {
  const cost = Math.max(0, Number(input.cost) || 0);
  const tier = getMarkupTier(cost);
  const markup = tier.markup;
  const markupAmount = Math.round(cost * markup);
  const packaging = PACKAGING_COST_ARS;

  // Precio = costo + markup + embalaje, redondeado a múltiplo de 10.
  const price = roundCommercial(cost + markupAmount + packaging);

  // Comisión que se descuenta al liquidar (2,5% cashback + 0,5%).
  const platformFee = Math.round(price * (PLATFORM_FEE_PERCENT / 100));

  // Margen NETO (lo que le queda al vendedor después de comisión y embalaje).
  const netMargin = price - cost - packaging - platformFee;

  // ── Envío ──
  const weightKg = resolveWeightKg({
    weight: input.weight,
    subCategory: input.subCategory,
  });
  const shippingEstimate = estimateShippingCost(weightKg);

  // ── Regla de envío gratis (en orden de prioridad) ──
  //   1. Override manual (edición puntual desde el panel).
  //   2. PISO DURO: precio de venta < $50.000 → SIEMPRE se cotiza aparte.
  //   3. Peso > 25kg → cotización real, no hay estimación posible → se cobra.
  //   4. Regla de margen: gratis solo si el margen neto cubre 1,25 × envío.
  let freeShipping = false;
  let freeShippingReason = '';

  if (input.freeShippingOverride === true || input.freeShippingOverride === false) {
    freeShipping = input.freeShippingOverride;
    freeShippingReason = 'ajuste manual';
  } else if (price < FREE_SHIPPING_MIN_PRICE) {
    // PISO DURO: los tickets bajos no absorben el flete. Se cotiza y el
    // comprador decide si le cierra. No es venta a pérdida: no hay venta.
    freeShipping = false;
    freeShippingReason = `precio $${price.toLocaleString('es-AR')} < $${FREE_SHIPPING_MIN_PRICE.toLocaleString('es-AR')}: se cotiza aparte`;
  } else if (shippingEstimate === null) {
    freeShipping = false;
    freeShippingReason = `peso ${weightKg.toFixed(1)}kg > 25kg: cotización real, se cobra`;
  } else {
    const needed = shippingEstimate * SHIPPING_SAFETY_FACTOR;
    freeShipping = netMargin >= needed;
    freeShippingReason = freeShipping
      ? `margen neto $${netMargin.toLocaleString('es-AR')} ≥ $${Math.round(needed).toLocaleString('es-AR')}`
      : `margen neto $${netMargin.toLocaleString('es-AR')} < $${Math.round(needed).toLocaleString('es-AR')}`;
  }

  // Margen que efectivamente queda si el comprador usa envío gratis.
  const marginAfterFees = freeShipping
    ? netMargin - (shippingEstimate || 0)
    : netMargin;

  return {
    cost,
    markup,
    markupTier: tier.label,
    markupAmount,
    packaging,
    price,
    netMargin,
    weightKg,
    shippingEstimate,
    freeShipping,
    freeShippingReason,
    platformFee,
    marginAfterFees,
  };
};

export default {
  MARKUP_TIERS,
  PACKAGING_COST_ARS,
  PLATFORM_FEE_PERCENT,
  FREE_SHIPPING_MIN_PRICE,
  SHIPPING_ESTIMATE_TIERS,
  WEIGHT_BY_SUBCATEGORY,
  roundCommercial,
  getMarkupTier,
  resolveWeightKg,
  estimateShippingCost,
  calculateElitPricing,
};
