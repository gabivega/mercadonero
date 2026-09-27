import axios from 'axios';
import 'dotenv/config';
import cloudinary from '../config/cloudinary.js';

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de integración con la API de Elit (proveedor de stock).
//
// IMPORTANTE: Las credenciales (user_id / token) NUNCA se exponen al cliente.
// Viven como variables de entorno en el backend:
//   ELIT_USER_ID=31894
//   ELIT_TOKEN=xxxxxxxxxxxx
//
// El frontend pega contra nuestro proxy (/api/elit/productos) y somos nosotros
// quienes agregamos las credenciales del lado del servidor.
// ─────────────────────────────────────────────────────────────────────────────

const ELIT_BASE_URL = process.env.ELIT_BASE_URL || 'https://clientes.elit.com.ar/v1/api';

const elitClient = axios.create({
  baseURL: ELIT_BASE_URL,
  timeout: 30000,
});

/**
 * Valida que las credenciales de Elit estén configuradas en el entorno.
 * @throws {Error} si falta user_id o token.
 */
function assertCredentials() {
  const userId = process.env.ELIT_USER_ID;
  const token = process.env.ELIT_TOKEN;
  if (!userId || !token) {
    const err = new Error(
      'Faltan las credenciales de Elit en el servidor (ELIT_USER_ID / ELIT_TOKEN).'
    );
    err.status = 500;
    err.code = 'ELIT_MISSING_CREDENTIALS';
    throw err;
  }
  return { userId: Number(userId), token };
}

/**
 * Traduce los errores de la API de Elit a un error legible para el cliente.
 */
function normalizeElitError(error) {
  const elitData = error?.response?.data;
  const status = error?.response?.status || 502;

  // La API de Elit devuelve { codigo, mensaje } en sus errores.
  const message =
    elitData?.mensaje ||
    elitData?.message ||
    error?.message ||
    'Error de comunicación con la API de Elit.';

  const normalized = new Error(message);
  normalized.status = status;
  normalized.elitBody = elitData;
  return normalized;
}

/**
 * Trae el listado paginado de productos del proveedor Elit.
 *
 * Endpoint Elit: POST /productos (los filtros van como query params, las
 * credenciales en el body JSON).
 *
 * @param {Object} filters
 * @param {number} [filters.limit=50]  Máximo 100.
 * @param {number} [filters.offset=1]  Índice inicial para paginación.
 * @param {string} [filters.store='all'] Depósito: all · cd · suc · cordoba · cba.
 * @param {number} [filters.id]        Código único de producto Elit.
 * @param {string} [filters.codigo_alfa]
 * @param {string} [filters.codigo_producto]
 * @param {string} [filters.nombre]
 * @param {string} [filters.marca]
 * @param {string} [filters.categoria]
 * @param {string} [filters.sub_categoria]
 * @param {string} [filters.actualizacion] AAAA-MM-DD HH:MM (sincronización incremental).
 * @returns {Promise<Object>} Respuesta cruda de Elit: { codigo, paginador, resultado }.
 */
export async function fetchElitProducts(filters = {}) {
  const { userId, token } = assertCredentials();

  // Sólo propagamos filtros definidos y no vacíos.
  const query = {};
  const passthrough = [
    'limit',
    'offset',
    'store',
    'id',
    'codigo_alfa',
    'codigo_producto',
    'nombre',
    'marca',
    'categoria',
    'sub_categoria',
    'actualizacion',
  ];

  for (const key of passthrough) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') {
      query[key] = value;
    }
  }

  // La doc indica límite máximo de 100 items por llamada.
  if (query.limit !== undefined) {
    query.limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  }

  // Elit exige un offset BASADO EN 1 (offset >= 1). Si llega 0, negativo o
  // no numérico, lo normalizamos a 1 para evitar el error
  // '"offset" must be greater than or equal to 1'.
  if (query.offset !== undefined) {
    const parsedOffset = Number(query.offset);
    query.offset = Number.isFinite(parsedOffset) && parsedOffset >= 1 ? Math.floor(parsedOffset) : 1;
  }

  try {
    const { data } = await elitClient.post('/productos', { user_id: userId, token }, { params: query });
    return data;
  } catch (error) {
    throw normalizeElitError(error);
  }
}

/**
 * Sube una imagen remota (URL de Elit) a NUESTRA cuenta de Cloudinary.
 *
 * Subimos server-side (en vez de hotlinkear la URL del proveedor) por:
 *   - Robustez: no dependemos de que Elit mantenga la imagen publicada.
 *   - Optimización: Cloudinary sirve webp/resize automático.
 *   - Control: aplicamos transformaciones estándar de la plataforma.
 *
 * @param {string} url  URL pública de la imagen original.
 * @param {string} [folder='elit']  Carpeta destino dentro de Cloudinary.
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function uploadRemoteImageToCloudinary(url, folder = 'elit') {
  if (!url || typeof url !== 'string') {
    const err = new Error('URL de imagen inválida.');
    err.status = 400;
    throw err;
  }

  try {
    const result = await cloudinary.uploader.upload(url, {
      folder,
      resource_type: 'image',
      // Normalizamos tamaño/formato: los proveedores suelen servir imágenes grandes.
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good', fetch_format: 'auto' },
      ],
    });

    return { url: result.secure_url, publicId: result.public_id };
  } catch (error) {
    const err = new Error(
      `No se pudo subir la imagen a Cloudinary: ${error?.message || 'error desconocido'}`
    );
    err.status = 502;
    throw err;
  }
}

/**
 * Sube en lote (secuencial) varias imágenes a Cloudinary.
 * Ignora las que fallen y devuelve las exitosas junto a los errores.
 *
 * @param {string[]} urls
 * @param {string} [folder='elit']
 * @returns {Promise<{images: {url:string,publicId:string}[], failed: {url:string,error:string}[]}>}
 */
export async function uploadRemoteImagesToCloudinary(urls = [], folder = 'elit') {
  const images = [];
  const failed = [];

  for (const url of urls) {
    try {
      const uploaded = await uploadRemoteImageToCloudinary(url, folder);
      images.push(uploaded);
    } catch (error) {
      failed.push({ url, error: error?.message || 'error desconocido' });
    }
  }

  return { images, failed };
}

