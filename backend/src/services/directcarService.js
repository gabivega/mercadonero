import axios from 'axios';
import 'dotenv/config';
import { mapDirectcarCategories } from './directcarCategoryMap.js';

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de integración con DirectCar (proveedor de AUTOPARTES).
//
// DirectCar (https://directcar.com.ar) corre sobre WooCommerce y expone su
// Store API PÚBLICA (sin auth), igual que Flaming:
//   GET https://directcar.com.ar/wp-json/wc/store/v1/products
//   GET https://directcar.com.ar/wp-json/wc/store/v1/products/categories
//
// Particularidades (verificadas contra el sitio real):
//   - Paginación por `page` (base 1) + `per_page` (máx. 100), NO por offset.
//   - Total en el header HTTP `X-WP-Total` (~16.389 productos, ~164 páginas).
//   - ⚠️ PRECIOS: `currency_minor_unit = 2`, o sea los precios vienen en
//     CENTAVOS. Ej: "9760000" = $97.600,00. Normalizamos dividiendo por 100
//     para devolver el precio en PESOS.
//   - Los productos traen marca en `brands[]` y categoría(s) del proveedor.
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTCAR_BASE_URL =
  process.env.DIRECTCAR_BASE_URL ||
  'https://directcar.com.ar/wp-json/wc/store/v1';

const directcarClient = axios.create({
  baseURL: DIRECTCAR_BASE_URL,
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
 * Para DirectCar ARS minor_unit=2 → divide por 100.
 * @param {string|number} raw
 * @param {number} minorUnit
 * @returns {number}
 */
function fromMinorUnit(raw, minorUnit = 2) {
  const n = Number(raw) || 0;
  const divisor = 10 ** (Number(minorUnit) || 0);
  return divisor === 0 ? n : n / divisor;
}

/**
 * Normaliza un producto crudo de la Store API a un shape plano y estable.
 *
 * @param {Object} p  Ítem crudo de la Store API.
 * @returns {Object}
 */
export function normalizeDirectcarProduct(p) {
  const minorUnit = p?.prices?.currency_minor_unit ?? 2;

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

  // Categoría de MN ya mapeada (para que el front y el adapter la usen directo).
  const mn = mapDirectcarCategories(categories);

  return {
    id: p?.id ?? null,
    name: p?.name || '',
    slug: p?.slug || '',
    sku: p?.sku || '',
    type: p?.type || 'simple',
    permalink: p?.permalink || '',
    description: p?.description || '',
    shortDescription: p?.short_description || '',
    // Precio FINAL del proveedor (en PESOS, ya normalizado desde centavos).
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
    variations: Array.isArray(p?.variations) ? p.variations : [],
  };
}

/**
 * Trae el catálogo de DirectCar, paginado.
 *
 * @param {Object} [filters]
 * @param {number} [filters.page=1]      Página (base 1).
 * @param {number} [filters.perPage=24]  Ítems por página (máx. 100).
 * @param {string} [filters.search]      Búsqueda por texto.
 * @param {number} [filters.category]    Id de categoría de DirectCar.
 * @param {string} [filters.orderby]     date | price | popularity | rating | title | id.
 * @param {string} [filters.order]       asc | desc.
 * @param {number} [filters.minPrice]    Precio mínimo (unidad real, pesos).
 * @param {number} [filters.maxPrice]    Precio máximo (unidad real, pesos).
 * @returns {Promise<{items: Object[], total: number, totalPages: number, page: number}>}
 */
export async function fetchDirectcarProducts(filters = {}) {
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
  // La Store API espera el precio en unidad mínima (centavos). Convertimos los
  // pesos recibidos a centavos para el filtro.
  if (filters.minPrice !== undefined && filters.minPrice !== '') {
    params.min_price = Math.round(Number(filters.minPrice) * 100);
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== '') {
    params.max_price = Math.round(Number(filters.maxPrice) * 100);
  }

  const response = await directcarClient.get('/products', { params });
  const data = Array.isArray(response.data) ? response.data : [];

  return {
    items: data.map(normalizeDirectcarProduct),
    total: Number(response.headers['x-wp-total']) || data.length,
    totalPages: Number(response.headers['x-wp-totalpages']) || 1,
    page,
  };
}

/**
 * Trae TODO el catálogo de DirectCar paginando automáticamente.
 * Pensado para el import masivo o un full-sync.
 *
 * @param {Object} [filters] Filtros extra a propagar (search, category...).
 * @param {{ pageSize?: number, maxPages?: number, onPage?: Function }} [opts]
 * @returns {Promise<{items: Object[], total: number, pages: number}>}
 */
export async function fetchAllDirectcarProducts(filters = {}, opts = {}) {
  const pageSize = Math.min(Math.max(Number(opts.pageSize) || 100, 1), 100);
  const maxPages = Number(opts.maxPages) || 400; // tope defensivo (~40k)

  const items = [];
  let total = null;
  let pages = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const { items: batch, total: batchTotal, totalPages } =
      await fetchDirectcarProducts({ ...filters, page, perPage: pageSize });

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
 * Trae las categorías de DirectCar (para armar el mapeo a nuestras categorías).
 * @returns {Promise<Object[]>}
 */
export async function fetchDirectcarCategories() {
  const response = await directcarClient.get('/products/categories', {
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
 * Chequeo rápido de conectividad con DirectCar: pide 1 producto.
 * @returns {Promise<{ok: boolean, total: number}>}
 */
export async function directcarHealth() {
  const response = await directcarClient.get('/products', {
    params: { per_page: 1 },
  });
  return {
    ok: true,
    total: Number(response.headers['x-wp-total']) || 0,
  };
}
