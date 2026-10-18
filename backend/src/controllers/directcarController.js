import Product from '../models/Product.js';
import User from '../models/User.js';
import {
  fetchDirectcarProducts,
  fetchAllDirectcarProducts,
  fetchDirectcarCategories,
  directcarHealth as directcarHealthCheck,
} from '../services/directcarService.js';
import {
  directcarToProduct,
  buildDirectcarProviderRef,
} from '../services/directcarAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Controlador del proveedor DirectCar (WooCommerce Store API pública).
//
// El front nunca pega directo a directcar.com.ar: siempre pasa por acá. Aunque
// la Store API es pública, proxear nos permite normalizar el shape (incluido
// el precio, que en DirectCar viene en centavos) y leer los headers de
// paginación.
//
// ── IMÁGENES: HOTLINK, SIN CLOUDINARY ────────────────────────────────────
// A propósito NO copiamos las imágenes a Cloudinary: el catálogo de DirectCar
// tiene ~16.000 productos con varias imágenes cada uno, y subirlas agotaría
// los créditos del plan gratuito. Mientras el objetivo sea VISUALIZAR el
// catálogo (no vender), guardamos la URL original del proveedor
// (`wp-content/uploads/...`, pública) y el front la muestra por hotlink.
//
// ⚠️ Si algún día el proveedor cambia/borra una imagen, la publicación quedará
// con la imagen rota. Cuando este catálogo pase a ser de venta real, conviene
// copiar las imágenes a Cloudinary.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/directcar/productos
 * Catálogo paginado de DirectCar. Filtros por query param.
 */
export const getDirectcarProductos = async (req, res) => {
  try {
    const { page, perPage, search, category, orderby, order, minPrice, maxPrice } =
      req.query;

    const data = await fetchDirectcarProducts({
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
    console.error('[DirectCar] Error al consultar productos:', error.message);
    return res.status(502).json({
      success: false,
      message: error?.message || 'No se pudo obtener el catálogo de DirectCar.',
    });
  }
};

/**
 * GET /api/directcar/categories
 * Categorías de DirectCar (para armar/validar el mapeo a nuestras categorías).
 */
export const getDirectcarCategories = async (req, res) => {
  try {
    const categories = await fetchDirectcarCategories();
    return res.json({ success: true, categories });
  } catch (error) {
    console.error('[DirectCar] Error al consultar categorías:', error.message);
    return res.status(502).json({
      success: false,
      message: error?.message || 'No se pudieron obtener las categorías de DirectCar.',
    });
  }
};

/**
 * GET /api/directcar/health
 * Chequeo rápido de conectividad.
 */
export const directcarHealth = async (req, res) => {
  try {
    const { total } = await directcarHealthCheck();
    return res.json({
      success: true,
      message: 'Conexión con DirectCar OK',
      total,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error?.message || 'Sin conexión con DirectCar.',
    });
  }
};

/**
 * POST /api/directcar/bulk-import
 *
 * Import MASIVO del catálogo de DirectCar a la tienda del admin.
 *
 * Body:
 *   {
 *     pages?: number,          // cuántas páginas traer (default: todas)
 *     perPage?: number,        // ítems por página al pedir a DirectCar (máx 100)
 *     search?: string,         // filtro opcional de búsqueda
 *     category?: number,       // filtro opcional de categoría de DirectCar
 *     maxImages?: number,      // imgs por producto a guardar (default 3)
 *     skipExisting?: boolean,  // no reimportar ya vinculados (default true)
 *   }
 *
 * ⚠️ Con ~16.000 productos el import completo puede tardar varios minutos.
 * Se recomienda importar por tandas (`pages`) o filtrando por `search`.
 *
 * Flujo:
 *   1. Trae los productos de DirectCar (paginando).
 *   2. Mapea cada uno a Product usando las URLs de imagen ORIGINALES (hotlink,
 *      SIN subir a Cloudinary).
 *   3. Guarda y devuelve un resumen: creados / omitidos / errores.
 */
export const bulkImportDirectcar = async (req, res) => {
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
    const { items } = await fetchAllDirectcarProducts(
      { search, category },
      { pageSize: Math.min(Math.max(Number(perPage) || 100, 1), 100), maxPages }
    );

    // 2. Set de ids de DirectCar ya importados (para no duplicar).
    let existingIds = new Set();
    if (skipExisting) {
      const existing = await Product.find({
        'providerRef.provider': 'directcar',
        status: { $ne: 'deleted' },
      }).select('providerRef.id');
      existingIds = new Set(existing.map((p) => p.providerRef?.id).filter(Boolean));
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (const directcarProduct of items) {
      try {
        // Omitir repetidos (por id de proveedor).
        if (skipExisting && existingIds.has(Number(directcarProduct.id))) {
          skipped.push({ id: directcarProduct.id, name: directcarProduct.name });
          continue;
        }

        // Imágenes: usamos las URLs ORIGINALES del proveedor (hotlink).
        // No subimos a Cloudinary para no agotar créditos.
        const images = (directcarProduct.images || [])
          .map((img) => img.src)
          .filter(Boolean)
          .slice(0, Math.max(1, Number(maxImages) || 3))
          .map((url, i) => ({ url, isMain: i === 0 }));

        // El modelo exige al menos una imagen.
        if (images.length === 0) {
          errors.push({
            id: directcarProduct.id,
            name: directcarProduct.name,
            reason: 'El producto no tiene imágenes.',
          });
          continue;
        }

        const mapped = directcarToProduct(directcarProduct, { images });

        const newProduct = new Product({
          ...mapped,
          seller: userId,
          sellerName: userProfile?.shop?.name || userProfile?.username,
          sellerIsVerified: userProfile?.isVerified || false,
          location: sellerLocation,
          status: 'active',
          providerRef: {
            ...buildDirectcarProviderRef(directcarProduct),
            lastSyncAt: new Date(),
          },
        });

        const saved = await newProduct.save();

        await User.findByIdAndUpdate(userId, {
          $push: { products: saved._id },
        });

        created.push({ id: saved._id, name: saved.name, providerId: directcarProduct.id });
      } catch (err) {
        errors.push({
          id: directcarProduct.id,
          name: directcarProduct.name,
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
    console.error('[DirectCar] Error en bulk-import:', error.message);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Error al importar el catálogo de DirectCar.',
    });
  }
};
