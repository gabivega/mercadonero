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
    console.log("req.query: ",req.query)
    
// Configuración de ordenamiento por defecto (Del más nuevo al más viejo)
    let sortOptions = { createdAt: -1 }; 

    // --- MANEJO DE CASOS ESPECIALES DE CAROUSELS GLOBALES ---
    let isSpecialSection = false;
    let isRandom = false; // 🔥 Flag para activar el mezclado aleatorio al final

    if (category) {
      const lowerCategory = category.toLowerCase().trim();

      if (lowerCategory === 'recently-added' || lowerCategory === 'undefined') {
        sortOptions = { createdAt: -1 };
        isSpecialSection = true;

      } else if (lowerCategory === 'offers') {
        // Caso Ofertas: Filtramos usando la estructura real de tu modelo sale
        query["sale.active"] = true; 
        query["sale.price"] = { $gt: 0 }; 
        
        query.$or = [
          { "sale.expiresAt": { $exists: false } },
          { "sale.expiresAt": { $eq: null } },
          { "sale.expiresAt": { $gt: new Date() } }
        ];

        // 🔥 En lugar de ordenar por fecha, anulamos sortOptions para que Mongo traiga los primeros 50 que encuentre rápido
        sortOptions = {}; 
        isRandom = true; // 🔥 Activamos la aleatoriedad
        isSpecialSection = true;
      }
    }

    // --- 1. Construcción de la Query de Búsqueda de Texto ---
    if (search) {
      const term = search.trim().toLowerCase();

      query.$or = [
        { subCategory: { $regex: `^${term}$`, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { brand: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } }
      ];

      if (term.length > 5) {
        const root = term.substring(0, term.length - 2);
        query.$or.push({ name: { $regex: root, $options: 'i' } });
      }
    }

    // --- 2. Aplicar filtros de Categorías Comunes (Solo si NO es sección especial) ---
    if (category && !isSpecialSection) {
      const mapping = NERO_CATEGORY_MAP[category.toLowerCase()];

      if (mapping) {
        if (typeof mapping === 'object') {
          query.category = mapping.cat;
          query.subCategory = mapping.sub;
        } else {
          query.category = mapping;
        }
      } else {
        query.category = category.toLowerCase();
      }
    }

    // Si el front manda subCategory explícitamente, ésta siempre manda
    if (subCategory) {
      query.subCategory = subCategory.toLowerCase();
    }
    if (brand) query.brand = brand;

    // Filtros de precio tradicionales
    if (minPrice || maxPrice) {
      query.price = query.price || {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Lógica de ordenamiento manual del front (si el usuario usa el select de ordenar)
    if (sort) {
      if (sort === 'price_asc') sortOptions = { price: 1 };
      if (sort === 'price_desc') sortOptions = { price: -1 };
    }

   // --- 3. Ejecutar la Query con el orden dinámico ---
    // Si sortOptions está vacío (caso ofertas), no le pasamos nada al sort para no gastar recursos
    const productsQuery = Product.find(query);
    if (Object.keys(sortOptions).length > 0) {
      productsQuery.sort(sortOptions);
    }
    
    // Traemos un lote de productos (ej: 50) para luego mezclarlos
    let products = await productsQuery.limit(50);

    // 🔥 SI ES SECCIÓN DE OFERTAS, BARAJAMOS EL ARRAY (Algoritmo Fisher-Yates)
    if (isRandom && products.length > 0) {
      for (let i = products.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [products[i], products[j]] = [products[j], products[i]];
      }
    }

    // 4. EXTRAER FILTROS DISPONIBLES (Facetas) - Queda igual
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
    res.status(500).json({ message: "Error", error: error.message || error });
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

// EDITAR PRODUCTO 

export const updateProduct = async (req, res) => {
  console.log("en update product")
  try {
    const { id } = req.params;
    const updateData = req.body;

    // 1. Buscamos el producto
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Producto no encontrado." });
    }

    // 2. Control de Seguridad: ¿El que edita es el dueño de la publicación?
    // req.user._id viene de tu middleware de autenticación
    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: "No tenés permisos para editar este producto." 
      });
    }

    // 3. Actualizamos en MongoDB
    // { new: true } devuelve el producto ya modificado; runValidators aplica los checks del esquema
    const updatedProduct = await Product.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );

    res.json({ 
      success: true, 
      message: "¡Producto actualizado con éxito!", 
      product: updatedProduct 
    });

  } catch (err) {
    console.error("Error al editar producto:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};