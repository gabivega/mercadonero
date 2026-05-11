import Product from "../models/Product.js";
import User from "../models/User.js";

export const createProduct = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log("req.user:", req.user);
    const {
      name,
      price,
      currency,
      sale,
      stock,
      images,
      description,
      category,
      subCategory,
      brand,
      condition,
      shipping,
      listingType,
      specifications,
      location
    } = req.body;

    console.log("req.body", req.body);

    // 1. Obtenemos el DID que inyectó tu middleware de Privy
    // const privyDid = req.user.did;


    // 2. Buscamos al usuario en nuestra DB por su DID de Privy
    // Es vital para obtener el _id de objeto de Mongo
    // const user = await User.findOne({ privyDid: privyDid });
    // 2. Buscamos la data extendida del usuario (incluyendo location)
  // 1. Buscamos el username en la BD (Query rápido por ID)
    const userProfile = await User.findById(userId).select('username shop');
    console.log("userProfile", userProfile)
    if (!userProfile) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
  // Definimos las categorías que NO requieren marca
const categoriesWithoutBrand = ['inmuebles', 'servicios'];

// 1. Validaciones de Existencia
// Verificamos si la categoría actual requiere marca
const needsBrand = !categoriesWithoutBrand.includes(category);

if (!name || !price || !category || !description || (needsBrand && !brand)) {
  return res.status(400).json({
    success: false,
    message: needsBrand 
      ? "Todos los campos obligatorios deben estar presentes."
      : "Nombre, precio, categoría y descripción son obligatorios.",
  });
}

    // 2. Validación de Imágenes (Mínimo 1)
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "El producto debe tener al menos una imagen.",
      });
    }

    // 3. Validación de Negativos (Seguridad Crítica)
    if (Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "El precio debe ser un número mayor a cero.",
      });
    }

    if (Number(stock) < 1) {
      return res.status(400).json({
        success: false,
        message: "El stock mínimo permitido es 1 unidad.",
      });
    }

    // 4. Validación de longitud de texto
    if (name.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "El título es demasiado corto (mínimo 5 caracteres).",
      });
    }

    // --- VALIDACIONES DE LOGÍSTICA ---
    let finalShippingCost = 0;

    if (shipping.isDigital || shipping.free) {
      finalShippingCost = 0;
    } else {
      finalShippingCost = Number(shipping.cost) || 0;
    }

    let saleData = { active: false, price: 0 };
// definimos un estandar para shipping
    let finalShipping = {
  isDigital: false,
  free: false,
  cost: 0,
  dimensions: { weight: 0, height: 0, width: 0, length: 0 },
  shippingTime: "24h"
};
// Solo procesamos dimensiones si NO es un clasificado y si viene el objeto shipping
if (listingType !== 'classified' && shipping) {
  finalShipping = {
    isDigital: !!shipping.isDigital,
    free: shipping.isDigital ? false : (shipping.free || false),
    cost: Number(shipping.cost) || 0,
    dimensions: {
      weight: Number(shipping.dimensions?.weight) || 0,
      height: Number(shipping.dimensions?.height) || 0,
      width: Number(shipping.dimensions?.width) || 0,
      length: Number(shipping.dimensions?.length) || 0,
    },
    shippingTime: shipping.shippingTime || "24h",
  };
}

    // VALIDACION DE PRECIO DE OFERTA

    if (sale.price && Number(sale.price) > 0) {
      if (Number(sale.price) >= Number(price)) {
        return res.status(400).json({
          success: false,
          message: "El precio de oferta debe ser menor al precio original.",
        });
      }
      saleData = {
        active: true,
        price: Number(sale.price),
      };
    }
    //  Creación del objeto sanitizado
    // --- CONSTRUCCIÓN DEL PRODUCTO ---
    const newProduct = new Product({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      currency: currency,
      sale: saleData,
      stock: listingType === 'classified' ? 1 : Math.floor(Number(stock || 1)),
      category,
      subCategory: subCategory || "",
      condition: condition || "new",
      images,
      // Logística Centralizada
      shipping:finalShipping,
      specifications: specifications || [],
      seller: userId,
      sellerName: userProfile?.username,
      sellerIsVerified: userProfile?.isVerified || false,
      location: location,
      status: "active",
      listingType: listingType,
    });
    // Solo agregamos la propiedad brand si la categoría lo requiere
    if (!['inmuebles', 'servicios'].includes(category)) {
      newProduct.brand = brand.trim();
    }
    const savedProduct = await newProduct.save();

    // 4. Actualizamos el array de productos del vendedor
    await User.findByIdAndUpdate(userId, {
      $push: { products: savedProduct._id },
    });

    res.status(201).json({
      success: true,
      message: "¡Producto publicado con éxito!",
      product: savedProduct,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Error al crear el producto en la DB" });
  }
};

export const getMyProducts = async (req, res) => {
  try {
    // 1. El middleware nos da el did de Privy
    const privyDid = req.user.did;

    // 2. Buscamos al usuario en nuestra DB para obtener su _id interno
    // IMPORTANTE: Asegurate que en tu UserSchema el campo se llame 'privyDid'
    const user = await User.findOne({ privyDid: privyDid });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    // 3. Ahora buscamos los productos usando el ObjectId del vendedor (_id)
    // No usamos el did, usamos user._id que es el que guardamos al crear el producto
    const products = await Product.find({
      seller: user._id,
      status: { $ne: "deleted" },
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Error en getMyProducts:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al obtener tus productos" });
  }
};

export const toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    console.log("Product:", product);
    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });

    // SEGURIDAD: Comparamos directamente con el ID que inyectó attachUser
    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "No tienes permiso" });
    }

    product.status = product.status === "active" ? "paused" : "active";
    await product.save();

    res.json({ success: true, status: product.status });
  } catch (error) {
    res.status(500).json({ message: "Error al cambiar estado" });
  }
};

// ELIMINAR (Lógico o Físico)
// Sugiero borrado lógico (cambiar status a 'deleted') para no romper el historial de ventas
export const deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { status: "deleted" });
    res.json({ success: true, message: "Producto eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar" });
  }
};

const NERO_CATEGORY_MAP = {
  "vehiculos": "autos-motos-y-otros",
  "propiedades": "inmuebles",
  "inmuebles": "inmuebles",  // Direct mapping for inmuebles
  "televisores": { cat: "electronica-audio-y-video", sub: "televisores" },
  "celulares": { cat: "celulares-y-telefonos", sub: "celulares" },
  "supermercado": "alimentos-y-bebidas",
};

// OBTENER PRODUCTOS POR CATEGORIA O GENERAL
export const getProducts = async (req, res) => {
  try {
    const { search, category, subCategory, brand, minPrice, maxPrice, sort } = req.query;
    let query = { status: "active" };
    console.log("search", search)
    console.log("category", category)
    console.log("subCategory", subCategory)
    // 1. Construcción de la Query (Tu lógica de $or mejorada)
   if (search) {
      // 1. Limpiamos espacios extras y preparamos el término
      const term = search.trim().toLowerCase();

      query.$or = [
        // Match exacto en subcategoría (máxima prioridad)
        { subCategory: { $regex: `^${term}$`, $options: 'i' } },
        
        // Coincidencia parcial en NAME (Cambiado de title a name)
        { name: { $regex: term, $options: 'i' } },
        
        // Coincidencia en Marca
        { brand: { $regex: term, $options: 'i' } },
        
        // Coincidencia en Categoría
        { category: { $regex: term, $options: 'i' } }
      ];

      // OPCIONAL: Para el caso "televisor" vs "televisores"
      // Si el término es largo, podemos buscar por la "raíz" de la palabra
      if (term.length > 5) {
        const root = term.substring(0, term.length - 2); // Quita las últimas 2 letras
        query.$or.push({ name: { $regex: root, $options: 'i' } });
      }
    }

    // Aplicar filtros si vienen en la URL
  if (category) {
      const mapping = NERO_CATEGORY_MAP[category.toLowerCase()];

      if (mapping) {
        // Si el mapping es un objeto (caso televisores)
        if (typeof mapping === 'object') {
          query.category = mapping.cat;
          query.subCategory = mapping.sub;
        } else {
          // Si es un string simple (caso vehiculos)
          query.category = mapping;
        }
      } else {
        // Si no hay mapeo, confiamos en lo que viene pero normalizamos
        query.category = category.toLowerCase();
      }
    }

    // Si el front manda subCategory explícitamente, ésta siempre manda
    if (subCategory) {
      query.subCategory = subCategory.toLowerCase();
    }
    if (brand) query.brand = brand;

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // 2. Ejecutar búsqueda de productos
    const products = await Product.find(query).sort({ createdAt: -1 }).limit(50);

    // 3. EXTRAER FILTROS DISPONIBLES (Facetas)
    // Esto lo hacemos sobre los productos encontrados para que el sidebar sea dinámico
    const availableFilters = {
      categories: [...new Set(products.map(p => p.category))].filter(Boolean),
      subCategories: [...new Set(products.map(p => p.subCategory))].filter(Boolean),
      brands: [...new Set(products.map(p => p.brand))].filter(Boolean)
    };

    res.json({
      products: products || [],
      filters: availableFilters
    });

  } catch (error) {
    res.status(500).json({ message: "Error", error });
  }
};


// Obtener un producto por ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("GetproductbyId id: ", id);

    const product = await Product.findById(id).populate(
      "seller",
      "username name shop isVerified",
    ); // Traemos data del vendedor

    // Validamos que el producto exista Y que esté activo
    if (!product || product.status !== "active") {
      return res.status(404).json({ 
        message: "Esta publicación ya no está disponible o ha sido pausada." 
      });
    }

    res.json(product);
  } catch (error) {
    console.error("Error en getProductById:", error);
    res.status(500).json({ message: "Error al obtener el producto" });
  }
};
