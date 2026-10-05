import { mapFlamingCategories } from './flamingCategoryMap.js';

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Flaming (Woo Store API normalizado) → modelo Product de MN.
//
// A diferencia de Elit, acá NO aplicamos markup: el precio que se publica es
// el PRECIO FINAL del proveedor (tal como aparece en su tienda). Esto responde
// al objetivo actual: mostrar el catálogo de Flaming con su precio de lista.
//
// Las imágenes NO se incluyen acá (se suben a Cloudinary aparte, en el flujo
// de importación). Este adapter sólo arma los campos "de datos".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye una descripción de texto a partir de los datos del producto de
 * Flaming (la Store API manda HTML en `description`, que limpiamos a texto).
 * @param {Object} product  Producto normalizado de Flaming.
 * @returns {string}
 */
function buildDescription(product) {
  const stripHtml = (html) =>
    String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const base = stripHtml(product.description) || stripHtml(product.shortDescription);

  const parts = [];
  if (base) parts.push(base);
  if (product.brands?.length) parts.push(`Marca: ${product.brands.join(', ')}`);
  if (product.categories?.length) {
    parts.push(`Categorías del proveedor: ${product.categories.map((c) => c.name).join(', ')}`);
  }

  // La descripción es obligatoria en el modelo; garantizamos algo.
  return parts.join('\n\n').trim() || product.name || 'Producto del proveedor Flaming.';
}

/**
 * Marca (brand) del producto. Flaming puede no exponerla; caemos al primer
 * segmento del nombre o "Genérico".
 * @param {Object} product
 * @returns {string}
 */
function inferBrand(product) {
  if (product.brands?.length) return product.brands[0];
  // Heurística: primera palabra "tipo marca" (todo mayúsculas en el nombre).
  const firstWord = String(product.name || '').trim().split(/\s+/)[0] || '';
  if (firstWord && firstWord === firstWord.toUpperCase() && firstWord.length >= 3) {
    return firstWord;
  }
  return 'Genérico';
}

/**
 * Mapea un producto normalizado de Flaming a `initialData` para el ProductForm
 * (frontend) o directamente a los campos del modelo Product (bulk).
 *
 * @param {Object} product  Producto normalizado (normalizeFlamingProduct).
 * @param {{ images?: {url:string,isMain:boolean}[] }} [opts]
 * @returns {Object} Campos del modelo Product (sin seller/sellerName).
 */
export function flamingToProduct(product = {}, opts = {}) {
  const { images = [] } = opts;

  const { category, subCategory } = mapFlamingCategories(product.categories);

  // Precio de lista publicado:
  //   - Si el proveedor tiene OFERTA (regular > sale), publicamos regularPrice
  //     como precio base y la oferta como promoción (para que se vea el tachado).
  //   - Si no, publicamos el precio final del proveedor tal cual.
  const hasSale =
    product.onSale &&
    Number(product.regularPrice) > Number(product.salePrice) &&
    Number(product.salePrice) > 0;

  const basePrice = hasSale ? Number(product.regularPrice) : Number(product.price);

  return {
    name: product.name || '',
    brand: inferBrand(product),
    sku: product.sku || '',
    description: buildDescription(product),
    price: basePrice || 0,
    currency: product.currency === 'USD' ? 'USD' : 'ARS',
    sale: hasSale
      ? { active: true, price: Number(product.salePrice) }
      : { active: false, price: 0 },
    stock: product.isInStock ? 10 : 0,
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
      dimensions: { weight: 0, length: 0, width: 0, height: 0 },
      shippingTime: '48h',
      delivery: { homeDelivery: true, pickup: false, pickupLocationIds: [] },
    },
    listingType: 'product',
    source: 'provider',
    sourceUrl: product.permalink || '',
  };
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
  if (product.categories?.length) {
    push('Categoría', product.categories.map((c) => c.name).join(' > '));
  }
  if (product.currency) push('Moneda', product.currency);

  return specs;
}

/**
 * Construye el objeto `providerRef` para trazabilidad con Flaming.
 * Guardamos el id numérico de WooCommerce, el SKU del proveedor y el precio
 * de costo (acá, el precio final del proveedor al momento de importar).
 *
 * @param {Object} product
 * @returns {Object}
 */
export function buildFlamingProviderRef(product = {}) {
  return {
    provider: 'flaming',
    id: Number(product.id) || null,
    codigo_producto: product.sku || '',
    codigo_alfa: '',
    costPvpArs: Number(product.price) || 0,
    sourceUrl: product.permalink || product.images?.[0]?.src || '',
    storeName: 'Flaming',
  };
}
