import axios from 'axios';
import 'dotenv/config';
import { mapFlamingCategories } from './flamingCategoryMap.js';

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de integración con Flaming (proveedor de bebidas / productos).
//
// Flaming corre sobre WooCommerce y expone su Store API PÚBLICA (sin auth):
//   GET https://flaming.ar/wp-json/wc/store/v1/products
//   GET https://flaming.ar/wp-json/wc/store/v1/products/categories
//
// A diferencia de Elit, NO hace falta token ni user_id. Igual proxeamos desde
// nuestro backend para: (a) normalizar el shape, (b) leer los headers de
// paginación (X-WP-Total), (c) subir imágenes a Cloudinary server-side.
//
// Particularidades de la Store API:
//   - Paginación por `page` (base 1) + `per_page` (máx. 100), NO por offset.
//   - El total de productos viene en el header HTTP `X-WP-Total`.
//   - `prices.price` viene en la unidad mínima de la moneda. Para ARS
//     `currency_minor_unit = 0`, así que el número ya es el peso tal cual.
// ─────────────────────────────────────────────────────────────────────────────

const FLAMING_BASE_URL =
  process.env.FLAMING_BASE_URL || 'https://flaming.ar/wp-json/wc/store/v1';

const flamingClient = axios.create({
  baseURL: FLAMING_BASE_URL,
  timeout: 30000,
  headers: {
    // Algunos WAF bloquean el User-Agent por defecto de axios.
    'User-Agent':
      'Mozilla/5.0 (compatible; MercadoNeroBot/1.0; +https://mercadonero.com)',
    Accept: 'application/json',
  },
});

/**
 * Convierte un precio de la Store API (unidad mínima) a la unidad real.
 * Para ARS minor_unit=0 → x1. Para otras monedas con decimales (2) → /100.
 * @param {string|number} raw
 * @param {number} minorUnit
 * @returns {number}
 */
function fromMinorUnit(raw, minorUnit = 0) {
  const n = Number(raw) || 0;
  const divisor = 10 ** (Number(minorUnit) || 0);
  return divisor === 0 ? n : n / divisor;
}

/**
 * Normaliza un producto crudo de la Store API a un shape plano y estable,
 * parecido al que usa el frontend para Elit (para reusar patrones).
 *
 * @param {Object} p  Ítem crudo de la Store API.
 * @returns {Object}
 */
export function normalizeFlamingProduct(p) {
  const minorUnit = p?.prices?.currency_minor_unit ?? 0;

  const price = fromMinorUnit(p?.prices?.price, minorUnit);
  const regularPrice = fromMinorUnit(p?.prices?.regular_price, minorUnit);
  const salePrice = fromMinorUnit(p?.prices?.sale_price, minorUnit);

  const images = Array.isArray(p?.images)
    ? p.images.map((img) => ({
        id: img?.id ?? null,
        src: img?.src || '',
        thumbnail: img?.thumbnail || img?.src || '',
        alt: img?.alt || '',
      }))
    : [];

  const categories = Array.isArray(p?.categories)
    ? p.categories.map((c) => ({
        id: c?.id ?? null,
        name: c?.name || '',
        slug: c?.slug || '',
        link: c?.link || '',
      }))
    : [];

  const isInStock = Boolean(p?.is_in_stock);

  // Categoría de MN ya mapeada (para que el front y el adapter la usen directo,
  // sin replicar el mapa). Ver flamingCategoryMap.js.
  const mn = mapFlamingCategories(categories);

  return {
    id: p?.id ?? null,
    name: p?.name || '',
    slug: p?.slug || '',
    sku: p?.sku || '',
    type: p?.type || 'simple',
    permalink: p?.permalink || '',
    description: p?.description || '',
    shortDescription: p?.short_description || '',
    // Precio FINAL del proveedor (el que se muestra). En pesos si minor_unit=0.
    price,
    regularPrice,
    salePrice,
    onSale: Boolean(p?.on_sale),
    currency: p?.prices?.currency_code || 'ARS',
    minorUnit,
    images,
    categories,
    // Categoría de MN mapeada (slug de categoría y subcategoría de la plataforma).
    mnCategory: mn.category,
    mnSubCategory: mn.subCategory,
    tags: Array.isArray(p?.tags) ? p.tags.map((t) => t?.name || '') : [],
    brands: Array.isArray(p?.brands) ? p.brands.map((b) => b?.name || '') : [],
    isInStock,
    isPurchasable: Boolean(p?.is_purchasable),
    stockAvailability: p?.stock_availability?.text || '',
    averageRating: Number(p?.average_rating) || 0,
    reviewCount: Number(p?.review_count) || 0,
    // Por ahora los productos de Flaming son simples; dejamos el campo por si
    // más adelante aparecen variantes.
    variations: Array.isArray(p?.variations) ? p.variations : [],
  };
}

/**
 * Trae el catálogo de Flaming, paginado.
 *
 * @param {Object} [filters]
 * @param {number} [filters.page=1]      Página (base 1).
 * @param {number} [filters.perPage=24]  Ítems por página (máx. 100).
 * @param {string} [filters.search]      Búsqueda por texto.
 * @param {number} [filters.category]    Id de categoría de Flaming.
 * @param {string} [filters.orderby]     date | price | popularity | rating | title.
 * @param {string} [filters.order]       asc | desc.
 * @param {number} [filters.minPrice]    Precio mínimo (unidad real).
 * @param {number} [filters.maxPrice]    Precio máximo (unidad real).
 * @returns {Promise<{items: Object[], total: number, totalPages: number, page: number}>}
 */
export async function fetchFlamingProducts(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const perPage = Math.min(Math.max(Number(filters.perPage) || 24, 1), 100);

  const params = {
    page,
    per_page: perPage,
  };

  if (filters.search && String(filters.search).trim()) {
    params.search = String(filters.search).trim();
  }
  if (filters.category) {
    params.category = filters.category;
  }
  if (filters.orderby) params.orderby = filters.orderby;
  if (filters.order) params.order = filters.order;
  // La Store API espera el precio en unidad mínima; con minor_unit=0 es x1.
  // Lo dejamos pasar tal cual en pesos (ARS).
  if (filters.minPrice !== undefined && filters.minPrice !== '') {
    params.min_price = filters.minPrice;
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== '') {
    params.max_price = filters.maxPrice;
  }

  const response = await flamingClient.get('/products', { params });
  const data = Array.isArray(response.data) ? response.data : [];

  return {
    items: data.map(normalizeFlamingProduct),
    total: Number(response.headers['x-wp-total']) || data.length,
    totalPages: Number(response.headers['x-wp-totalpages']) || 1,
    page,
  };
}

/**
 * Trae TODO el catálogo de Flaming paginando automáticamente.
 * Pensado para el import masivo o un full-sync.
 *
 * @param {Object} [filters] Filtros extra a propagar (search, category...).
 * @param {{ pageSize?: number, maxPages?: number, onPage?: Function }} [opts]
 * @returns {Promise<{items: Object[], total: number, pages: number}>}
 */
export async function fetchAllFlamingProducts(filters = {}, opts = {}) {
  const pageSize = Math.min(Math.max(Number(opts.pageSize) || 100, 1), 100);
  const maxPages = Number(opts.maxPages) || 200; // tope defensivo

  const items = [];
  let total = null;
  let pages = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const { items: batch, total: batchTotal, totalPages } =
      await fetchFlamingProducts({ ...filters, page, perPage: pageSize });

    items.push(...batch);
    pages = page;

    if (total === null) total = batchTotal;

    opts.onPage?.(page, batch.length, total);

    // Corte: tanda vacía, o ya cubrimos todas las páginas, o juntamos el total.
    if (batch.length === 0) break;
    if (totalPages > 0 && page >= totalPages) break;
    if (total > 0 && items.length >= total) break;
  }

  return { items, total: total ?? items.length, pages };
}

/**
 * Trae las categorías de Flaming (para armar el mapeo a nuestras categorías).
 * @returns {Promise<Object[]>}
 */
export async function fetchFlamingCategories() {
  const response = await flamingClient.get('/products/categories', {
    params: { per_page: 100 },
  });
  const data = Array.isArray(response.data) ? response.data : [];
  return data.map((c) => ({
    id: c?.id ?? null,
    name: c?.name || '',
    slug: c?.slug || '',
    parent: c?.parent ?? 0,
    count: Number(c?.count) || 0,
    description: c?.description || '',
    permalink: c?.permalink || '',
  }));
}

/**
 * Chequeo rápido de conectividad con Flaming: pide 1 producto.
 * @returns {Promise<{ok: boolean, total: number}>}
 */
export async function flamingHealth() {
  const response = await flamingClient.get('/products', {
    params: { per_page: 1 },
  });
  return {
    ok: true,
    total: Number(response.headers['x-wp-total']) || 0,
  };
}
