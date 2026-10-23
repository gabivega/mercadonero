import { mapTiendanubeCategory } from './tiendanubeCategoryMap.js';

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Tiendanube (producto scrapeado normalizado) → modelo Product de MN.
//
// Igual criterio que Directcar/Flaming: NO aplicamos markup. El precio publicado
// es el PRECIO FINAL de la tienda (tal como aparece en el sitio).
//
// Las imágenes NO se incluyen acá (las maneja el controller: por ahora HOTLINK,
// 1 sola imagen por producto). Este adapter sólo arma los campos "de datos".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marca del producto.
 *
 * PRIORIDAD (fix acotado):
 *   1) Si el proveedor expone `brand` en el JSON-LD → se RESPETA a rajatabla.
 *   2) Si NO, se intenta inferir del título (heurística, primera palabra).
 *   3) Si la heurística es dudosa o genérica → 'Genérico'.
 *
 * @param {Object} product  Producto normalizado.
 * @returns {string}
 */
function resolveBrand(product = {}) {
  const providerBrand = String(product.brand || '').trim();
  if (providerBrand) return providerBrand;
  return inferBrand(product.name);
}
function inferBrand(name = '') {
  const clean = String(name).trim();
  if (!clean) return 'Genérico';

  const GENERIC_STARTERS = new Set([
    'paleta', 'paletas', 'raqueta', 'raquetas', 'tubo', 'pelota', 'pelotas',
    'zapatilla', 'zapatillas', 'camiseta', 'short', 'bolso', 'mochila',
    'bolsa', 'antivibrador', 'cubre', 'kit', 'set', 'combo', 'par', 'gorra',
    'remera', 'buzo', 'campera', 'med', 'munequera', 'muñequera', 'calcetines',
  ]);

  const firstWord = clean.split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, '');
  if (firstWord.length < 3) return 'Genérico';

  const lower = firstWord.toLowerCase();
  if (GENERIC_STARTERS.has(lower)) return 'Genérico';

  // Marcas suelen venir en minúsculas o Todo Mayúsculas (bullpadel, WILSON...).
  return firstWord;
}

/**
 * Arma `specifications` (clave-valor) a partir de los datos del proveedor.
 * @param {Object} product
 * @returns {{key:string, value:string}[]}
 */
function buildSpecifications(product = {}) {
  const specs = [];
  const push = (key, value) => {
    const str = value === undefined || value === null ? '' : String(value).trim();
    if (str) specs.push({ key, value: str });
  };

  push('SKU', product.sku);
  push('Código proveedor', product.id);
  if (product.categoryBreadcrumb?.length) {
    push('Categoría', product.categoryBreadcrumb.join(' > '));
  }
  if (product.currency) push('Moneda', product.currency);
  if (product.weight) push('Peso', `${product.weight} kg`);

  return specs;
}

/**
 * Mapea un producto normalizado de Tiendanube a los campos del modelo Product.
 *
 * @param {Object} product  Producto normalizado (normalizeTiendanubeProduct).
 * @param {{ images?: {url:string,isMain:boolean}[] }} [opts]
 * @returns {Object} Campos del modelo Product (sin seller/sellerName).
 */
export function tiendanubeToProduct(product = {}, opts = {}) {
  const { images = [] } = opts;

  const { category, subCategory } = mapTiendanubeCategory(product.categoryBreadcrumb || []);

  // Oferta: si la tienda muestra precio de lista más alto que el de venta,
  // publicamos el de lista como base y el de venta como promo (tachado).
  const hasSale =
    product.onSale &&
    Number(product.listPrice) > Number(product.price) &&
    Number(product.price) > 0;

  const basePrice = hasSale ? Number(product.listPrice) : Number(product.price);

  const description =
    String(product.description || '').trim() ||
    `${product.name} — producto importado desde la tienda del proveedor.`;

  return {
    name: product.name || '',
    brand: resolveBrand(product),
    sku: product.sku || '',
    description,
    price: basePrice || 0,
    currency: product.currency === 'USD' ? 'USD' : 'ARS',
    sale: hasSale
      ? { active: true, price: Number(product.price) }
      : { active: false, price: 0 },
    stock: product.isInStock ? Math.max(1, Number(product.stock) || 1) : 0,
    condition: 'new',
    category,
    subCategory,
    images,
    specifications: buildSpecifications(product),
    shipping: {
      free: false,
      cost: 0,
      isDigital: false,
      mode: 'both',
      dimensions: {
        weight: Number(product.weight) || 0,
        length: 0,
        width: 0,
        height: 0,
      },
      shippingTime: '48h',
      delivery: { homeDelivery: true, pickup: false, pickupLocationIds: [] },
    },
    listingType: 'product',
    source: 'provider',
    sourceUrl: product.permalink || product.url || '',
  };
}

/**
 * Construye el objeto `providerRef` para trazabilidad con Tiendanube.
 *
 * Nota: el `id` del modelo es numérico; Tiendanube también usa ids numéricos
 * de producto, así que lo guardamos tal cual.
 *
 * @param {Object} product
 * @returns {Object}
 */
export function buildTiendanubeProviderRef(product = {}) {
  return {
    provider: 'tiendanube',
    id: Number(product.id) || null,
    codigo_producto: product.sku || '',
    codigo_alfa: '',
    costPvpArs: Number(product.price) || 0,
    sourceUrl: product.permalink || product.url || '',
    storeName: 'Santiago Deportes',
  };
}
