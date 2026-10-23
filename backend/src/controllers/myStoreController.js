import Product from '../models/Product.js';
import User from '../models/User.js';
import StoreConnection from '../models/StoreConnection.js';
import {
  fetchTiendanubeProductUrls,
  fetchTiendanubeProduct,
  fetchAllTiendanubeProducts,
  fetchTiendanubeCategories,
  fetchTiendanubeCategoryProductUrls,
} from '../services/tiendanubeService.js';
import { upsertProductFromTiendanube } from '../services/tiendanubeImportService.js';
import { mapTiendanubeCategory } from '../services/tiendanubeCategoryMap.js';
import { buildSyncPreview, applySyncChanges } from '../services/tiendanubeSyncService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Controller de USUARIO para su StoreConnection (importador de Tiendanube).
//
// CLAVE DE SEGURIDAD: nunca confiamos en el dominio que manda el front. Siempre
// resolvemos la conexión del usuario autenticado y usamos SU `baseUrl`. Así un
// usuario NO puede apuntar a la tienda de otro ni a un dominio ajeno.
//
// Sólo se permite operar si la conexión está `verified`.
// ─────────────────────────────────────────────────────────────────────────────

// Resuelve la conexión verificada del usuario o lanza un error con status.
async function requireVerifiedConnection(userId) {
  const conn = await StoreConnection.findOne({ owner: userId });
  if (!conn) {
    const e = new Error('No tenés una tienda conectada.');
    e.status = 404;
    throw e;
  }
  if (conn.status !== 'verified') {
    const e = new Error(
      conn.status === 'pending'
        ? 'Tu tienda todavía no está verificada por un administrador.'
        : 'Tu conexión está suspendida. Contactá al soporte.'
    );
    e.status = 403;
    throw e;
  }
  return conn;
}

// Chequeo de límites (freemium). Hoy sin límites => siempre pasa.
// Dejamos la función lista para cuando se definan los planes.
function assertLimit(conn, { importedCount }) {
  const { limits = {} } = conn.toObject ? conn.toObject() : conn;
  if (limits.maxProducts != null && importedCount >= limits.maxProducts) {
    const e = new Error(
      `Alcanzaste el límite de ${limits.maxProducts} productos de tu plan.`
    );
    e.status = 403;
    throw e;
  }
}

/**
 * GET /api/my-store/status
 * Devuelve el estado de la conexión del usuario (para el panel).
 */
export const getMyStoreStatus = async (req, res) => {
  try {
    const conn = await StoreConnection.findOne({ owner: req.user._id });
    if (!conn) {
      return res.json({ success: true, connected: false, connection: null });
    }
    // Nunca exponemos el hash del OTP.
    const safe = conn.toObject();
    if (safe.verification) delete safe.verification.otpHash;
    return res.json({ success: true, connected: true, connection: safe });
  } catch (error) {
    console.error('[my-store][status]', error.message);
    return res.status(500).json({ success: false, message: 'Error al obtener el estado.' });
  }
};

/**
 * GET /api/my-store/categories
 * Lista las categorías RAIZ de la tienda (derivadas del sitemap, SIN scrapear
 * productos). Rápido incluso con miles de productos, y usa la taxonomía REAL
 * de la tienda (no fuerza un rubro).
 *
 * Devuelve: [{ name, slug, url, count }]
 */
export const getMyStoreCategories = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);

    const { categories, total } = await fetchTiendanubeCategories({ baseUrl: conn.baseUrl });

    // Normalizamos el shape (sin conteo por categoría: el sitemap no lo ofrece).
    const clean = (categories || []).map((c) => ({
      name: c.name,
      slug: c.slug,
      url: c.url,
    }));

    return res.json({ success: true, total, categories: clean });
  } catch (error) {
    console.error('[my-store][categories]', error.message);
    return res.status(error.status || 502).json({
      success: false,
      message: error.message || 'No se pudieron obtener las categorías.',
    });
  }
};

/**
 * GET /api/my-store/products
 * Grilla paginada del catálogo del proveedor (con scraping on-demand).
 *
 * Query: page, perPage, search
 */
export const getMyStoreProducts = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(Math.max(Number(req.query.perPage) || 24, 1), 60);
    const search = String(req.query.search || '').trim().toLowerCase();

    let { productUrls, total } = await fetchTiendanubeProductUrls({ baseUrl: conn.baseUrl });

    if (search) {
      productUrls = productUrls.filter((u) => u.toLowerCase().includes(search));
      total = productUrls.length;
    }

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    const pageUrls = productUrls.slice(start, start + perPage);

    const { items } = await fetchAllTiendanubeProducts({ urls: pageUrls, concurrency: 6 });

    return res.json({ success: true, items, total, totalPages, page });
  } catch (error) {
    console.error('[my-store][products]', error.message);
    return res.status(error.status || 502).json({
      success: false,
      message: error.message || 'No se pudo obtener el catálogo.',
    });
  }
};

/**
 * GET /api/my-store/product?url=<url>
 * Detalle de un producto (valida que la URL pertenezca al dominio conectado).
 */
export const getMyStoreProduct = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);
    const url = String(req.query.url || '').trim();

    // SEGURIDAD: la URL debe ser del dominio conectado.
    if (!url || !url.toLowerCase().includes(conn.domain)) {
      return res.status(400).json({
        success: false,
        message: 'La URL no pertenece a tu tienda conectada.',
      });
    }

    const product = await fetchTiendanubeProduct(url);
    if (!product) {
      return res.status(404).json({ success: false, message: 'No se pudo parsear el producto.' });
    }
    return res.json({ success: true, product });
  } catch (error) {
    console.error('[my-store][product]', error.message);
    return res.status(error.status || 502).json({
      success: false,
      message: error.message || 'No se pudo obtener el producto.',
    });
  }
};

/**
 * POST /api/my-store/import
 * Import individual.
 * Body: { url?: string, product?: Object }
 */
export const importMyStoreProduct = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);
    const { url, product: productFromBody } = req.body || {};

    const userProfile = await User.findById(req.user._id).select(
      'username shop isVerified addresses'
    );
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    let item = productFromBody;
    if (!item) {
      if (!url || !url.toLowerCase().includes(conn.domain)) {
        return res.status(400).json({
          success: false,
          message: 'Falta la URL o no pertenece a tu tienda conectada.',
        });
      }
      item = await fetchTiendanubeProduct(url);
    }
    if (!item) {
      return res.status(404).json({ success: false, message: 'No se pudo parsear el producto.' });
    }

    const saved = await upsertProductFromTiendanube({
      item,
      connection: conn,
      userProfile,
    });

    // Contador de uso.
    await StoreConnection.updateOne(
      { _id: conn._id },
      { $inc: { 'usage.totalImported': 1 }, $set: { 'usage.lastImportAt': new Date() } }
    );

    return res.status(201).json({ success: true, product: saved });
  } catch (error) {
    console.error('[my-store][import]', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al importar el producto.',
    });
  }
};

/**
 * POST /api/my-store/bulk-import
 * Import masivo (todo o por categorías / búsqueda).
 *
 * Body:
 *   { categories?: string[], search?: string, limit?: number, skipExisting?: boolean }
 */
export const bulkImportMyStore = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);
    const {
      categories = [],
      search,
      limit,
      skipExisting = true,
    } = req.body || {};

    const userProfile = await User.findById(req.user._id).select(
      'username shop isVerified addresses'
    );
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    // 1. Determinar las URLs de producto a procesar.
    //    - Si hay categorías seleccionadas → scrapeamos la PÁGINA DE CADA
    //      CATEGORÍA (con paginación). Mucho más barato que todo el catálogo.
    //    - Si no → traemos TODO el catálogo desde el sitemap.
    const catSlugs = (categories || [])
      .map((c) => String(c).trim().replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);

    let urls = [];
    if (catSlugs.length) {
      const perCat = await Promise.all(
        catSlugs.map((slug) =>
          fetchTiendanubeCategoryProductUrls({ baseUrl: conn.baseUrl, slug })
        )
      );
      const set = new Set();
      for (const arr of perCat) for (const u of arr) set.add(u);
      urls = [...set];
    } else {
      const { productUrls } = await fetchTiendanubeProductUrls({ baseUrl: conn.baseUrl });
      urls = productUrls;
    }

    // Filtro por búsqueda textual (sobre la URL/slug).
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      urls = urls.filter((u) => u.toLowerCase().includes(q));
    }

    const { items, errors: scrapeErrors } = await fetchAllTiendanubeProducts({
      urls,
      concurrency: 6,
    });

    const filtered = items;

    // 3. Límite (freemium).
    let toProcess = filtered;
    if (limit) toProcess = toProcess.slice(0, Number(limit));

    // 4. Skip existentes (por providerRef.id de ESTA conexión).
    let existingIds = new Set();
    if (skipExisting) {
      const existing = await Product.find({
        seller: req.user._id,
        'providerRef.provider': 'tiendanube',
        'providerRef.domain': conn.domain,
        status: { $ne: 'deleted' },
      }).select('providerRef.id');
      existingIds = new Set(existing.map((p) => Number(p.providerRef?.id)).filter(Boolean));
    }

    const created = [];
    const skipped = [];
    const errors = [...scrapeErrors];

    for (const item of toProcess) {
      try {
        if (skipExisting && existingIds.has(Number(item.id))) {
          skipped.push({ id: item.id, name: item.name });
          continue;
        }
        assertLimit(conn, { importedCount: created.length + existingIds.size });

        const saved = await upsertProductFromTiendanube({
          item,
          connection: conn,
          userProfile,
        });
        created.push({ id: saved._id, name: saved.name, providerId: item.id });
      } catch (err) {
        errors.push({ id: item.id, name: item.name, reason: err.message });
      }
    }

    // Contadores de uso.
    await StoreConnection.updateOne(
      { _id: conn._id },
      {
        $inc: {
          'usage.totalImported': created.length,
          'usage.bulkRunsToday': 1,
        },
        $set: { 'usage.lastImportAt': new Date() },
      }
    );

    return res.json({
      success: true,
      message: `Importación finalizada: ${created.length} creados, ${skipped.length} omitidos, ${errors.length} errores.`,
      summary: {
        total: toProcess.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created: created.slice(0, 100),
      skipped: skipped.slice(0, 100),
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    console.error('[my-store][bulk-import]', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al importar el catálogo.',
    });
  }
};

/**
 * GET /api/my-store/sync/preview
 * Devuelve el diff (stock/precio) sin aplicar.
 */
export const getMyStoreSyncPreview = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);
    const { changes, summary } = await buildSyncPreview({
      connection: conn,
      userId: req.user._id,
    });
    return res.json({ success: true, changes, summary });
  } catch (error) {
    console.error('[my-store][sync-preview]', error.message);
    return res.status(error.status || 502).json({
      success: false,
      message: error.message || 'No se pudo calcular la sincronización.',
    });
  }
};

/**
 * POST /api/my-store/sync/apply
 * Aplica los cambios seleccionados.
 * Body: { changes: [...], selectedIds?: string[] }
 */
export const applyMyStoreSync = async (req, res) => {
  try {
    const conn = await requireVerifiedConnection(req.user._id);
    const { changes = [], selectedIds } = req.body || {};

    const result = await applySyncChanges({
      connection: conn,
      userId: req.user._id,
      changes,
      selectedIds,
    });

    await StoreConnection.updateOne(
      { _id: conn._id },
      {
        $set: {
          'sync.lastSyncAt': new Date(),
          'sync.lastSyncSummary': {
            updated: result.updated,
            unchanged: result.skipped,
            notFound: 0,
            errors: result.errors,
          },
        },
      }
    );

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[my-store][sync-apply]', error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'No se pudo aplicar la sincronización.',
    });
  }
};

/**
 * POST /api/my-store/claim-category
 * Helper de import: mapea una categoría de proveedor a MN (para el preview del front).
 * (No persiste nada; sólo expone el mapeo.)
 */
export const mapCategoryInfo = async (req, res) => {
  try {
    const names = req.body?.categories || [];
    const mapped = names.map((n) => ({ name: n, ...mapTiendanubeCategory(n) }));
    return res.json({ success: true, mapped });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al mapear categorías.' });
  }
};
