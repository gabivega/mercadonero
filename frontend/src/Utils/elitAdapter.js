// ─────────────────────────────────────────────────────────────────────────────
// Adaptador entre el shape de Elit y nuestro ProductForm/Product.
//
// Elit entrega campos propios (nombre, pvp_ars, stock_total, imagenes,
// categoria, sub_categoria) que NO coinciden con los slugs de categoría de
// la plataforma. Por eso:
//   - Mapeamos lo que podemos automáticamente.
//   - El usuario completa/ajusta categoría y subcategoría en el formulario.
// ─────────────────────────────────────────────────────────────────────────────

// Markup por defecto sobre el costo del proveedor para el precio de venta.
export const DEFAULT_MARKUP = 0.20; // +20%

/**
 * Calcula el precio de venta aplicando el markup sobre el costo de Elit.
 * @param {number} cost  pvp_ars del proveedor.
 * @param {number} [markup=DEFAULT_MARKUP]
 * @returns {number} precio redondeado (múltiplo de 10 hacia arriba).
 */
export const priceWithMarkup = (cost, markup = DEFAULT_MARKUP) => {
  const base = Number(cost) || 0;
  if (base <= 0) return 0;
  const raw = base * (1 + markup);
  // Redondeo "comercial" a múltiplos de 10 (hacia arriba) para precios lindos.
  return Math.ceil(raw / 10) * 10;
};

/**
 * Normaliza la garantía de Elit a nuestro campo `warranty`.
 * Elit la manda como string ("36 MESES") o número (meses: 12).
 * @param {string|number} garantia
 * @returns {{type: 'none'|'factory', duration: string}}
 */
const parseWarranty = (garantia) => {
  if (!garantia) return { type: "none", duration: "" };

  // Si viene como número, asumimos meses.
  if (typeof garantia === "number") {
    return { type: "factory", duration: `${garantia} meses` };
  }

  const text = String(garantia).trim();
  const monthsMatch = text.match(/(\d+)\s*(mes|meses)?/i);
  if (monthsMatch && monthsMatch[1]) {
    const months = Number(monthsMatch[1]);
    // Si dice "días", lo respetamos como texto; si son meses, lo normalizamos.
    if (/d[ií]a/i.test(text)) {
      return { type: "factory", duration: `${months} días` };
    }
    return { type: "factory", duration: `${months} meses` };
  }

  // Garantía con texto no numérico (ej: "GARANTIA OFICIAL")
  return { type: "factory", duration: text };
};

/**
 * Construye el array de `specifications` (clave-valor) a partir de los campos
 * "sueltos" que expone Elit (equivalentes a su bloque web de Características).
 * @param {Object} elitProduct
 * @returns {{key: string, value: string}[]}
 */
const buildSpecifications = (elitProduct = {}) => {
  const specs = [];
  const push = (key, value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (!str || str === "0") return; // omitimos ean=0 / valores vacíos
    specs.push({ key, value: str });
  };

  push("Alfanumérico", elitProduct.codigo_alfa);
  push("SKU", elitProduct.codigo_producto);
  push("EAN", elitProduct.ean);
  push("Garantía", elitProduct.garantia);
  if (Number(elitProduct.peso) > 0) {
    push("Peso", `${elitProduct.peso} kg`);
  }
  const d = elitProduct.dimensiones;
  if (d && (Number(d.largo) > 0 || Number(d.ancho) > 0 || Number(d.alto) > 0)) {
    push("Dimensiones", `${d.largo}cm x ${d.ancho}cm x ${d.alto}cm`);
  }

  return specs;
};

/**
 * Mapea el peso y las dimensiones de Elit a `shipping.dimensions`.
 * IMPORTANTE: Elit entrega las dimensiones en CENTÍMETROS (aunque en algún
 * producto puntual pueda venir en metros por error de carga). Normalizamos:
 * si un valor es sospechosamente chico (<1) lo tratamos como metros y lo
 * pasamos a cm. El peso viene en kg.
 * @param {Object} elitProduct
 * @returns {{weight:number, length:number, width:number, height:number}}
 */
const mapDimensions = (elitProduct = {}) => {
  const cm = (v) => {
    const n = Number(v) || 0;
    if (n <= 0) return 0;
    // Si viene en metros (ej: 0.36), lo convertimos a cm.
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
 * Mapea un producto crudo de Elit al `initialData` que consume ProductForm.
 *
 * @param {Object} elitProduct  Ítem del array `resultado` de Elit.
 * @param {{ images?: {url:string,isMain:boolean}[], markup?: number }} opts
 *        images: ya subidas a Cloudinary (si todavía no, se deja []).
 * @returns {Object} initialData para ProductForm.
 */
export const elitToProductForm = (elitProduct = {}, opts = {}) => {
  const { images = [], markup = DEFAULT_MARKUP } = opts;

  const cost = Number(elitProduct.pvp_ars) || 0;
  const finalPrice = priceWithMarkup(cost, markup);

  const specs = buildSpecifications(elitProduct);

  // Elit no provee una descripción en texto libre. Armamos una breve a partir
  // de los datos disponibles (marca + nombre + specs) para que el usuario la
  // edite. Si más adelante Elit agrega `descripcion`/`detalle`, se usa eso.
  const baseDescription = [
    elitProduct.detalle,
    elitProduct.descripcion,
  ].filter(Boolean).join("\n").trim();

  const specsText = specs.map((s) => `• ${s.key}: ${s.value}`).join("\n");
  const description = baseDescription
    ? `${baseDescription}\n\n${specsText}`
    : specsText;

  return {
    name: elitProduct.nombre || elitProduct.detalle || "",
    brand: elitProduct.marca || "",
    // SKU: usamos el código de producto de Elit como SKU de la publicación.
    sku: elitProduct.codigo_producto || elitProduct.codigo_alfa || "",
    description: description.trim(),
    price: finalPrice,
    currency: "ARS",
    stock: Math.max(1, Number(elitProduct.stock_total) || 1),
    condition: "new",
    images,
    // Características (clave-valor) tomadas de los campos de Elit.
    specifications: specs,
    // Garantía declarada por el proveedor.
    warranty: parseWarranty(elitProduct.garantia),
    // Logística: peso y dimensiones del proveedor.
    shipping: {
      dimensions: mapDimensions(elitProduct),
    },
    // Categoría/subcategoría quedan vacías a propósito: Elit usa sus propias
    // categorías; el usuario las elige en los selects del form.
    category: "",
    subCategory: "",
  };
};

/**
 * Construye el objeto `providerRef` para guardar la trazabilidad del producto.
 */
export const buildProviderRef = (elitProduct = {}) => ({
  provider: "elit",
  id: elitProduct.id ?? null,
  codigo_producto: elitProduct.codigo_producto || "",
  codigo_alfa: elitProduct.codigo_alfa || "",
  costPvpArs: Number(elitProduct.pvp_ars) || 0,
  sourceUrl: elitProduct.imagen || elitProduct.imagenes?.[0] || "",
});
