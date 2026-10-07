import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { buildProductSlug } from "../utils/slugify.js";
import { resolveProductReferral } from "../services/referralService.js";

// Acepta un id (ObjectId) o un slug SEO. Devuelve el filtro de búsqueda
// adecuado para Mongo. Los slugs siempre contienen guiones y letras, por lo
// que se distinguen trivialmente de un ObjectId de 24 hex.
const buildProductLookup = (idOrSlug = "") => {
  const value = String(idOrSlug).trim();
  if (mongoose.Types.ObjectId.isValid(value) && value.length === 24) {
    return { _id: value };
  }
  return { slug: value };
};

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


                    sku,
          condition,
          warranty,
          shipping,
                    listingType,
          specifications,
                    location,
          socialSelling,
          referral,
          providerRef,
          payment,
        } = req.body;

    console.log("req.body", req.body);

    // 1. Obtenemos el DID que inyectó tu middleware de Privy
    // const privyDid = req.user.did;


    // 2. Buscamos al usuario en nuestra DB por su DID de Privy
    // Es vital para obtener el _id de objeto de Mongo
    // const user = await User.findOne({ privyDid: privyDid });
    // 2. Buscamos la data extendida del usuario (incluyendo location)
  // 1. Buscamos el username en la BD (Query rápido por ID)
        const userProfile = await User.findById(userId).select('username shop isVerified addresses');
    console.log("userProfile", userProfile)
    if (!userProfile) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // ── UBICACIÓN POR DEFECTO ──
    // El formulario de publicación no envía `location`, así que si llega vacío
    // tomamos la ubicación del vendedor para poder mostrar "Ciudad, Provincia"
    // (ej: "Rosario, Santa Fe") en el detalle y en las tarjetas.
    // Prioridad: lo que venga en el body → shop.location (despacho) →
    // dirección por defecto → primera dirección cargada.
    const shopLocation = userProfile?.shop?.location || {};
    const defaultAddress =
      userProfile?.addresses?.find((a) => a.isDefault) ||
      userProfile?.addresses?.[0] ||
      {};
    const finalLocation = {
      city: location?.city || shopLocation.city || defaultAddress.city || "",
      province:
        location?.province ||
        location?.state ||
        shopLocation.province ||
        defaultAddress.province ||
        "",
    };
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
  // ── MÉTODOS DE ENTREGA ──
  // homeDelivery: envío a domicilio (cotiza con Zipnova). Default true.
  // pickup: retiro en local del vendedor ($0). Default false.
  // pickupLocationIds: sucursales elegidas (solo si pickup=true).
  const deliveryInput = shipping.delivery || {};
  const pickupEnabled = deliveryInput.pickup === true;
  const pickupLocationIds = pickupEnabled && Array.isArray(deliveryInput.pickupLocationIds)
    ? deliveryInput.pickupLocationIds.filter((id) => id)
    : [];

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
    // Un producto digital no tiene métodos de entrega físicos.
    delivery: {
      homeDelivery: shipping.isDigital ? false : (deliveryInput.homeDelivery !== false),
      pickup: shipping.isDigital ? false : pickupEnabled,
      pickupLocationIds,
    },
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

    // --- SOCIAL SELLING (Compra en grupo / Pools) ---
    // Solo aplica a productos de pago (no clasificados). Es EXCLUYENTE con
    // el precio de oferta: si está habilitado, desactivamos sale.
    let socialSellingData = { enabled: false };
    const wantsSocialSelling =
      listingType !== "classified" && socialSelling?.enabled === true;

    if (wantsSocialSelling) {
      // Normalizamos los tiers: mapeamos cantidades 2..5 -> precio > 0.
      const rawTiers = socialSelling.tiers || {};
      const tiers = {};
      for (const buyers of [2, 3, 4, 5]) {
        const value = Number(rawTiers[buyers]);
        if (value > 0) tiers[buyers] = value;
      }

      // Si no completó los 4 tiers, lo tratamos como no habilitado.
      if (Object.keys(tiers).length === 4) {
        // Validación: precios decrecientes y menores al precio base.
        const prices = [tiers[2], tiers[3], tiers[4], tiers[5]];
        const isDecreasing = prices.every(
          (p, i) => i === 0 || prices[i - 1] > p,
        );

        if (!isDecreasing) {
          return res.status(400).json({
            success: false,
            message:
              "Los precios de compra en grupo deben disminuir al sumar compradores.",
          });
        }
        if (prices[0] >= Number(price)) {
          return res.status(400).json({
            success: false,
            message:
              "El precio de compra en grupo debe ser menor al precio base del producto.",
          });
        }

        socialSellingData = {
          enabled: true,
          durationHours: [24, 48, 72].includes(Number(socialSelling.durationHours))
            ? Number(socialSelling.durationHours)
            : 48,
          tiers,
        };

                // Excluyente: no puede haber oferta si hay compra en grupo.
        saleData = { active: false, price: 0 };
      }
    }

        // --- REFERIDOS (reintegros por compartir) ---
    // El vendedor ofrece un % de reintegro por producto. Solo aplica a
    // productos de pago (no clasificados). Validamos contra el tope global.
    const referralResult = await resolveProductReferral(referral, {
      listingType,
    });
    if (referralResult.error) {
      return res.status(400).json({
        success: false,
        message: referralResult.error,
      });
    }
    const referralData = {
      enabled: referralResult.enabled,
      percent: referralResult.percent,
    };

    // ── EXCLUSIÓN: Compra en Grupo ↔ Referidos ──
    // Son mecánicas mutuamente excluyentes (ambas compiten por el margen del
    // vendedor y complican el cálculo de fee/reward). El front ya lo bloquea,
    // pero acá lo validamos de nuevo (nunca confiar solo en el cliente) y
    // devolvemos un error EXPLÍCITO en vez de apagar una silenciosamente.
    if (socialSellingData.enabled && referralData.enabled) {
      return res.status(400).json({
        success: false,
        message:
          "La Compra en Grupo y el Programa de Referidos son excluyentes. Desactivá uno para continuar.",
      });
    }

    //  Creación del objeto sanitizado
    // --- CONSTRUCCIÓN DEL PRODUCTO ---
        const newProduct = new Product({
      name: name.trim(),
      description: description.trim(),
            price: Number(price),
      currency: currency,
      // SKU: código interno / de proveedor (opcional). Se prellena al importar.
      sku: (sku || "").trim(),
            category,
      subCategory: subCategory || "",
      condition: condition || "new",
      images,
      stock: Number(stock),
      // Precio de oferta (excluyente con compra en grupo; ver socialSellingData).
      sale: saleData,
      // ── SOCIAL SELLING (Compra en grupo / Pools) ──
      // Se calcula más arriba en `socialSellingData`. Sin esta asignación, el
      // flag `enabled` y los tiers se perdían al CREAR el producto (al editar
      // sí se guardaba porque updateProduct pasa el body completo).
            socialSelling: socialSellingData,
      // ── REFERIDOS (reintegros por compartir) ──
      // Se calcula más arriba en `referralData` (con tope global).
      referral: referralData,
            // Logística Centralizada
      shipping:finalShipping,
      specifications: specifications || [],
      // ── MÉTODOS DE PAGO ACEPTADOS POR EL VENDEDOR ──
      // acceptsTransfer (default true) / acceptsCrypto (default false).
      // Sin este mapeo, el flag de cripto se perdía al CREAR (en update sí
      // se guardaba porque updateProduct pasa el body completo).
      payment: {
        acceptsTransfer: payment?.acceptsTransfer !== false,
        acceptsCrypto: payment?.acceptsCrypto === true,
      },
            seller: userId,
            sellerName: userProfile?.shop?.name || userProfile?.username,
      sellerIsVerified: userProfile?.isVerified || false,
            location: finalLocation,
      status: "active",
      listingType: listingType,
    });

    // ── TRAZABILIDAD CON PROVEEDOR (Elit, etc.) ──
    // Sólo lo guardamos si viene con un provider válido (productos importados).
    if (providerRef && providerRef.provider) {
      newProduct.providerRef = {
        provider: providerRef.provider,
        id: providerRef.id ?? null,
        codigo_producto: providerRef.codigo_producto || "",
        codigo_alfa: providerRef.codigo_alfa || "",
        costPvpArs: Number(providerRef.costPvpArs) || 0,
        lastSyncAt: new Date(),
      };
      // Fuente marcada como importada de proveedor.
      newProduct.source = "provider";
      newProduct.sourceUrl = providerRef.sourceUrl || "";
    }

        // Solo agregamos la propiedad brand si la categoría lo requiere
    if (!['inmuebles', 'servicios'].includes(category)) {
      newProduct.brand = brand.trim();
    }

    // SKU: código de producto propio o del proveedor (opcional).
    if (sku && String(sku).trim()) {
      newProduct.sku = String(sku).trim();
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
    })
      .populate("seller", "username name shop isVerified")
      .sort({
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
                const { search, category, subCategory, brand, minPrice, maxPrice, sort, sellerId, page, limit } = req.query;
    let query = { status: "active" };
    console.log("req.query: ",req.query)

    // ── FILTRO POR VENDEDOR ──
    // Usado por la página de perfil ("Ver todos sus productos"): devuelve
    // solo las publicaciones activas de un vendedor determinado.
    if (sellerId) {
      query.seller = sellerId;
    }
    
// Configuración de ordenamiento por defecto (Del más nuevo al más viejo)
    let sortOptions = { createdAt: -1 }; 

    // --- MANEJO DE CASOS ESPECIALES DE CAROUSELS GLOBALES ---
    let isSpecialSection = false;
    let isRandom = false; // 🔥 Flag para activar el mezclado aleatorio al final

    if (category) {
      const lowerCategory = category.toLowerCase().trim();

            if (lowerCategory === 'recently-added' || lowerCategory === 'undefined') {
        // Recién agregados: NO mostramos productos usados. Queremos que lo
        // primero que ve el usuario sean productos nuevos. Los usados quedan
        // accesibles por búsqueda (y más adelante, carousel/página exclusiva).
        // Usamos $ne (en vez de 'new') para no excluir productos viejos con
        // `condition` vacío/ausente: sólo filtramos los explícitamente "used".
        query.condition = { $ne: 'used' };
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
      } else if (lowerCategory === 'social-selling') {
        // Caso Compra en Grupo (Social Selling): productos de pago que tienen
        // habilitada la compra grupal (tiers de precio), sin importar si hay
        // pools activos. Sección especial: NO aplica filtro de categoría.
        query["socialSelling.enabled"] = true;
        query.listingType = "product"; // los clasificados no tienen pools

        // 🔥 Igual que "ofertas": barajamos para que cada carga del carousel
        // muestre una selección distinta de productos con compra en grupo.
        // Anulamos sortOptions para que Mongo traiga rápido y no ordenemos por
        // fecha (el orden final lo define el shuffle Fisher-Yates de abajo).
        sortOptions = {};
        isRandom = true;
        isSpecialSection = true;
            } else if (lowerCategory === 'referral') {
              // Caso Programa de Referidos: productos que ofrecen reintegro por
              // compartir. Sección especial: NO aplica filtro de categoría (vista
              // transversal).
              //
              // NOTA: filtramos sólo por `referral.enabled = true`. NO exigimos
              // `percent > 0` porque hay productos viejos que quedaron con enabled
              // pero percent 0 (cuando aún no existía el input del %), y queremos
              // que igual aparezcan. `enabled` ya es la intención explícita del
              // vendedor. Tampoco forzamos `listingType` porque documentos viejos
              // podrían no tenerlo seteado explícitamente; excluimos los clasificados
              // sólo si el campo está presente.
              query["referral.enabled"] = true;
              query.listingType = { $ne: "classified" };

        sortOptions = { createdAt: -1 };
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

        // Ejecutamos la query. Populate del vendedor para traer shop.name/username
    // y poder mostrar el nombre de la tienda en las tarjetas de producto.
        let products = await productsQuery
          .populate("seller", "username name shop isVerified walletAddress")
          .exec();

        // 🔒 OCULTAR PRODUCTOS DE PAGO DE VENDEDORES SIN WALLET: el escrow/colateral
    // necesita la wallet del vendedor para gestionar los pagos de forma segura.
    // Si el vendedor no tiene wallet, su producto de pago no puede venderse.
    // (El middleware requireSellerOnboarding ya impide publicar nuevos sin
    // wallet; acá cubrimos los ya existentes). Los clasificados (listingType
    // !== "product") no usan escrow y se mantienen visibles.
    products = products.filter(
      (p) => p.listingType !== "product" || (p.seller && p.seller.walletAddress),
    );

                                // 🔥 BARAJAMOS cuando la sección es aleatoria (Ofertas / Compra en Grupo).
    // Algoritmo Fisher-Yates: dejamos una selección distinta en cada carga.
    if (isRandom && products.length > 0) {
      for (let i = products.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [products[i], products[j]] = [products[j], products[i]];
      }
    }

        // ── PAGINACIÓN (opcional) ──
        // El front puede pedir un "limit" (nº de resultados por vez) + "page".
        // Si no se pasa, devolvemos todo como antes (carousels, categorías, etc.).
        const total = products.length;
        let pageResult = products;
        let hasLimit = limit !== undefined && limit !== null && limit !== '';
        let startIndex = 0;
        if (hasLimit) {
          const pageNum = parseInt(page, 10);
          const currentPage = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
          const perPage = Math.max(1, parseInt(limit, 10));
          startIndex = (currentPage - 1) * perPage;
          pageResult = products.slice(startIndex, startIndex + perPage);
        }

        // 4. EXTRAER FILTROS DISPONIBLES (Facetas) - Queda igual
        const availableFilters = {
          categories: [...new Set(products.map(p => p.category))].filter(Boolean),
          subCategories: [...new Set(products.map(p => p.subCategory))].filter(Boolean),
          brands: [...new Set(products.map(p => p.brand))].filter(Boolean)
        };

        res.json({
          products: pageResult || [],
          total,
          hasMore: hasLimit ? startIndex + pageResult.length < total : false,
          filters: availableFilters
        });

  } catch (error) {
    res.status(500).json({ message: "Error", error: error.message || error });
  }
};

// Obtener un producto por ID o por slug SEO
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("GetproductbyId id/slug: ", id);

    // Resolvemos tanto por ObjectId (compatibilidad con links viejos)
    // como por el slug SEO (/producto/consola-gaming-rog-ally-20ky5u).
    const lookup = buildProductLookup(id);

    const product = await Product.findOne(lookup).populate(
      "seller",
      "username name shop isVerified shopName walletAddress",
    ); // Traemos data del vendedor

    // Validamos que el producto exista Y que esté activo
    if (!product || product.status !== "active") {
      return res.status(404).json({
        message: "Esta publicación ya no está disponible o ha sido pausada.",
      });
    }

    // 🔒 Un producto de pago (escrow) cuyo vendedor no tiene wallet Web3 NO
    // puede venderse: lo tratamos como no disponible para el comprador.
    if (product.listingType === "product" && !product.seller?.walletAddress) {
      return res.status(404).json({
        message: "Esta publicación no está disponible por el momento.",
      });
    }

    await Product.updateOne({ _id: product._id }, { $inc: { views: 1 } });

    // Opcional: Para que el frontend que hace la petición vea la visita actual reflejada de una,
    // le sumamos 1 manualmente al objeto en memoria antes de mandarlo.
    product.views = (product.views || 0) + 1;

    // ── UBICACIÓN FALLBACK PARA PRODUCTOS VIEJOS ──
    // Los productos publicados antes de que guardáramos la ubicación por
    // defecto pueden no tenerla. En ese caso, la completamos en la respuesta
    // con la ubicación de despacho del vendedor (shop.location) para mostrar
    // "Ciudad, Provincia" (ej: "Rosario, Santa Fe") sin migrar la base.
    if (!product.location?.city && product.seller?.shop?.location?.city) {
      product.location = {
        city: product.seller.shop.location.city,
        province: product.seller.shop.location.province || "",
      };
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
        // findByIdAndUpdate NO dispara el hook pre-save, así que:
        //   - Nunca dejamos que el cliente setee/corrompa el slug (lo quitamos).
        //   - Si cambió el nombre, lo regeneramos (mantiene SEO alineado y la
        //     unicidad vía el sufijo derivado del _id).
                delete updateData.slug;
        if (typeof updateData.name === "string" && updateData.name.trim() !== product.name) {
          updateData.slug = buildProductSlug(updateData.name.trim(), product._id);
        }

        // ── REFERIDOS (reintegros por compartir) ──
        // Si viene `referral` en el body, lo validamos/normalizamos contra el
        // tope global antes de guardar. Usamos el listingType del producto
        // existente (no confiamos en que el cliente lo mande bien).
        if (updateData.referral !== undefined) {
          const referralResult = await resolveProductReferral(updateData.referral, {
            listingType: updateData.listingType || product.listingType,
          });
          if (referralResult.error) {
            return res.status(400).json({
              success: false,
              message: referralResult.error,
            });
          }
                    updateData.referral = {
            enabled: referralResult.enabled,
            percent: referralResult.percent,
          };
        }

        // ── EXCLUSIÓN: Compra en Grupo ↔ Referidos (al EDITAR) ──
        // Comparamos el estado RESULTANTE (lo que quedaría guardado): tomamos
        // el valor nuevo si viene en el body, o el actual del producto si no.
        // Así detectamos la combinación aunque solo editen uno de los dos.
        const resultingSocialSelling =
          updateData.socialSelling !== undefined
            ? updateData.socialSelling
            : product.socialSelling;
        const resultingReferral =
          updateData.referral !== undefined
            ? updateData.referral
            : product.referral;

        if (resultingSocialSelling?.enabled && resultingReferral?.enabled) {
          return res.status(400).json({
            success: false,
            message:
              "La Compra en Grupo y el Programa de Referidos son excluyentes. Desactivá uno para continuar.",
          });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
          id,
          updateData,
          { new: true, runValidators: true },
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