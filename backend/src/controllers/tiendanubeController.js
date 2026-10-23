import Product from '../models/Product.js';
import User from '../models/User.js';
import {
  fetchTiendanubeProductUrls,
  fetchTiendanubeProduct,
  fetchAllTiendanubeProducts,
  tiendanubeHealth as tiendanubeHealthCheck,
} from '../services/tiendanubeService.js';
import { tiendanubeToProduct, buildTiendanubeProviderRef } from '../services/tiendanubeAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Controlador del proveedor Tiendanube (Santiago Deportes).
//
// El front nunca pega directo a la tienda: siempre pasa por acá. Aunque el
// scraping es "público", proxear nos permite normalizar el shape, cachear y
// controlar la concurrencia.
//
// ── IMÁGENES: HOTLINK, SIN CLOUDINARY ───────────────────────────────────
// Por ahora guardamos la URL original del proveedor (`acdn-us.mitiendanube.com`,
// pública) y el front la muestra por hotlink. 1 sola imagen por producto.
// ─────────────────────────────────────────────────────────────────────────────

// Cache simple en memoria de la lista de URLs del sitemap (5 min).
let sitemapCache = { urls: [], total: 0, fetchedAt: 0 };
const SITEMAP_TTL_MS = 5 * 60 * 1000;

async function getSitemapUrls(force = false) {
  const now = Date.now();
  if (!force && sitemapCache.urls.length && now - sitemapCache.fetchedAt < SITEMAP_TTL_MS) {
    return sitemapCache;
  }
  const { productUrls, total } = await fetchTiendanubeProductUrls();
  sitemapCache = { urls: productUrls, total, fetchedAt: now };
  return sitemapCache;
}

/**
 * GET /api/tiendanube/productos
 *
 * Devuelve una "vista" del catálogo para el explorador del front. Como scrapear
 * TODAS las fichas para paginar sería carísimo, paginamos sobre las URLs del
 * sitemap y traemos sólo la página pedida (scraping on-demand).
 *
 * Query:
 *   page      (default 1)
 *   perPage   (default 24, máx 60)
 *   search    filtra por texto en la URL (slug) — rápido, sin scrapear todo
 */
export const getTiendanubeProductos = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(Math.max(Number(req.query.perPage) || 24, 1), 60);
    const search = String(req.query.search || '').trim().toLowerCase();

    let { urls, total } = await getSitemapUrls();

    if (search) {
      urls = urls.filter((u) => u.toLowerCase().includes(search));
      total = urls.length;
    }

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    const pageUrls = urls.slice(start, start + perPage);

    // Scrapeamos sólo la página pedida (con concurrencia controlada).
    const { items } = await fetchAllTiendanubeProducts({ urls: pageUrls, concurrency: 6 });

    return res.json({
      success: true,
      items,
      total,
      totalPages,
      page,
    });
  } catch (error) {
    console.error('[Tiendanube] Error al consultar productos:', error.message);
    return res.status(502).json({
      success: false,
      message: error?.message || 'No se pudo obtener el catálogo de Tiendanube.',
    });
  }
};

/**
 * GET /api/tiendanube/producto?url=<url>
 * Detalle de un producto puntual (para el modal de importación individual).
 */
export const getTiendanubeProducto = async (req, res) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, message: 'URL de producto inválida.' });
    }
    const product = await fetchTiendanubeProduct(url);
    if (!product) {
      return res.status(404).json({ success: false, message: 'No se pudo parsear el producto.' });
    }
    return res.json({ success: true, product });
  } catch (error) {
    console.error('[Tiendanube] Error al consultar producto:', error.message);
    return res.status(502).json({
      success: false,
      message: error?.message || 'No se pudo obtener el producto de Tiendanube.',
    });
  }
};

/**
 * GET /api/tiendanube/health
 */
export const tiendanubeHealth = async (req, res) => {
  try {
    const { total } = await tiendanubeHealthCheck();
    return res.json({ success: true, message: 'Conexión con Tiendanube OK', total });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error?.message || 'Sin conexión con Tiendanube.',
    });
  }
};

/**
 * POST /api/tiendanube/import
 *
 * Import INDIVIDUAL: recibe el `url` (o el `product` ya scrapeado) y crea el
 * producto en la tienda del admin. Toma 1 sola imagen.
 *
 * Body: { url?: string, product?: Object }
 */
export const importTiendanubeProduct = async (req, res) => {
  try {
    const userId = req.user._id;
    const { url, product: productFromBody } = req.body || {};

    const userProfile = await User.findById(userId).select('username shop isVerified addresses');
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    let product = productFromBody;
    if (!product) {
      if (!url) {
        return res.status(400).json({ success: false, message: 'Falta la URL del producto.' });
      }
      product = await fetchTiendanubeProduct(url);
    }
    if (!product) {
      return res.status(404).json({ success: false, message: 'No se pudo parsear el producto.' });
    }

    // 1 sola imagen por ahora (hotlink).
    const imageUrl = product.images?.[0]?.src;
    if (!imageUrl) {
      return res.status(422).json({ success: false, message: 'El producto no tiene imágenes.' });
    }
    const images = [{ url: imageUrl, isMain: true }];

    const shopLocation = userProfile?.shop?.location || {};
    const defaultAddress =
      userProfile?.addresses?.find((a) => a.isDefault) || userProfile?.addresses?.[0] || {};
    const sellerLocation = {
      city: shopLocation.city || defaultAddress.city || '',
      province: shopLocation.province || defaultAddress.province || '',
    };

    const mapped = tiendanubeToProduct(product, { images });

    const newProduct = new Product({
      ...mapped,
      seller: userId,
      sellerName: userProfile?.shop?.name || userProfile?.username,
      sellerIsVerified: userProfile?.isVerified || false,
      location: sellerLocation,
      status: 'active',
      providerRef: { ...buildTiendanubeProviderRef(product), lastSyncAt: new Date() },
    });

    const saved = await newProduct.save();
    await User.findByIdAndUpdate(userId, { $push: { products: saved._id } });

    return res.status(201).json({ success: true, product: saved });
  } catch (error) {
    console.error('[Tiendanube] Error en import individual:', error.message);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Error al importar el producto.',
    });
  }
};

/**
 * POST /api/tiendanube/bulk-import
 *
 * Import MASIVO del catálogo de Tiendanube a la tienda del admin.
 *
 * Body:
 *   { limit?: number, skipExisting?: boolean, search?: string }
 *
 * ⚠️ Scrapea cada ficha (1 GET por producto). Con ~273 productos y concurrencia
 * 4-6, tarda ~1-3 min. Se sube el timeout del lado del cliente.
 */
export const bulkImportTiendanube = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit, skipExisting = true, search } = req.body || {};

    const userProfile = await User.findById(userId).select('username shop isVerified addresses');
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const shopLocation = userProfile?.shop?.location || {};
    const defaultAddress =
      userProfile?.addresses?.find((a) => a.isDefault) || userProfile?.addresses?.[0] || {};
    const sellerLocation = {
      city: shopLocation.city || defaultAddress.city || '',
      province: shopLocation.province || defaultAddress.province || '',
    };

    // URLs del sitemap (filtrables por search).
    let { urls } = await getSitemapUrls();
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      urls = urls.filter((u) => u.toLowerCase().includes(q));
    }

    // 1. Scrapeamos el catálogo (con concurrencia controlada).
    const { items, errors: scrapeErrors } = await fetchAllTiendanubeProducts({
      urls,
      concurrency: 6,
      limit: Number(limit) || undefined,
    });

    // 2. Set de ids de Tiendanube ya importados (para no duplicar).
    let existingIds = new Set();
    if (skipExisting) {
      const existing = await Product.find({
        'providerRef.provider': 'tiendanube',
        status: { $ne: 'deleted' },
      }).select('providerRef.id');
      existingIds = new Set(existing.map((p) => p.providerRef?.id).filter(Boolean));
    }

    const created = [];
    const skipped = [];
    const errors = [...scrapeErrors];

    for (const tnProduct of items) {
      try {
        if (skipExisting && existingIds.has(Number(tnProduct.id))) {
          skipped.push({ id: tnProduct.id, name: tnProduct.name });
          continue;
        }

        // 1 sola imagen (hotlink).
        const imageUrl = tnProduct.images?.[0]?.src;
        if (!imageUrl) {
          errors.push({ id: tnProduct.id, name: tnProduct.name, reason: 'Sin imágenes.' });
          continue;
        }
        const images = [{ url: imageUrl, isMain: true }];

        const mapped = tiendanubeToProduct(tnProduct, { images });

        const newProduct = new Product({
          ...mapped,
          seller: userId,
          sellerName: userProfile?.shop?.name || userProfile?.username,
          sellerIsVerified: userProfile?.isVerified || false,
          location: sellerLocation,
          status: 'active',
          providerRef: { ...buildTiendanubeProviderRef(tnProduct), lastSyncAt: new Date() },
        });

        const saved = await newProduct.save();
        await User.findByIdAndUpdate(userId, { $push: { products: saved._id } });

        created.push({ id: saved._id, name: saved.name, providerId: tnProduct.id });
      } catch (err) {
        errors.push({ id: tnProduct.id, name: tnProduct.name, reason: err.message });
      }
    }

    return res.json({
      success: true,
      message: `Importación finalizada: ${created.length} creados, ${skipped.length} omitidos, ${errors.length} errores.`,
      summary: {
        total: items.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created: created.slice(0, 100),
      skipped: skipped.slice(0, 100),
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    console.error('[Tiendanube] Error en bulk-import:', error.message);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Error al importar el catálogo de Tiendanube.',
    });
  }
};
