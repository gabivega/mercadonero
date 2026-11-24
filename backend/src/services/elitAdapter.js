import { mapElitCategories } from './elitCategoryMap.js';
import { priceWithMarkup, DEFAULT_ELIT_MARKUP } from './elitService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Elit → modelo Product de Mercado Nero (LADO SERVIDOR).
//
// Es el equivalente backend de frontend/src/Utils/elitAdapter.js. Se duplica a
// propósito porque el backend no puede importar código del cliente, y porque
// este adapter produce directamente los campos del modelo Product (no el
// `initialData` que consume el ProductForm).
//
// Diferencias deliberadas con el flujo individual (ElitImportModal):
//   - APLICA MARKUP sobre el costo (`pvp_ars`), igual que el form precargado.
//   - Mapea la categoría/subcategoría de Elit a los slugs de MN vía
//     elitCategoryMap.js (el form las deja vacías para que el humano elija).
//   - Recibe las imágenes como URLs HOTLINK de Elit: el controlador decide si
//     las copia a Cloudinary o no (ver bulkImportElit).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el precio de venta comercial a partir del costo del proveedor y
 * devuelve también el resultado redondeado. Reexportamos `priceWithMarkup`
 * desde elitService para no duplicar la fórmula.
 */

/**
 * Normaliza la garantía de Elit ("36 MESES" o 12) al campo `warranty`.
 * @param {string|number} garantia
 * @returns {{type: 'none'|'factory', duration: string}}
 */
const parseWarranty = (garantia) => {
  if (!garantia) return { type: 'none', duration: '' };

  if (typeof garantia === 'number') {
    return { type: 'factory', duration: `${garantia} meses` };
  }

  const text = String(garantia).trim();
  const monthsMatch = text.match(/(\d+)\s*(mes|meses)?/i);
  if (monthsMatch && monthsMatch[1]) {
    const amount = Number(monthsMatch[1]);
    if (/d[ií]a/i.test(text)) {
      return { type: 'factory', duration: `${amount} días` };
    }
    return { type: 'factory', duration: `${amount} meses` };
  }

  return { type: 'factory', duration: text };
};

/**
 * Arma `specifications` (clave-valor) a partir de los campos planos de Elit.
 * @param {Object} elitProduct
 * @returns {{key:string, value:string}[]}
 */
const buildSpecifications = (elitProduct = {}) => {
  const specs = [];
  const push = (key, value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (!str || str === '0') return; // omitimos ean=0 / valores vacíos
    specs.push({ key, value: str });
  };

  push('Alfanumérico', elitProduct.codigo_alfa);
  push('SKU', elitProduct.codigo_producto);
  push('EAN', elitProduct.ean);
  push('Garantía', elitProduct.garantia);
  // NOTA: NO agregamos "Categoría proveedor"/"Subcategoría proveedor".
  // La categoría de Elit es información interna del proveedor: la categoría
  // real de la publicación es la de MN (`category`/`subCategory`, mapeada con
  // elitCategoryMap.js) y ya se ve en el breadcrumb y en los filtros del
  // catálogo. Si además la volcábamos a `specifications`, buildDescription la
  // terminaba publicando en la descripción (detalle que no debe ver el
  // comprador). Para limpiar lo ya importado:
  //   node scripts/cleanElitProviderCategorySpecs.mjs --apply
  if (Number(elitProduct.peso) > 0) {
    push('Peso', `${elitProduct.peso} kg`);
  }
  const d = elitProduct.dimensiones;
  if (d && (Number(d.largo) > 0 || Number(d.ancho) > 0 || Number(d.alto) > 0)) {
    push('Dimensiones', `${d.largo}cm x ${d.ancho}cm x ${d.alto}cm`);
  }

  return specs;
};

/**
 * Mapea peso/dimensiones al bloque `shipping.dimensions`. Elit entrega
 * dimensiones en CM (ver adapter del front); normalizamos valores <1 como
 * metros por si algún producto viene mal cargado.
 * @param {Object} elitProduct
 */
const mapDimensions = (elitProduct = {}) => {
  const cm = (v) => {
    const n = Number(v) || 0;
    if (n <= 0) return 0;
    return n < 1 ? Math.round(n * 100) : n;
  };

  return {
    weight: Number(elitProduct.peso) || 0,
    length: cm(elitProduct.dimensiones?.largo),
    width: cm(elitProduct.dimensiones?.ancho),
    height: cm(elitProduct.dimensiones?.alto),
  };
};

/**
 * Arma la descripción a partir de `detalle`/`descripcion` + las specs.
 * @param {Object} elitProduct
 * @param {{key:string,value:string}[]} specs
 * @returns {string}
 */
const buildDescription = (elitProduct = {}, specs = []) => {
  const base = [elitProduct.detalle, elitProduct.descripcion]
    .filter(Boolean)
    .join('\n')
    .trim();
  const specsText = specs.map((s) => `• ${s.key}: ${s.value}`).join('\n');
  const description = base ? `${base}\n\n${specsText}` : specsText;
  // La descripción es obligatoria en el modelo; garantizamos algo.
  return (
    description.trim() ||
    `Producto del proveedor Elit${elitProduct.marca ? ` - ${elitProduct.marca}` : ''}.`
  );
};

/**
 * Mapea un producto crudo de Elit a los campos del modelo Product (sin datos
 * del vendedor ni `providerRef`, que los agrega el controlador).
 *
 * @param {Object} elitProduct  Ítem de `resultado` de la API de Elit.
 * @param {{ images?: {url:string,isMain:boolean}[], markup?: number }} [opts]
 * @returns {Object} Campos listos para `new Product({...})`.
 */
export function elitToProduct(elitProduct = {}, opts = {}) {
  const { images = [], markup = DEFAULT_ELIT_MARKUP } = opts;

  const cost = Number(elitProduct.pvp_ars) || 0;
  const finalPrice = priceWithMarkup(cost, markup);
  const specs = buildSpecifications(elitProduct);
  const { category, subCategory } = mapElitCategories(
    elitProduct.categoria,
    elitProduct.sub_categoria
  );

  return {
    name: String(elitProduct.nombre || elitProduct.detalle || '').trim(),
    brand: String(elitProduct.marca || '').trim() || 'Genérico',
    sku: String(elitProduct.codigo_producto || elitProduct.codigo_alfa || '').trim(),
    description: buildDescription(elitProduct, specs),
    price: finalPrice || 0,
    currency: 'ARS',
    // Stock: si Elit no informa, asumimos 1 (mínimo del modelo). Si es 0, el
    // producto igual se crea pero el controlador lo marca out_of_stock.
    stock: Math.max(1, Number(elitProduct.stock_total) || 1),
    condition: 'new',
    category,
    subCategory,
    images,
    specifications: specs,
    warranty: parseWarranty(elitProduct.garantia),
    sale: { active: false, price: 0 },
    shipping: {
      free: false,
      cost: 0,
      isDigital: false,
      mode: 'both',
      dimensions: mapDimensions(elitProduct),
      shippingTime: '48h',
      delivery: {
        homeDelivery: true,
        pickup: false,
        pickupLocationIds: [],
        homeDeliveryMode: 'zipnova',
      },
    },
    // Elit vende productos físicos de pago (escrow): listingType product.
    listingType: 'product',
    payment: {
      acceptsTransfer: true,
      acceptsCrypto: false,
    },
    source: 'provider',
    sourceUrl: elitProduct.imagen || elitProduct.imagenes?.[0] || '',
  };
}

/**
 * Construye el `providerRef` de trazabilidad con Elit.
 * @param {Object} elitProduct
 * @returns {Object}
 */
export function buildElitProviderRef(elitProduct = {}) {
  return {
    provider: 'elit',
    id: elitProduct.id != null ? Number(elitProduct.id) : null,
    codigo_producto: String(elitProduct.codigo_producto || ''),
    codigo_alfa: String(elitProduct.codigo_alfa || ''),
    costPvpArs: Number(elitProduct.pvp_ars) || 0,
    sourceUrl: elitProduct.imagen || elitProduct.imagenes?.[0] || '',
    storeName: 'Elit',
  };
}

/**
 * Extrae las URLs de imagen de un producto de Elit (máximo `maxImages`).
 * @param {Object} elitProduct
 * @param {number} [maxImages=5]
 * @returns {string[]}
 */
export function getElitImageUrls(elitProduct = {}, maxImages = 5) {
  let list = [];
  if (Array.isArray(elitProduct.imagenes) && elitProduct.imagenes.length > 0) {
    list = elitProduct.imagenes;
  } else if (elitProduct.imagen) {
    list = [elitProduct.imagen];
  }
  return list.filter(Boolean).slice(0, Math.max(0, Number(maxImages) || 0));
}
