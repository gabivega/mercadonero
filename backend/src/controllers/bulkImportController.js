import Product from "../models/Product.js";
import User from "../models/User.js";
import allCategories from "../categoriesWithSlugs.js";

// Índice rápido de categorías válidas de la plataforma: slug -> Set de slugs de subcategorías
const categoryMap = new Map();
allCategories.forEach((cat) => {
  categoryMap.set(cat.slug, new Set((cat.subcategories || []).map((s) => s.slug)));
});

const categoriesWithoutBrand = ["inmuebles", "servicios"];

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
  const shippingTime = normalizeShippingTime(get("tiempo_despacho") || get("shipping_time") || get("TIEMPO_DESPACHO"));
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

/**
 * POST /api/product/bulk-import
 * Carga masiva de productos desde Excel/CSV.
 * El body espera: { products: [...], rowErrors: [...] }
 * donde cada producto ya vino mapeado y validado desde el frontend.
 */
export const bulkImport = async (req, res) => {
  try {
    const userId = req.user._id;


    const userProfile = await User.findById(userId).select("username shop isVerified");
    if (!userProfile) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay productos válidos para importar.",
      });
    }

    const createdProducts = [];
    const failedProducts = [];

    for (const productData of products) {
      try {
        const newProduct = new Product({
          ...productData,
          seller: userId,
          sellerName: userProfile?.shop?.name || userProfile?.username,
          sellerIsVerified: userProfile?.isVerified || false,
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
          name: productData?.name || "Sin título",
          reason: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Se importaron ${createdProducts.length} producto(s) correctamente.`,
      created: createdProducts.length,
      failed: failedProducts.length,
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
