import Product from '../models/Product.js';
import User from '../models/User.js';
import {
  fetchFlamingProducts,
  fetchAllFlamingProducts,
  fetchFlamingCategories,
  flamingHealth as flamingHealthCheck,
} from '../services/flamingService.js';
import {
  flamingToProduct,
  buildFlamingProviderRef,
} from '../services/flamingAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Controlador del proveedor Flaming (WooCommerce Store API pública).
//
// El front nunca pega directo a flaming.ar: siempre pasa por acá. Aunque la
// Store API es pública, proxear nos permite normalizar el shape y leer los
// headers de paginación.
//
// ── IMÁGENES: HOTLINK, SIN CLOUDINARY ────────────────────────────────────
// A propósito NO copiamos las imágenes a Cloudinary: el catálogo de Flaming
// tiene cientos de productos con varias imágenes cada uno, y subirlas agotaría
// los créditos del plan gratuito. Mientras el objetivo sea VISUALIZAR el
// catálogo (no vender), guardamos la URL original del proveedor
// (`wp-content/uploads/...`, pública) y el front la muestra por hotlink.
//
// ⚠️ Si algún día Flaming cambia/borra una imagen, la publicación quedará con
// la imagen rota. Cuando este catálogo pase a ser de venta real, conviene
// copiar las imágenes a Cloudinary (ver /import-images más abajo).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/flaming/productos
 * Catálogo paginado de Flaming. Filtros por query param.
 */
export const getFlamingProductos = async (req, res) => {
  try {
    const { page, perPage, search, category, orderby, order, minPrice, maxPrice } =
      req.query;

    const data = await fetchFlamingProducts({
      page,
      perPage,
      search,
      category,
      orderby,
      order,
      minPrice,
      maxPrice,
    });

    return res.json({
      success: true,
      items: data.items,
      total: data.total,
      totalPages: data.totalPages,
      page: data.page,
    });
  } catch (error) {
    console.error('[Flaming] Error al consultar productos:', error.message);
    return res.status(502).json({
      success: false,
      message: error?.message || 'No se pudo obtener el catálogo de Flaming.',
    });
  }
};

/**
 * GET /api/flaming/categories
 * Categorías de Flaming (para armar/validar el mapeo a nuestras categorías).
 */
export const getFlamingCategories = async (req, res) => {
  try {
    const categories = await fetchFlamingCategories();
    return res.json({ success: true, categories });
  } catch (error) {
    console.error('[Flaming] Error al consultar categorías:', error.message);
    return res.status(502).json({
      success: false,
      message: error?.message || 'No se pudieron obtener las categorías de Flaming.',
    });
  }
};

/**
 * GET /api/flaming/health
 * Chequeo rápido de conectividad.
 */
export const flamingHealth = async (req, res) => {
  try {
    const { total } = await flamingHealthCheck();
    return res.json({
      success: true,
      message: 'Conexión con Flaming OK',
      total,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error?.message || 'Sin conexión con Flaming.',
    });
  }
};

/**
 * POST /api/flaming/bulk-import
 *
 * Import MASIVO del catálogo de Flaming a la tienda del admin.
 *
 * Body:
 *   {
 *     pages?: number,          // cuántas páginas traer (default: todas)
 *     perPage?: number,        // ítems por página al pedir a Flaming (máx 100)
 *     search?: string,         // filtro opcional de búsqueda
 *     category?: number,       // filtro opcional de categoría de Flaming
 *     maxImages?: number,      // imgs por producto a guardar (default 3)
 *     skipExisting?: boolean,  // no reimportar ya vinculados (default true)
 *   }
 *
 * Flujo:
 *   1. Trae todos los productos de Flaming (paginando).
 *   2. Mapea cada uno a Product usando las URLs de imagen ORIGINALES (hotlink,
 *      SIN subir a Cloudinary).
 *   3. Guarda y devuelve un resumen: creados / omitidos / errores.
 */
export const bulkImportFlaming = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      pages,
      perPage = 100,
      search,
      category,
      maxImages = 3,
      skipExisting = true,
    } = req.body || {};

    const userProfile = await User.findById(userId).select(
      'username shop isVerified addresses'
    );
    if (!userProfile) {
      return res
        .status(404)
        .json({ success: false, message: 'Usuario no encontrado' });
    }

    const shopLocation = userProfile?.shop?.location || {};
    const defaultAddress =
      userProfile?.addresses?.find((a) => a.isDefault) ||
      userProfile?.addresses?.[0] ||
      {};
    const sellerLocation = {
      city: shopLocation.city || defaultAddress.city || '',
      province: shopLocation.province || defaultAddress.province || '',
    };

    // 1. Traemos el catálogo (paginando). Si viene `pages`, limitamos.
    const maxPages = Number(pages) || undefined;
    const { items } = await fetchAllFlamingProducts(
      { search, category },
      { pageSize: Math.min(Math.max(Number(perPage) || 100, 1), 100), maxPages }
    );

    // 2. Set de ids de Flaming ya importados (para no duplicar).
    let existingIds = new Set();
    if (skipExisting) {
      const existing = await Product.find({
        'providerRef.provider': 'flaming',
        status: { $ne: 'deleted' },
      }).select('providerRef.id');
      existingIds = new Set(existing.map((p) => p.providerRef?.id).filter(Boolean));
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (const flamingProduct of items) {
      try {
        // Omitir repetidos (por id de proveedor).
        if (skipExisting && existingIds.has(Number(flamingProduct.id))) {
          skipped.push({ id: flamingProduct.id, name: flamingProduct.name });
          continue;
        }

        // Imágenes: usamos las URLs ORIGINALES del proveedor (hotlink).
        // No subimos a Cloudinary para no agotar créditos.
        const images = (flamingProduct.images || [])
          .map((img) => img.src)
          .filter(Boolean)
          .slice(0, Math.max(1, Number(maxImages) || 3))
          .map((url, i) => ({ url, isMain: i === 0 }));

        // El modelo exige al menos una imagen.
        if (images.length === 0) {
          errors.push({
            id: flamingProduct.id,
            name: flamingProduct.name,
            reason: 'El producto no tiene imágenes.',
          });
          continue;
        }

        const mapped = flamingToProduct(flamingProduct, { images });

        const newProduct = new Product({
          ...mapped,
          seller: userId,
          sellerName: userProfile?.shop?.name || userProfile?.username,
          sellerIsVerified: userProfile?.isVerified || false,
          location: sellerLocation,
          status: 'active',
          providerRef: {
            ...buildFlamingProviderRef(flamingProduct),
            lastSyncAt: new Date(),
          },
        });

        const saved = await newProduct.save();

        await User.findByIdAndUpdate(userId, {
          $push: { products: saved._id },
        });

        created.push({ id: saved._id, name: saved.name, providerId: flamingProduct.id });
      } catch (err) {
        errors.push({
          id: flamingProduct.id,
          name: flamingProduct.name,
          reason: err.message,
        });
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
    console.error('[Flaming] Error en bulk-import:', error.message);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Error al importar el catálogo de Flaming.',
    });
  }
};
