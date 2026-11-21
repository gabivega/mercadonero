import Product from '../models/Product.js';
import User from '../models/User.js';
import {
  fetchElitProducts,
  uploadRemoteImagesToCloudinary,
  DEFAULT_ELIT_MARKUP,
} from '../services/elitService.js';
import { buildSyncPreview, applySyncChanges } from '../services/elitSyncService.js';
import {
  elitToProduct,
  buildElitProviderRef,
  getElitImageUrls,
} from '../services/elitAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE IMPORTACIÓN (individual y masiva)
//
// Comparten la lógica de "resolver las imágenes" y "armar el documento". La
// única diferencia real entre ambos flujos es CUÁNTOS productos se procesan.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copia a Cloudinary las URLs de imagen de Elit. Devuelve pares
 * { original, uploaded } para poder reconstruir el orden original.
 * @param {string[]} urls
 * @param {string} folder
 * @returns {Promise<{uploaded: {url:string, original:string}[], failed: number}>}
 */
const copyElitImages = async (urls = [], folder = 'elit') => {
  if (!urls.length) return { uploaded: [], failed: 0 };
  const { images, failed } = await uploadRemoteImagesToCloudinary(urls, folder);
  // `uploadRemoteImagesToCloudinary` devuelve las imagenes exitosas SIN la URL
  // original, y las fallidas con su URL. Para reconstructir el orden original
  // quitamos de `urls` las que fallaron y emparejamos 1:1 con las exitosas.
  const failedUrls = new Set((failed || []).map((f) => f.url));
  const okUrls = urls.filter((u) => !failedUrls.has(u));
  const uploaded = images.map((img, i) => ({ url: img.url, original: okUrls[i] }));
  return { uploaded, failed: (failed || []).length };
};

/**
 * Resuelve las imágenes de UN producto de Elit según el modo elegido.
 *   - mode "cloudinary" → las sube a NUESTRA cuenta (robusto, pero consume
 *     créditos: NO usar con catálogos grandes).
 *   - mode "hotlink"    → guarda la URL original del proveedor (barato; puede
 *     romperse si Elit cambia/borra la imagen).
 *
 * @returns {Promise<{images: {url:string,isMain:boolean}[], failed: number}>}
 */
const resolveElitProductImages = async (elitProduct, mode, maxImages) => {
  const urls = getElitImageUrls(elitProduct, maxImages);
  if (mode === 'cloudinary') {
    const { uploaded, failed } = await copyElitImages(urls, 'elit');
    return {
      images: uploaded.map((u, i) => ({ url: u.url, isMain: i === 0 })),
      failed,
    };
  }
  return { images: urls.map((url, i) => ({ url, isMain: i === 0 })), failed: 0 };
};

/**
 * Carga los datos del vendedor necesarios para crear publicaciones.
 * @param {string} userId
 */
const loadSellerContext = async (userId) => {
  const user = await User.findById(userId).select(
    'username shop isVerified addresses'
  );
  if (!user) return null;

  const shopLocation = user?.shop?.location || {};
  const defaultAddress =
    user?.addresses?.find((a) => a.isDefault) || user?.addresses?.[0] || {};
  const location = {
    city: shopLocation.city || defaultAddress.city || '',
    province: shopLocation.province || defaultAddress.province || '',
  };

  return {
    user,
    sellerName: user?.shop?.name || user?.username || '',
    sellerIsVerified: Boolean(user?.isVerified),
    location,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Proxy de sólo lectura hacia la API de Elit.
//
// El frontend nunca ve las credenciales del proveedor: sólo llama a estos
// endpoints de nuestro backend.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/elit/productos
 *
 * Devuelve el catálogo del proveedor Elit, paginado.
 * Los filtros llegan como query params y se reenvían al proveedor.
 */
export const getElitProductos = async (req, res) => {
  try {
    const {
      limit,
      offset,
      store,
      id,
      codigo_alfa,
      codigo_producto,
      nombre,
      marca,
      categoria,
      sub_categoria,
      actualizacion,
    } = req.query;

    const data = await fetchElitProducts({
      limit,
      offset,
      store,
      id,
      codigo_alfa,
      codigo_producto,
      nombre,
      marca,
      categoria,
      sub_categoria,
      actualizacion,
    });

    return res.json({
      success: true,
      codigo: data?.codigo,
      paginador: data?.paginador || null,
      resultado: data?.resultado || [],
    });
  } catch (error) {
    console.error('[Elit] Error al consultar productos:', error?.elitBody || error.message);

    // Si el error viene de la API de Elit, propagamos su mensaje y su status.
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({
      success: false,
      message: error?.message || 'No se pudo obtener el catálogo de Elit.',
      elit: error?.elitBody || undefined,
    });
  }
};

/**
 * GET /api/elit/health
 *
 * Chequeo rápido de conectividad/credenciales: pide 1 producto a Elit.
 */
export const elitHealth = async (req, res) => {
  try {
    const data = await fetchElitProducts({ limit: 1 });
    return res.json({
      success: true,
      message: 'Conexión con Elit OK',
      total: data?.paginador?.total ?? null,
    });
  } catch (error) {
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({
      success: false,
      message: error?.message || 'Sin conexión con Elit.',
      elit: error?.elitBody || undefined,
    });
  }
};

/**
 * POST /api/elit/import-images
 *
 * Sube una o varias imágenes remotas (URLs del proveedor Elit) a NUESTRA
 * cuenta de Cloudinary y devuelve las URLs nuevas.
 *
 * Body: { urls: string[], folder?: string }
 *
 * ¿Por qué no hotlinkeamos? Porque si Elit cambia/borra la imagen, nuestra
 * publicación quedaría rota. Subiéndolas, controlamos el activo.
 */
export const importElitImages = async (req, res) => {
  try {
    const { urls, folder } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Enviá un array "urls" con al menos una imagen.',
      });
    }

    // Límite defensivo: no permitimos subir más de 10 por request.
    const limited = urls.slice(0, 10);

    const { images, failed } = await uploadRemoteImagesToCloudinary(
      limited,
      folder || 'elit'
    );

    return res.json({
      success: images.length > 0,
      images, // [{ url, publicId }]
      failed, // [{ url, error }]
      uploaded: images.length,
      failedCount: failed.length,
    });
  } catch (error) {
    console.error('[Elit] Error al importar imágenes:', error.message);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error?.message || 'No se pudieron importar las imágenes.',
    });
  }
};

/**
 * POST /api/elit/sync/preview
 *
 * Compara NUESTROS productos vinculados a Elit contra el catálogo del proveedor
 * y devuelve la TABLA DE DIFERENCIAS. NO escribe nada en la base.
 *
 * Body (opcional): { defaultMarkup?, includeUnchanged? }
 */
export const previewElitSync = async (req, res) => {
  try {
    const { defaultMarkup, includeUnchanged } = req.body || {};

    const preview = await buildSyncPreview({
      defaultMarkup,
      includeUnchanged,
    });

    return res.json({ success: true, ...preview });
  } catch (error) {
    console.error('[Elit] Error en preview de sync:', error?.elitBody || error.message);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({
      success: false,
      message: error?.message || 'No se pudo generar la vista previa de sincronización.',
      elit: error?.elitBody || undefined,
    });
  }
};

/**
 * POST /api/elit/sync/apply
 *
 * Aplica los cambios SELECCIONADOS por el usuario.
 *
 * Body: { changes: [{ productId, applyStock?, elitStock?, applyPrice?, newPrice?,
 *                      markup?, elitCost?, markRemoved? }] }
 */
export const applyElitSync = async (req, res) => {
  try {
    const { changes } = req.body || {};

    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Enviá un array "changes" con al menos un cambio a aplicar.',
      });
    }

    // Límite defensivo por request.
    const limited = changes.slice(0, 200);

    const result = await applySyncChanges(limited);

    return res.json({
      success: result.errors.length === 0,
      updated: result.updated.length,
      skipped: result.skipped.length,
      errors: result.errors.length,
      detail: result,
    });
  } catch (error) {
    console.error('[Elit] Error al aplicar sync:', error.message);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({
      success: false,
            message: error?.message || 'No se pudieron aplicar los cambios de sincronización.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTACIÓN A LA TIENDA (individual y masiva)
//
// A diferencia del flujo "individual" del front (ElitImportModal), que abre el
// formulario para revisar y luego POSTea a /api/product/create, estas dos rutas
// crean las publicaciones SERVER-SIDE. Motivo: con 100+ productos y copiando
// imágenes remotas a Cloudinary, una sola request supera el timeout de Node.
// Por eso el modo por defecto es HOTLINK y cada request se acota a una tanda
// (ver `bulkImportElit`).
//
// Ambos flujos:
//   - Respetan `requireElitAccess` + `requireSellerOnboarding` (montados en la
//     ruta): quien no pueda usar el catálogo o no tenga tienda aprobada, no pasa.
//   - Nacen en `moderation.status = "pending"`: el admin los aprueba en el panel
//     de moderación, igual que cualquier publicación.
//   - No duplican: si ya existe un producto con el mismo `providerRef.id`
//     (de cualquier vendedor), se OMITE y se informa en `skipped`.
// ─────────────────────────────────────────────────────────────────────────────

// Modos de imagen válidos.
const IMAGE_MODES = ['hotlink', 'cloudinary'];

/**
 * Crea UN producto de Elit para el vendedor autenticado.
 * @param {Object} params
 * @param {Object} params.elitProduct  Ítem crudo de Elit.
 * @param {string} params.userId
 * @param {Object} params.seller       Resultado de loadSellerContext.
 * @param {'hotlink'|'cloudinary'} params.imageMode
 * @param {number} params.markup
 * @param {number} params.maxImages
 * @returns {Promise<{saved:Object}>}
 */
const createElitProductForUser = async ({
  elitProduct,
  userId,
  seller,
  imageMode,
  markup,
  maxImages,
}) => {
  const { images } = await resolveElitProductImages(elitProduct, imageMode, maxImages);

  if (images.length === 0) {
    throw new Error('El producto no tiene imágenes.');
  }

  const mapped = elitToProduct(elitProduct, { images, markup });
  const hasStock = Number(elitProduct.stock_total) > 0;

  const doc = new Product({
    ...mapped,
    seller: userId,
    sellerName: seller.sellerName,
    sellerIsVerified: seller.sellerIsVerified,
    location: seller.location,
    // Coherencia de estado: si Elit informa stock 0, la publicación nace sin
    // stock (así el catálogo no la ofrece para comprar).
    status: hasStock ? 'active' : 'out_of_stock',
    stock: hasStock ? Math.max(1, Number(elitProduct.stock_total) || 1) : 0,
    // Nace PENDIENTE de moderación: el admin decide si se publica.
    moderation: { status: 'pending' },
    providerRef: {
      ...buildElitProviderRef(elitProduct),
      lastSyncAt: new Date(),
    },
  });

  const saved = await doc.save();
  return { saved };
};

/**
 * POST /api/elit/import
 *
 * Importa UN producto de Elit (por su id). Flujo "1 click" del catálogo, sin
 * pasar por el formulario.
 *
 * Body: { id:number, imageMode?:'hotlink'|'cloudinary', markup?:number,
 *         maxImages?:number }
 */
export const importElitProduct = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      id,
      imageMode = 'hotlink',
      markup = DEFAULT_ELIT_MARKUP,
      maxImages = 5,
    } = req.body || {};

    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Enviá un "id" numérico válido del producto de Elit.',
      });
    }

    const mode = IMAGE_MODES.includes(imageMode) ? imageMode : 'hotlink';

    const seller = await loadSellerContext(userId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    // No duplicar: si ya hay un producto vinculado a este id de Elit, se omite.
    const existing = await Product.findOne({
      'providerRef.provider': 'elit',
      'providerRef.id': numericId,
      status: { $ne: 'deleted' },
    }).select('_id name');

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Este producto de Elit ya está importado en la plataforma.',
        existing,
      });
    }

    // Traemos el producto (con todas sus imágenes) desde Elit por su id.
    const data = await fetchElitProducts({ id: numericId, limit: 1, store: 'all' });
    const elitProduct = Array.isArray(data?.resultado) ? data.resultado[0] : null;
    if (!elitProduct) {
      return res.status(404).json({
        success: false,
        message: 'El producto no existe en el catálogo de Elit.',
      });
    }

    const { saved } = await createElitProductForUser({
      elitProduct,
      userId,
      seller,
      imageMode: mode,
      markup: Number(markup),
      maxImages: Number(maxImages),
    });

    // Vinculamos al array del vendedor (para que aparezca en su dashboard).
    await User.findByIdAndUpdate(userId, { $push: { products: saved._id } });

    return res.status(201).json({
      success: true,
      message: '¡Producto importado! Queda pendiente de moderación.',
      product: saved,
    });
  } catch (error) {
    console.error('[Elit] Error en import individual:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'No se pudo importar el producto de Elit.',
    });
  }
};

/**
 * POST /api/elit/bulk-import
 *
 * Importa el catálogo de Elit a la tienda del vendedor autenticado, EN TANDAS.
 *
 * Body:
 *   {
 *     limit?: number,          // cuántos productos importar (1..200)  default 50
 *     offset?: number,         // desde qué offset de Elit (para tandas) default 1
 *     search?: string,         // filtro de búsqueda (nombre)
 *     onlyInStock?: boolean,   // sólo productos con stock_total > 0  default true
 *     imageMode?: 'hotlink'|'cloudinary',  // default 'hotlink'
 *     markup?: number,         // markup sobre pvp_ars (default DEFAULT_ELIT_MARKUP)
 *     maxImages?: number,      // imgs por producto (default 3)
 *     skipExisting?: boolean,  // no reimportar ya vinculados    default true
 *   }
 *
 * ⚠️ Se acota a 200 por request: traer TODO el catálogo en una pasada multiplica
 * el tiempo (Cloudinary, en especial) y las requests tienen timeout. El front
 * recorre en TANDAS hasta agotar el catálogo (usa `next` del response).
 *
 * Devuelve un RESUMEN y el `next` para pedir la tanda siguiente.
 */
export const bulkImportElit = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      limit = 50,
      offset = 1,
      search,
      onlyInStock = true,
      imageMode = 'hotlink',
      markup = DEFAULT_ELIT_MARKUP,
      maxImages = 3,
      skipExisting = true,
    } = req.body || {};

    const numericLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const numericOffset =
      Number.isFinite(Number(offset)) && Number(offset) >= 1 ? Number(offset) : 1;
    const mode = IMAGE_MODES.includes(imageMode) ? imageMode : 'hotlink';

    const seller = await loadSellerContext(userId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    // 1. Traemos la tanda desde Elit.
    const data = await fetchElitProducts({
      limit: numericLimit,
      offset: numericOffset,
      store: 'all',
      ...(search?.trim() ? { nombre: search.trim() } : {}),
    });
    const items = Array.isArray(data?.resultado) ? data.resultado : [];
    const total = Number(data?.paginador?.total) || items.length;

    // 2. Filtro local por stock (Elit no expone "in stock" en la query).
    const candidates =
      onlyInStock === false ? items : items.filter((p) => Number(p.stock_total) > 0);

    // 3. Ids que ya existen en la plataforma (para no duplicar).
    let existingIds = new Set();
    if (skipExisting) {
      const ids = candidates.map((p) => Number(p.id)).filter((n) => Number.isFinite(n));
      if (ids.length) {
        const existing = await Product.find({
          'providerRef.provider': 'elit',
          'providerRef.id': { $in: ids },
          status: { $ne: 'deleted' },
        }).select('providerRef.id');
        existingIds = new Set(existing.map((p) => Number(p.providerRef?.id)));
      }
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (const elitProduct of candidates) {
      const pid = Number(elitProduct.id);

      if (skipExisting && existingIds.has(pid)) {
        skipped.push({ id: elitProduct.id, name: elitProduct.nombre, reason: 'ya importado' });
        continue;
      }

      try {
        const { saved } = await createElitProductForUser({
          elitProduct,
          userId,
          seller,
          imageMode: mode,
          markup: Number(markup),
          maxImages: Number(maxImages),
        });
        created.push(saved._id);
        existingIds.add(pid);
      } catch (err) {
        errors.push({
          id: elitProduct.id,
          name: elitProduct.nombre,
          reason: err?.message || 'error desconocido',
        });
      }
    }

    // Vinculamos los creados al array del vendedor (en una sola operación).
    if (created.length > 0) {
      await User.findByIdAndUpdate(userId, { $push: { products: { $each: created } } });
    }

    // `next` = próximo offset a pedir (null si ya se recorrió todo Elit).
    const nextOffset = numericOffset + numericLimit;
    const next = nextOffset <= total ? nextOffset : null;

    return res.json({
      success: true,
      message: `Tanda finalizada: ${created.length} creados, ${skipped.length} omitidos, ${errors.length} errores.`,
      total, // total de productos en Elit para la búsqueda actual
      offsetReturned: numericOffset,
      limitReturned: numericLimit,
      next, // offset para la siguiente tanda (o null si terminó)
      remaining: Math.max(0, total - (nextOffset - 1)),
      summary: {
        fetched: items.length,
        candidates: candidates.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      // Muestras acotadas para no inflar el payload.
      created: created.slice(0, 50),
      skipped: skipped.slice(0, 50),
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    console.error('[Elit] Error en bulk-import:', error?.elitBody || error.message);
    const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error?.message || 'Error al importar el catálogo de Elit.',
      elit: error?.elitBody || undefined,
    });
  }
};


