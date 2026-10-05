// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Flaming (Woo Store API normalizada) → ProductForm de MN.
//
// El backend ya nos devuelve el producto normalizado desde /api/flaming/productos
// (precio final en pesos, categorías mapeadas, imágenes por hotlink). Acá sólo
// armamos el `initialData` que consume ProductForm.
//
// A diferencia de Elit, NO hay markup: el precio publicado es el del proveedor.
// Las imágenes se dejan con su URL ORIGINAL (hotlink), sin subir a Cloudinary.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arma `specifications` (clave-valor) a partir de los datos del producto.
 * @param {Object} product  Producto normalizado de Flaming.
 * @returns {{key:string, value:string}[]}
 */
const buildSpecifications = (product = {}) => {
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
};

/**
 * Limpia el HTML de la descripción de WooCommerce a texto plano.
 * @param {string} html
 * @returns {string}
 */
const stripHtml = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Marca del producto. Flaming puede no exponerla; caemos a la primera palabra
 * "tipo marca" (todo mayúsculas) o "Genérico".
 * @param {Object} product
 * @returns {string}
 */
const inferBrand = (product = {}) => {
  if (product.brands?.length) return product.brands[0];
  const firstWord = String(product.name || '').trim().split(/\s+/)[0] || '';
  if (firstWord && firstWord === firstWord.toUpperCase() && firstWord.length >= 3) {
    return firstWord;
  }
  return 'Genérico';
};

/**
 * Mapea un producto normalizado de Flaming al `initialData` de ProductForm.
 *
 * @param {Object} product  Producto de /api/flaming/productos (ya normalizado).
 * @param {{ images?: {url:string,isMain:boolean}[] }} [opts]
 * @returns {Object}
 */
export const flamingToProductForm = (product = {}, opts = {}) => {
  const { images = [] } = opts;

  const hasSale =
    product.onSale &&
    Number(product.regularPrice) > Number(product.salePrice) &&
    Number(product.salePrice) > 0;

  const basePrice = hasSale ? Number(product.regularPrice) : Number(product.price);

  const base = stripHtml(product.description) || stripHtml(product.shortDescription);
  const specs = buildSpecifications(product);
  const specsText = specs.map((s) => `• ${s.key}: ${s.value}`).join('\n');
  const description = base ? `${base}\n\n${specsText}` : specsText;

  return {
    name: product.name || '',
    brand: inferBrand(product),
    sku: product.sku || '',
    description: description.trim(),
    price: basePrice || 0,
    currency: product.currency === 'USD' ? 'USD' : 'ARS',
    sale: hasSale
      ? { active: true, price: Number(product.salePrice) }
      : { active: false, price: 0 },
    stock: product.isInStock ? 10 : 0,
    condition: 'new',
    images,
    specifications: specs,
    shipping: {
      free: false,
      cost: 0,
      isDigital: false,
      mode: 'both',
      dimensions: { weight: 0, length: 0, width: 0, height: 0 },
      shippingTime: '48h',
      delivery: { homeDelivery: true, pickup: false, pickupLocationIds: [] },
    },
    // La categoría viene YA mapeada a nuestras categorías (desde el backend).
    category: product.mnCategory || '',
    subCategory: product.mnSubCategory || '',
  };
};

/**
 * Construye el `providerRef` para trazabilidad con Flaming.
 * @param {Object} product
 * @returns {Object}
 */
export const buildFlamingProviderRef = (product = {}) => ({
  provider: 'flaming',
  id: Number(product.id) || null,
  codigo_producto: product.sku || '',
  codigo_alfa: '',
  costPvpArs: Number(product.price) || 0,
  sourceUrl: product.permalink || product.images?.[0]?.src || '',
  storeName: 'Flaming',
});
