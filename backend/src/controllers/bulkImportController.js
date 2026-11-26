import Product from "../models/Product.js";
import User from "../models/User.js";
import allCategories from "../categoriesWithSlugs.js";

// Índice rápido de categorías válidas de la plataforma: slug -> Set de slugs de subcategorías
const categoryMap = new Map();
allCategories.forEach((cat) => {
  categoryMap.set(cat.slug, new Set((cat.subcategories || []).map((s) => s.slug)));
});

const categoriesWithoutBrand = ["inmuebles", "servicios"];

// ── LÍMITE DE PUBLICACIONES POR CUENTA ─────────────────────────────────────
// Hoy TODAS las cuentas son gratuitas, así que aplicamos un tope duro para
// evitar que un vendedor (o un script) llene el catálogo de golpe. El cupo se
// calcula sobre el TOTAL de publicaciones NO eliminadas del vendedor: lo que ya
// publicó ocupa lugar, así que la carga masiva no sirve para saltearlo
// publicando de a tandas.
// Configurable por env (backend/.env → BULK_IMPORT_MAX_PRODUCTS=300) para poder
// subirlo cuando existan planes pagos, sin tocar código.
export const DEFAULT_MAX_PRODUCTS = 300;
const MAX_PRODUCTS_PER_ACCOUNT = (() => {
  const raw = Number(process.env.BULK_IMPORT_MAX_PRODUCTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_PRODUCTS;
})();

// Estados que "ocupan lugar" en el cupo. Los `deleted` NO cuentan: el vendedor
// los dio de baja y puede reemplazarlos.
const COUNTED_STATUSES = ["active", "paused", "out_of_stock"];

// Tope de filas procesables en UNA sola request. El archivo puede subirse
// completo; el front lo parte en tandas chicas para no colgar la API.
const MAX_ROWS_PER_REQUEST = 1000;

// Defaults alineados con `createProduct` (productController.js). La carga
// masiva NO pasa por ese controlador, así que sin esto los productos del Excel
// quedaban con otra configuración (p. ej. despacho 24h en vez de 48h, o entrega
// a domicilio deshabilitada por el default del schema).
const DEFAULT_SHIPPING_TIME = "48h";
// Quién gestiona el envío a domicilio cuando no se especifica (ver Product.js).
// "zipnova" = cotización de la plataforma; requiere peso/dimensiones cargados.
const DEFAULT_HOME_DELIVERY_MODE = "zipnova";

// Códigos que cortan TODA la tanda: no tiene sentido seguir creando productos
// si el vendedor agotó su cupo o le falta lo que el checkout necesita.
const BATCH_FATAL_CODES = new Set([
  "PRODUCT_LIMIT_REACHED",
  "PAYMENT_METHOD_REQUIRED",
  "WALLET_REQUIRED",
]);

// Mapeo para normalizar los valores de envío booleano
const toBoolean = (value) => {
  if (value === undefined || value === null || value === "") return false;
  const str = String(value).trim().toLowerCase();
  return ["si", "sí", "true", "1", "y", "yes", "s"].includes(str);
};

// Normaliza el tiempo de despacho
const normalizeShippingTime = (value) => {
  if (!value) return "24h";
  const str = String(value).trim().toLowerCase();
  if (str.includes("48")) return "48h";
  if (str.includes("72")) return "72h";
  if (str.includes("mas") || str.includes("más")) return "more";
  return "24h";
};

// Normaliza el estado del producto
const normalizeCondition = (value) => {
  if (!value) return "new";
  const str = String(value).trim().toLowerCase();
  if (str.includes("us")) return "used";
  if (str.includes("reacond")) return "refurbished";
  return "new";
};

// Normaliza la moneda
const normalizeCurrency = (value) => {
  if (!value) return "ARS";
  const str = String(value).trim().toUpperCase();
  return str === "USD" ? "USD" : "ARS";
};

/**
 * Sanitiza y mapea una fila del Excel/CSV a la estructura del modelo Product.
 * Devuelve { data, errors } donde errors es un array de mensajes por fila.
 */
const mapRowToProduct = (row, index) => {
  const errors = [];

  // Helper para extraer texto
  const get = (key) => {
    const val = row[key];
    if (val === undefined || val === null) return "";
    return String(val).trim();
  };

  const name = get("titulo") || get("title") || get("TITULO");
  const brand = get("marca") || get("brand") || get("MARCA");
  const category = (get("categoria") || get("category") || get("CATEGORIA")).toLowerCase();
  const subCategory = (get("subcategoria") || get("subcategory") || get("SUBCATEGORIA")).toLowerCase();
  const description = get("descripcion") || get("description") || get("DESCRIPCION");
  const price = Number(get("precio") || get("price") || get("PRECIO")) || 0;
  const salePrice = Number(get("precio_oferta") || get("sale_price") || get("sale") || 0) || 0;
  const currency = normalizeCurrency(get("moneda") || get("currency") || get("MONEDA"));
  const condition = normalizeCondition(get("estado") || get("condition") || get("ESTADO"));
  const stock = Number(get("stock") || get("STOCK") || 1) || 1;
    // OJO: si la columna viene vacía, el default es 48h (el del form de
  // publicación), NO 24h. Por eso solo normalizamos cuando hay valor.
  const shippingTimeRaw = get("tiempo_despacho") || get("shipping_time") || get("TIEMPO_DESPACHO");
  const shippingTime = shippingTimeRaw
    ? normalizeShippingTime(shippingTimeRaw)
    : DEFAULT_SHIPPING_TIME;
  const isDigital = toBoolean(get("envio_digital") || get("is_digital") || get("ENVIO_DIGITAL"));
  const digitalUrl = get("link_digital") || get("digital_url") || get("LINK_DIGITAL");
  const freeShipping = !isDigital && toBoolean(get("envio_gratis") || get("free_shipping") || get("ENVIO_GRATIS"));
  const shippingCost = Number(get("costo_envio") || get("shipping_cost") || get("COSTO_ENVIO") || 0) || 0;
  const weight = Number(get("peso_kg") || get("weight_kg") || get("PESO_KG") || 0) || 0;
  const length = Number(get("largo_cm") || get("length_cm") || get("LARGO_CM") || 0) || 0;
  const width = Number(get("ancho_cm") || get("width_cm") || get("ANCHO_CM") || 0) || 0;
  const height = Number(get("alto_cm") || get("height_cm") || get("ALTO_CM") || 0) || 0;

  // URLs de imágenes (máximo 3)
  const imageUrls = [
    get("imagen1") || get("image1") || get("IMAGEN1"),
    get("imagen2") || get("image2") || get("IMAGEN2"),
    get("imagen3") || get("image3") || get("IMAGEN3"),
  ].filter(Boolean).slice(0, 3);

  // ── VALIDACIONES ──
  const needsBrand = !categoriesWithoutBrand.includes(category);

  if (!name) errors.push(`Fila ${index + 2}: falta el título.`);
  else if (name.length < 5) errors.push(`Fila ${index + 2}: el título es demasiado corto (mínimo 5 caracteres).`);

  if (!description) errors.push(`Fila ${index + 2}: falta la descripción.`);

  // Validación estricta contra las categorías/subcategorías oficiales de la plataforma.
  // (NUNCA se crean categorías nuevas: el vendedor debe usar exactamente un slug válido).
  if (!category) {
    errors.push(`Fila ${index + 2}: falta la categoría.`);
  } else if (!categoryMap.has(category)) {
    errors.push(
      `Fila ${index + 2}: la categoría '${category}' no existe en la plataforma. ` +
      `Usá uno de los slugs oficiales (ej. 'celulares-y-telefonos').`
    );
  } else if (subCategory && !categoryMap.get(category).has(subCategory)) {
    errors.push(
      `Fila ${index + 2}: la subcategoría '${subCategory}' no pertenece a la categoría '${category}'. ` +
      `Revisá la lista oficial de subcategorías.`
    );
  }

  if (needsBrand && !brand) errors.push(`Fila ${index + 2}: falta la marca.`);
  if (price <= 0) errors.push(`Fila ${index + 2}: el precio debe ser mayor a cero.`);
  if (salePrice > 0 && salePrice >= price) {
    errors.push(`Fila ${index + 2}: el precio de oferta debe ser menor al precio original.`);
  }

  // Las imágenes no son obligatorias (el usuario puede cargarlas después)
  // Pero si vienen, validamos formato de URLs
  imageUrls.forEach((url) => {
    try {
      new URL(url);
    } catch {
      errors.push(`Fila ${index + 2}: la URL de imagen '${url}' no es válida.`);
    }
  });

  // ── CONSTRUCCIÓN DEL OBJETO ──
  const data = {
    name,
    brand: needsBrand ? brand : undefined,
    description,
    price,
    currency,
    sale: salePrice > 0 ? { active: true, price: salePrice } : { active: false, price: 0 },
    stock: Math.floor(stock),
    category,
    subCategory: subCategory || "",
    condition,
    images: imageUrls.map((url, i) => ({ url, isMain: i === 0 })),
    shipping: {
      isDigital,
      free: freeShipping,
      cost: isDigital ? 0 : shippingCost,
      dimensions: { weight, length, width, height },
      shippingTime,
    },
    listingType: "product",
    source: "manual",
    };

  if (isDigital && digitalUrl) {
    data.shipping.digitalUrl = digitalUrl;
  }

  return { data, errors, hasErrors: errors.length > 0 };
};

// Valida los campos que el CHECKOUT necesita y que `createProduct` exige pero
// el cargador masivo antes NO chequeaba. Se aplican en el backend (y no solo en
// el importador) porque la carga masiva saltea el controlador de publicación y
// un archivo podía crear productos rotos: sin foto, sin método de pago o con
// oferta inválida. Devuelve un mensaje de error o "" si está todo bien.
const validateProductForSale = (productData) => {
  if (!Array.isArray(productData?.images) || productData.images.length === 0) {
    return "falta al menos una imagen. Cargá 'imagen1' con la URL directa de la foto (debe terminar en .jpg/.png/.webp), o subí las fotos después desde el editor del producto.";
  }

  const payment = productData?.payment || {};
  if (payment.acceptsTransfer === false && payment.acceptsCrypto !== true) {
    return "el producto no acepta ningún medio de pago. Dejá al menos transferencia o cripto.";
  }

  // La oferta tiene que ser un descuento REAL (menor que el precio). El modelo
  // lo permite en 0, así que si viene mal la descartamos en vez de rechazar la fila.
  const sale = productData?.sale;
  if (!sale || sale.active !== true || !(Number(sale.price) > 0)) return "";

  const base = Number(productData?.price);
  if (Number(sale.price) >= base) {
    return `el precio de oferta (${sale.price}) debe ser menor al precio (${base}).`;
  }

  // Si el archivo define 'sale' = precio OFERTA FINAL, esto normaliza el valor
  // por si mañana se decide que la columna sea un descuento porcentual.
  return "";
};

// Normaliza el bloque de envío para que quede igual que lo guarda
// `createProduct`. Sin esto, el producto importado queda con el default del
// schema (`homeDelivery: true` viene de createProduct, pero `shippingTime`
// caía a "24h" y el digital no respetaba el modo de entrega).
const buildShipping = (productData) => {
  const shipping = productData?.shipping || {};
  const isDigital = shipping.isDigital === true;
  const dims = shipping.dimensions || {};

  const normalized = {
    isDigital,
    free: isDigital ? false : shipping.free === true,
    cost: isDigital ? 0 : Number(shipping.cost) || 0,
    dimensions: {
      weight: Number(dims.weight) || 0,
      length: Number(dims.length) || 0,
      width: Number(dims.width) || 0,
      height: Number(dims.height) || 0,
    },
    shippingTime: shipping.shippingTime || DEFAULT_SHIPPING_TIME,
    // Un producto digital no tiene entrega física.
    delivery: {
      homeDelivery: isDigital ? false : true,
      pickup: false,
      pickupLocationIds: [],
      homeDeliveryMode: DEFAULT_HOME_DELIVERY_MODE,
    },
  };

  if (isDigital && shipping.digitalUrl) {
    normalized.digitalUrl = shipping.digitalUrl;
  }

  return normalized;
};

/**
 * GET /api/product/bulk-import/quota
 * Devuelve el cupo de publicaciones de la cuenta para MOSTRARLO en el panel de
 * carga masiva antes de importar. Es informativo: el límite real se aplica en
 * `bulkImport`. No exige onboarding aprobado para poder consultarlo.
 */
export const getBulkImportQuota = async (req, res) => {
  try {
    const userId = req.user._id;

    const currentProducts = await Product.countDocuments({
      seller: userId,
      status: { $in: COUNTED_STATUSES },
    });

    return res.json({
      success: true,
      maxProducts: MAX_PRODUCTS_PER_ACCOUNT,
      currentProducts,
      remaining: Math.max(0, MAX_PRODUCTS_PER_ACCOUNT - currentProducts),
    });
  } catch (error) {
    console.error("Error en getBulkImportQuota:", error);
    res.status(500).json({
      success: false,
      message: "No pudimos obtener el cupo de publicaciones.",
    });
  }
};

/**
 * POST /api/product/bulk-import
 * Carga masiva de productos desde Excel/CSV.
 * El body espera: { products: [...] } con cada producto ya mapeado y validado
 * desde el frontend (ver ImportProductsSection.jsx).
 *
 * El backend VUELVE a validar la estructura mínima (nunca confiar solo en el
 * cliente) y aplica el CUPO de publicaciones por cuenta.
 *
 * Respuesta:
 *   { success, created, failed, blocked? , maxProducts,
 *     createdProducts[], failedProducts[{ row, name, reason }] }
 */
export const bulkImport = async (req, res) => {
  try {
    const userId = req.user._id;

    const userProfile = await User.findById(userId).select(
      "username shop isVerified addresses",
    );
    if (!userProfile) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    // ── UBICACIÓN POR DEFECTO ──
    // La importación masiva no trae `location`, así que usamos la del vendedor
    // para mostrar "Ciudad, Provincia" (ej: "Rosario, Santa Fe").
    // Prioridad: shop.location (despacho) → dirección por defecto → primera.
    const shopLocation = userProfile?.shop?.location || {};
    const defaultAddress =
      userProfile?.addresses?.find((a) => a.isDefault) ||
      userProfile?.addresses?.[0] ||
      {};
    const sellerLocation = {
      city: shopLocation.city || defaultAddress.city || "",
      province: shopLocation.province || defaultAddress.province || "",
    };

    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay productos válidos para importar.",
      });
    }

    if (products.length > MAX_ROWS_PER_REQUEST) {
      return res.status(400).json({
        success: false,
        message: `Máximo ${MAX_ROWS_PER_REQUEST} productos por importación. Partí el archivo en tandas más chicas.`,
      });
    }

    // ── CUPO DE PUBLICACIONES POR CUENTA ──
    // Contamos lo que el vendedor YA tiene (sin contar los eliminados). Si el
    // cupo es 0 o negativo no dejamos importar: devolvemos `blocked` para que el
    // front muestre el mensaje de límite en vez de un error genérico.
    const alreadyPublished = await Product.countDocuments({
      seller: userId,
      status: { $in: COUNTED_STATUSES },
    });
    const remainingQuota = Math.max(0, MAX_PRODUCTS_PER_ACCOUNT - alreadyPublished);

    if (remainingQuota <= 0) {
      return res.status(403).json({
        success: false,
        blocked: "limit",
        message: `Alcanzaste el límite de ${MAX_PRODUCTS_PER_ACCOUNT} publicaciones de tu cuenta gratuita. Eliminá publicaciones para liberar lugar.`,
        maxProducts: MAX_PRODUCTS_PER_ACCOUNT,
        currentProducts: alreadyPublished,
      });
    }

    // Se importa hasta donde alcanza el cupo; el resto se informa como omitido.
    const accepted = products.slice(0, remainingQuota);
    const skippedByQuota = products.length - accepted.length;

    const createdProducts = [];
    const failedProducts = [];
    let blocked = null;
    let fatalMessage = "";

    for (let i = 0; i < accepted.length; i += 1) {
      const productData = accepted[i];

      // Reconteo por si hay otra importación en paralelo o el cupo se llenó
      // dentro de esta misma tanda (el count de arriba es un snapshot).
      const currentCount = await Product.countDocuments({
        seller: userId,
        status: { $in: COUNTED_STATUSES },
      });
      if (currentCount >= MAX_PRODUCTS_PER_ACCOUNT) {
        blocked = "limit";
        fatalMessage = `Alcanzaste el límite de ${MAX_PRODUCTS_PER_ACCOUNT} publicaciones de tu cuenta gratuita.`;
        for (let j = i; j < accepted.length; j += 1) {
          failedProducts.push({
            row: j + 1,
            name: accepted[j]?.name || "Sin título",
            reason: "Cupo de publicaciones agotado.",
          });
        }
        break;
      }

      const rowError = validateProductForSale(productData);
      if (rowError) {
        failedProducts.push({
          row: i + 1,
          name: productData?.name || "Sin título",
          reason: rowError,
        });
        continue;
      }

      try {
        const newProduct = new Product({
          ...productData,
          shipping: buildShipping(productData),
          seller: userId,
          sellerName: userProfile?.shop?.name || userProfile?.username,
          sellerIsVerified: userProfile?.isVerified || false,
          // Ubicación: la del archivo si vino, si no la del vendedor.
          location: productData?.location?.city
            ? productData.location
            : sellerLocation,
          status: "active",
        });

        const savedProduct = await newProduct.save();

        // Actualizamos el array de productos del vendedor
        await User.findByIdAndUpdate(userId, {
          $push: { products: savedProduct._id },
        });

        createdProducts.push({
          name: savedProduct.name,
          id: savedProduct._id,
        });
      } catch (err) {
        failedProducts.push({
          row: i + 1,
          name: productData?.name || "Sin título",
          reason: err.message,
        });
      }
    }

    const totalOmitted = skippedByQuota + failedProducts.filter((f) =>
      String(f.reason).includes("Cupo"),
    ).length;

    res.status(201).json({
      success: true,
      blocked: blocked || undefined,
      message: blocked
        ? fatalMessage
        : `Se importaron ${createdProducts.length} producto(s) correctamente.`,
      created: createdProducts.length,
      failed: failedProducts.length,
      skipped: totalOmitted,
      maxProducts: MAX_PRODUCTS_PER_ACCOUNT,
      currentProducts: await Product.countDocuments({
        seller: userId,
        status: { $in: COUNTED_STATUSES },
      }),
      createdProducts,
      failedProducts,
    });
  } catch (error) {
    console.error("Error en bulkImport:", error);
    res.status(500).json({
      success: false,
      message: "Error al importar productos de forma masiva.",
    });
  }
};
