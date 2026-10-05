import { fetchElitProducts, uploadRemoteImagesToCloudinary } from '../services/elitService.js';
import { buildSyncPreview, applySyncChanges } from '../services/elitSyncService.js';

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


