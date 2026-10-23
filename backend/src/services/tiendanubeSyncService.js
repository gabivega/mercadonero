import Product from '../models/Product.js';
import { fetchAllTiendanubeProducts } from './tiendanubeService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sync de stock/precios para una StoreConnection.
//
// Flujo:
//   1) Traemos TODO el catálogo actual de la tienda (scrapeo del sitemap).
//   2) Buscamos los productos importados de ESA conexión en nuestra DB.
//   3) Para cada uno, matcheamos contra el catálogo fresco por:
//        a) providerRef.id (id de Tiendanube)  — el más confiable.
//        b) SKU  — fallback (por si cambió el id/producto recreado).
//   4) Generamos un PREVIEW de diferencias (precio, precio de lista, stock).
//   5) `apply` aplica los cambios seleccionados.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el diff entre lo publicado y lo que dice el proveedor.
 *
 * @param {Object} params
 * @param {Object} params.connection
 * @param {string} params.userId
 * @returns {Promise<{changes: Object[], summary: Object}>}
 */
export async function buildSyncPreview({ connection, userId }) {
  // 1. Catálogo fresco del proveedor.
  const { items } = await fetchAllTiendanubeProducts({
    baseUrl: connection.baseUrl,
    concurrency: 6,
  });

  const byProviderId = new Map();
  const bySku = new Map();
  for (const it of items) {
    if (it.id != null) byProviderId.set(Number(it.id), it);
    if (it.sku) bySku.set(String(it.sku).trim().toLowerCase(), it);
  }

  // 2. Productos importados de esta conexión.
  const products = await Product.find({
    seller: userId,
    'providerRef.provider': 'tiendanube',
    'providerRef.domain': connection.domain,
    status: { $ne: 'deleted' },
  }).select('_id name price sale stock providerRef status');

  const changes = [];
  let notFound = 0;

  for (const p of products) {
    const pid = Number(p.providerRef?.id);
    const sku = String(p.providerRef?.codigo_producto || '').trim().toLowerCase();

    const fresh = byProviderId.get(pid) || (sku ? bySku.get(sku) : null);

    if (!fresh) {
      notFound += 1;
      changes.push({
        productId: String(p._id),
        name: p.name,
        status: 'not_found',
        diffs: {},
      });
      continue;
    }

    // Precio de venta actual publicado vs proveedor.
    const currentSale =
      p.sale?.active && Number(p.sale.price) > 0 ? Number(p.sale.price) : Number(p.price) || 0;
    const currentBase = Number(p.price) || 0;
    const currentList = p.sale?.active ? currentBase : 0;

    const newSale = Number(fresh.price) || 0;
    const newList = fresh.onSale ? Number(fresh.listPrice) : 0;

    const newStock = fresh.isInStock ? Math.max(1, Number(fresh.stock) || 1) : 0;
    const currentStock = Number(p.stock) || 0;

    const priceChanged = currentSale !== newSale;
    const listChanged = currentList !== newList;
    const stockChanged = currentStock !== newStock;

    if (priceChanged || listChanged || stockChanged) {
      changes.push({
        productId: String(p._id),
        name: p.name,
        status: 'changed',
        diffs: {
          price: priceChanged ? { from: currentSale, to: newSale } : null,
          listPrice: listChanged ? { from: currentList, to: newList } : null,
          stock: stockChanged ? { from: currentStock, to: newStock } : null,
        },
        // Payload para aplicar (lo mínimo necesario).
        apply: { price: newSale, listPrice: newList, stock: newStock },
      });
    }
  }

  const summary = {
    scanned: products.length,
    changed: changes.filter((c) => c.status === 'changed').length,
    notFound,
    unchanged: products.length - changes.length,
  };

  return { changes, summary };
}

/**
 * Aplica cambios seleccionados del preview. Sólo toca los campos de negocio
 * (precio, oferta, stock). Si llega `selectedIds` (array de productId), aplica
 * sólo esos; si no, aplica todos los `changed`.
 *
 * @param {Object} params
 * @param {Object} params.connection
 * @param {string} params.userId
 * @param {Array}  params.changes    Salida de buildSyncPreview().changes
 * @param {string[]} [params.selectedIds]
 * @returns {Promise<{updated: number, skipped: number, errors: number}>}
 */
export async function applySyncChanges({ connection, userId, changes = [], selectedIds }) {
  const selected = Array.isArray(selectedIds) && selectedIds.length
    ? new Set(selectedIds.map(String))
    : null;

  const toApply = changes.filter(
    (c) => c.status === 'changed' && (!selected || selected.has(String(c.productId)))
  );

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of toApply) {
    try {
      const p = await Product.findOne({
        _id: c.productId,
        seller: userId,
        'providerRef.domain': connection.domain,
      });
      if (!p) {
        skipped += 1;
        continue;
      }

      const { price: newSale, listPrice: newList, stock: newStock } = c.apply;

      // Coherencia: si hay precio de lista > precio de venta → oferta.
      const hasSale = Number(newList) > Number(newSale) && Number(newSale) > 0;
      p.price = hasSale ? Number(newList) : Number(newSale) || 0;
      p.sale = hasSale
        ? { active: true, price: Number(newSale) }
        : { active: false, price: 0 };
      p.stock = Number(newStock) || 0;

      p.markModified('sale');
      if (p.providerRef) {
        p.providerRef.costPvpArs = Number(newSale) || 0;
        p.providerRef.listPriceArs = hasSale ? Number(newList) : 0;
        p.providerRef.lastSyncAt = new Date();
      }

      await p.save();
      updated += 1;
    } catch (err) {
      console.error('[Tiendanube][sync] error aplicando cambio:', err.message);
      errors += 1;
    }
  }

  return { updated, skipped, errors };
}
