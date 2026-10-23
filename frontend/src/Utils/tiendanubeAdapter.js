// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Tiendanube (producto scrapeado normalizado) → ProductForm de MN.
//
// El backend nos devuelve el producto normalizado desde /api/tiendanube/producto
// (precio final, categoría mapeada, 1 imagen por hotlink). Acá sólo armamos el
// `initialData` que consume ProductForm.
//
// Igual que Directcar/Flaming: NO hay markup (el precio publicado es el de la
// tienda) y las imágenes se dejan con su URL ORIGINAL (hotlink).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arma `specifications` (clave-valor) a partir de los datos del producto.
 * @param {Object} product
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
  if (product.categoryBreadcrumb?.length) {
    push('Categoría', product.categoryBreadcrumb.join(' > '));
  }
  if (product.currency) push('Moneda', product.currency);
  if (product.weight) push('Peso', `${product.weight} kg`);

  return specs;
};

/**
 * Mapea un producto normalizado de Tiendanube al `initialData` de ProductForm.
 *
 * @param {Object} product  Producto normalizado de /api/tiendanube/producto.
 * @param {{ images?: {url:string,isMain:boolean}[] }} [opts]
 * @returns {Object}
 */
export const tiendanubeToProductForm = (product = {}, opts = {}) => {
  const { images = [] } = opts;

  const hasSale =
    product.onSale &&
    Number(product.listPrice) > Number(product.price) &&
    Number(product.price) > 0;

  const basePrice = hasSale ? Number(product.listPrice) : Number(product.price);

  const specs = buildSpecifications(product);
  const specsText = specs.map((s) => `• ${s.key}: ${s.value}`).join('\n');
  const base = String(product.description || '').trim();
  const description = base ? (specsText ? `${base}\n\n${specsText}` : base) : specsText;

  return {
    name: product.name || '',
    brand: '', // Se deja para que el usuario lo complete; el adapter de backend lo infiere.
    sku: product.sku || '',
    description: description.trim(),
    price: basePrice || 0,
    currency: product.currency === 'USD' ? 'USD' : 'ARS',
    sale: hasSale
      ? { active: true, price: Number(product.price) }
      : { active: false, price: 0 },
    stock: product.isInStock ? Math.max(1, Number(product.stock) || 1) : 0,
    condition: 'new',
    images,
    specifications: specs,
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
    // La categoría viene YA mapeada a nuestras categorías (desde el backend).
    category: product.mnCategory || '',
    subCategory: product.mnSubCategory || '',
  };
};

/**
 * Construye el `providerRef` para trazabilidad con Tiendanube.
 * @param {Object} product
 * @returns {Object}
 */
export const buildTiendanubeProviderRef = (product = {}) => ({
  provider: 'tiendanube',
  id: Number(product.id) || null,
  codigo_producto: product.sku || '',
  codigo_alfa: '',
  costPvpArs: Number(product.price) || 0,
  sourceUrl: product.permalink || product.url || '',
  storeName: 'Santiago Deportes',
});
