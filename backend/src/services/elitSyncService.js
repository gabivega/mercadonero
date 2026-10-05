import Product from '../models/Product.js';
import {
  fetchElitProductsByIds,
  fetchAllElitProducts,
  priceWithMarkup,
  DEFAULT_ELIT_MARKUP,
} from './elitService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de SINCRONIZACIÓN con Elit.
//
// Estrategia HÍBRIDA (fase beta):
//   1. buildSyncPreview(): consulta Elit y compara con NUESTRA base, devolviendo
//      una tabla de DIFERENCIAS. NO escribe nada.
//   2. applySyncChanges(): aplica ÚNICAMENTE los cambios que el usuario marcó.
//
// Más adelante, el cron podrá llamar a preview + apply automáticamente, sin
// reescribir nada: la detección y la aplicación ya están separadas.
// ─────────────────────────────────────────────────────────────────────────────

// Estado de la diferencia entre lo local y Elit.
export const DIFF_STATUS = {
  OUT_OF_STOCK: 'out_of_stock',   // Elit = 0, local > 0  (rojo)
  STOCK_DOWN: 'stock_down',       // Elit < local        (amarillo)
  STOCK_UP: 'stock_up',           // Elit > local        (verde)
  COST_UP: 'cost_up',             // subió el costo      (azul)
  COST_DOWN: 'cost_down',         // bajó el costo       (violeta)
  REMOVED: 'removed',             // ya no está en Elit  (gris)
};

/**
 * Redondea un precio a múltiplos de 10 hacia arriba (igual que el form).
 */
const roundCommercial = (price) => {
  const n = Number(price) || 0;
  if (n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
};

/**
 * Deduce el markup "actual" implícito en el precio de venta del producto y su
 * costo registrado. Ej: costo 10000, venta 15000 => 0.5 (50%).
 * @returns {number|null} markup en tanto por uno, o null si no se puede inferir.
 */
const inferMarkup = (salePrice, cost) => {
  const p = Number(salePrice) || 0;
  const c = Number(cost) || 0;
  if (c <= 0 || p <= 0) return null;
  return (p - c) / c;
};

/**
 * Extrae el stock y el costo relevantes de un ítem crudo de Elit.
 * Elit entrega `stock_total` (unidades) y `pvp_ars` (precio de lista ARS).
 */
const readElitNumbers = (elitProduct = {}) => ({
  stock: Math.max(0, Number(elitProduct.stock_total) || 0),
  cost: Number(elitProduct.pvp_ars) || 0,
  costUsd: Number(elitProduct.pvp_usd) || 0,
});

/**
 * Trae el set de productos locales vinculados a un proveedor.
 * @param {'elit'} provider
 * @returns {Promise<Object[]>}
 */
const getLocalProviderProducts = async (provider = 'elit') => {
  return Product.find({ 'providerRef.provider': provider })
    .select(
      'name stock reservedStock price status providerRef images'
    )
    .lean();
};

/**
 * Construye la TABLA DE DIFERENCIAS entre nuestros productos y Elit.
 *
 * NO escribe en la base: sólo consulta y compara. Ideal para revisar antes de
 * aplicar.
 *
 * @param {Object} [opts]
 * @param {number} [opts.defaultMarkup=DEFAULT_ELIT_MARKUP] Markup para el sugerido.
 * @param {boolean} [opts.includeUnchanged=false]  Incluir filas sin cambios.
 * @returns {Promise<Object>} { rows, summary, fetchedAt }
 */
export async function buildSyncPreview(opts = {}) {
  const defaultMarkup = Number(opts.defaultMarkup ?? DEFAULT_ELIT_MARKUP);
  const includeUnchanged = Boolean(opts.includeUnchanged);

  const localProducts = await getLocalProviderProducts('elit');

  // Recolectamos los ids de Elit que tenemos publicados.
  const elitIds = localProducts
    .map((p) => Number(p?.providerRef?.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  // Consultamos a Elit sólo esos ids (una llamada por id, en lotes).
  const elitMap = elitIds.length ? await fetchElitProductsByIds(elitIds) : new Map();

  const rows = [];

  for (const local of localProducts) {
    const elitId = Number(local?.providerRef?.id);
    const elitProduct = Number.isFinite(elitId) ? elitMap.get(elitId) : null;

    const localStock = Math.max(0, Number(local.stock) || 0);
    const reserved = Math.max(0, Number(local.reservedStock) || 0);
    const localPrice = Number(local.price) || 0;
    const costRecorded = Number(local?.providerRef?.costPvpArs) || 0;

    // ── Producto dado de baja del proveedor ──
    if (!elitProduct) {
      if (!includeUnchanged) {
        rows.push({
          productId: String(local._id),
          name: local.name,
          image: local?.images?.[0]?.url || '',
          providerRefId: Number.isFinite(elitId) ? elitId : null,
          status: DIFF_STATUS.REMOVED,
          // Sin datos de Elit: reflejamos lo local para que la UI no rompa.
          localStock,
          localPrice,
          reservedStock: reserved,
          costPvpArs: costRecorded,
          elitStock: null,
          elitCost: null,
        });
      }
      continue;
    }

    const { stock: elitStock, cost: elitCost } = readElitNumbers(elitProduct);

    // Markup actual implícito en el precio local.
    const markupAtual = inferMarkup(localPrice, costRecorded || elitCost);
    // Precio sugerido si se aplicara el markup por defecto sobre el costo nuevo.
    const suggestedPrice = priceWithMarkup(elitCost, defaultMarkup);

    // ── Determinamos el/los cambios ──
    // Flags INDEPENDIENTES: un producto puede tener a la vez cambio de stock
    // y de costo. El `status` es sólo la categoría "principal" para el color
    // de la fila; los flags permiten a la UI mostrar todo.
    const stockChanged = elitStock !== localStock;
    const costChanged = Math.abs(elitCost - costRecorded) > 0.01;
    const costDirection = costChanged
      ? (elitCost > costRecorded ? 'up' : 'down')
      : null;

    // Estado principal (prioridad visual): sin stock > bajó stock > bajó costo >
    // subió stock > subió costo.
    let status = null;
    if (elitStock === 0 && localStock > 0) {
      status = DIFF_STATUS.OUT_OF_STOCK;
    } else if (stockChanged && elitStock < localStock) {
      status = DIFF_STATUS.STOCK_DOWN;
    } else if (costChanged && costDirection === 'down') {
      status = DIFF_STATUS.COST_DOWN;
    } else if (stockChanged && elitStock > localStock) {
      status = DIFF_STATUS.STOCK_UP;
    } else if (costChanged && costDirection === 'up') {
      status = DIFF_STATUS.COST_UP;
    }

    if (!status && !includeUnchanged) continue;

    rows.push({
      productId: String(local._id),
      name: local.name,
      image: local?.images?.[0]?.url || elitProduct.imagen || '',
      providerRefId: elitId,
      status: status || 'unchanged',
      // Flags independientes (pueden ser ambos true)
      stockChanged,
      costChanged,
      costDirection,      // 'up' | 'down' | null
      // Datos locales
      localStock,
      localPrice,
      reservedStock: reserved,
      costPvpArs: costRecorded,   // costo anterior (registrado)
      // Datos de Elit
      elitStock,
      elitCost,
      elitCostUsd: Number(elitProduct.pvp_usd) || 0,
      // Derivados para la UI
      markupAtual,        // tanto por uno o null
      suggestedPrice,     // costo nuevo * markup default
      stockDelta: elitStock - localStock,
      costDelta: elitCost - costRecorded,
      costDeltaPct: costRecorded > 0 ? (elitCost - costRecorded) / costRecorded : null,
    });
  }

  // Resumen por tipo.
  const summary = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  // Orden: lo más crítico primero (sin stock > bajó stock > bajó costo > subió stock > subió costo).
  const order = [
    DIFF_STATUS.OUT_OF_STOCK,
    DIFF_STATUS.STOCK_DOWN,
    DIFF_STATUS.COST_DOWN,
    DIFF_STATUS.STOCK_UP,
    DIFF_STATUS.COST_UP,
    DIFF_STATUS.REMOVED,
  ];
  rows.sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) ||
      String(a.name).localeCompare(String(b.name))
  );

  return {
    rows,
    summary,
    fetchedAt: new Date().toISOString(),
    localCount: localProducts.length,
    elitMatched: elitMap.size,
  };
}

/**
 * Aplica una lista de cambios seleccionados por el usuario.
 *
 * Cada cambio puede especificar de forma independiente:
 *   - applyStock:   boolean  -> pisa `stock` con el valor de Elit (respeta reservas).
 *   - applyPrice:   boolean  -> pisa `price` con `newPrice` (o calculado con markup).
 *   - newPrice:     number   -> precio final de venta ya calculado por el front.
 *   - markup:       number   -> markup usado (para trazabilidad).
 *
 * Nunca baja `stock` por debajo de `reservedStock`.
 *
 * @param {Array<Object>} changes
 * @returns {Promise<Object>} { updated, skipped, errors }
 */
export async function applySyncChanges(changes = []) {
  const results = { updated: [], skipped: [], errors: [] };

  for (const change of changes) {
    const productId = change?.productId;
    if (!productId) {
      results.skipped.push({ productId: null, reason: 'sin productId' });
      continue;
    }

    try {
      const product = await Product.findById(productId);
      if (!product) {
        results.skipped.push({ productId, reason: 'producto no encontrado' });
        continue;
      }

      const update = {};
      const applied = {};

      // ── STOCK ──
      if (change.applyStock && change.elitStock !== undefined && change.elitStock !== null) {
        const elitStock = Math.max(0, Number(change.elitStock) || 0);
        const reserved = Math.max(0, Number(product.reservedStock) || 0);
        // Nunca por debajo de lo reservado por pools abiertos.
        const safeStock = Math.max(elitStock, reserved);
        update.stock = safeStock;
        applied.stock = safeStock;

        // Estado coherente con el stock.
        if (safeStock <= 0) {
          update.status = 'out_of_stock';
          applied.status = 'out_of_stock';
        } else if (product.status === 'out_of_stock') {
          // Reingresa stock: si estaba sin stock, lo reactivamos.
          update.status = 'active';
          applied.status = 'active';
        }
      }

      // ── PRECIO ──
      if (change.applyPrice) {
        const cost = Number(change.elitCost) || 0;
        const markup = Number(change.markup);
        let newPrice;

        if (Number(change.newPrice) > 0) {
          // El front ya calculó el precio final (editable).
          newPrice = roundCommercial(Number(change.newPrice));
        } else if (Number.isFinite(markup) && cost > 0) {
          newPrice = priceWithMarkup(cost, markup);
        } else {
          newPrice = Number(product.price) || 0;
        }

        if (newPrice > 0) {
          update.price = newPrice;
          applied.price = newPrice;
        }

        // Guardamos el costo nuevo del proveedor para trazabilidad y futuros cálculos.
        if (cost > 0) {
          update['providerRef.costPvpArs'] = cost;
          applied.costPvpArs = cost;
        }
      }

      // ── BAJA DEL PROVEEDOR ──
      if (change.markRemoved) {
        update.status = 'paused';
        applied.status = 'paused';
      }

      // Siempre dejamos registro del último sync sobre este producto.
      update['providerRef.lastSyncAt'] = new Date();

      await Product.updateOne({ _id: productId }, { $set: update });
      results.updated.push({ productId, applied });
    } catch (error) {
      results.errors.push({ productId, error: error?.message || 'error desconocido' });
    }
  }

  return results;
}

/**
 * Sincronización FULL automática (para el cron / full sync).
 *
 * Trae TODO el catálogo de Elit y actualiza stock/precio de los productos
 * vinculados. Pensada para correr desatendida; por eso usa el markup por
 * defecto SÓLO para precio si `updatePrices` está activo.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.dryRun=true]  Si true, NO escribe (sólo reporta).
 * @param {boolean} [opts.updatePrices=false] Si true, recalcula precios.
 * @param {number} [opts.defaultMarkup=DEFAULT_ELIT_MARKUP]
 * @returns {Promise<Object>}
 */
export async function syncElitFull(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const updatePrices = Boolean(opts.updatePrices);
  const defaultMarkup = Number(opts.defaultMarkup ?? DEFAULT_ELIT_MARKUP);

  const { items: elitItems } = await fetchAllElitProducts({ store: 'all' });
  const elitById = new Map();
  for (const item of elitItems) {
    const id = Number(item?.id);
    if (Number.isFinite(id)) elitById.set(id, item);
  }

  const localProducts = await getLocalProviderProducts('elit');

  const changes = [];
  for (const local of localProducts) {
    const elitId = Number(local?.providerRef?.id);
    const elitProduct = Number.isFinite(elitId) ? elitById.get(elitId) : null;

    if (!elitProduct) {
      changes.push({ productId: String(local._id), markRemoved: true, applyStock: false });
      continue;
    }

    const { stock: elitStock, cost: elitCost } = readElitNumbers(elitProduct);
    const entry = { productId: String(local._id), elitStock, applyStock: true };

    if (updatePrices && elitCost > 0) {
      entry.applyPrice = true;
      entry.elitCost = elitCost;
      entry.markup = defaultMarkup;
      entry.newPrice = priceWithMarkup(elitCost, defaultMarkup);
    }
    changes.push(entry);
  }

  if (dryRun) {
    return { dryRun: true, wouldChange: changes.length, changes };
  }

  const result = await applySyncChanges(changes);
  return { dryRun: false, totalChanges: changes.length, ...result };
}
