import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { buildProductSlug, accentInsensitivePattern } from "../utils/slugify.js";
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
  // homeDelivery: envío a domicilio. Default true.
  // pickup: retiro en local del vendedor ($0). Default false.
  // pickupLocationIds: sucursales elegidas (solo si pickup=true).
  // homeDeliveryMode: QUIÉN gestiona el envío a domicilio:
  //   "zipnova" (default) → cotización de la plataforma.
  //   "fixed"             → precio fijo propio (shipping.cost).
  //   "arrange"           → a convenir (Fase 2).
  const deliveryInput = shipping.delivery || {};
  const pickupEnabled = deliveryInput.pickup === true;
  const pickupLocationIds = pickupEnabled && Array.isArray(deliveryInput.pickupLocationIds)
    ? deliveryInput.pickupLocationIds.filter((id) => id)
    : [];
  // Normalizamos el modo al enum permitido (nunca guardamos un valor inválido).
  const ALLOWED_DELIVERY_MODES = ["zipnova", "fixed", "arrange"];
  const homeDeliveryMode = ALLOWED_DELIVERY_MODES.includes(deliveryInput.homeDeliveryMode)
    ? deliveryInput.homeDeliveryMode
    : "zipnova";

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
      // Modo de cotización del envío a domicilio (persistirlo es CLAVE: sin
      // esto, el checkout y el detalle siempre caían a la cotización Zipnova).
      homeDeliveryMode,
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
    // El `_id` de Mongo lo inyecta `attachUser` (que resuelve por supabaseId /
    // privyDid). Es el identificador estable que guardamos en Product.seller.
    const userId = req.user._id;

    // ── PAGINACIÓN + BÚSQUEDA SERVER-SIDE ──────────────────────────────
    // Un vendedor puede tener miles de publicaciones (ej. import masivo de
    // un proveedor). Traerlas todas de una cuelga la request (payload
    // gigante + serialización). Por eso paginamos en el server:
    //   ?page=1&limit=100&search=term
    // Si `limit` no viene, mantenemos compatibilidad devolviendo TODO
    // (pero limitamos a un tope de seguridad para no colgar la API).
    const { page, limit, search } = req.query;

    const hasPagination = limit !== undefined && limit !== null && limit !== "";
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    // Tope duro: evita que un limit absurdo (o la ausencia de limit) vuelva a
    // traer 9k documentos de una. 100 por defecto, 200 como máximo.
    const perPage = hasPagination
      ? Math.min(200, Math.max(1, parseInt(limit, 10) || 100))
      : 200;

        // Filtro base: productos del vendedor no eliminados.
    // Usamos $in de los estados VÁLIDOS en vez de $ne:"deleted": es mucho más
    // selectivo para el índice { seller, status, createdAt } y evita que Mongo
    // recorra claves "abiertas" (el $ne es un rango sin borde).
    const VALID_STATUSES = ["active", "paused", "out_of_stock"];
    const query = {
      seller: userId,
      status: { $in: VALID_STATUSES },
    };

            // Búsqueda por nombre / categoría / marca / SKU (case-insensitive).
    // Escapamos el término para que un regex malicioso no rompa la query.
    const term = String(search || "").trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      query.$or = [
        { name: rx },
        { category: rx },
        { subCategory: rx },
        { brand: rx },
        { sku: rx },
      ];
    }

        // Proyección LIGERA: el listado del panel NO necesita description ni
    // specs (son los campos más pesados). Traerlos multiplica el payload x N.
    // Excluimos description y specifications para que pese mucho menos.
    const projection = "-description -specifications";

    // NOTA: NO hacemos populate del seller. El panel muestra solo datos del
    // propio producto (el dueño es el usuario logueado). El populate costaba
    // ~800ms para 100 filas — innecesario acá. Si algún día se necesita, se
    // puede agregar un populate PUNTUAL sin afectar el listing.
    const [products, total] = await Promise.all([
      Product.find(query, projection)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage)
        .lean(),
      Product.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / perPage) || 1;

    res.status(200).json({
      success: true,
      count: products.length, // cuántos vienen en ESTA página
      total, // cuántos hay en total (con el filtro aplicado)
      page: pageNum,
      limit: perPage,
      totalPages,
      hasMore: pageNum < totalPages,
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
    // ── VISIBILIDAD PÚBLICA ──
    // Un producto se muestra solo si está ACTIVO (ciclo de venta) Y APROBADO
    // por el admin (moderación). El catálogo público NUNCA expone productos
    // pending/rejected. Los productos existentes sin campo `moderation` NO se
    // muestran (decisión deliberada: el catálogo arranca limpio desde 0).
    let query = { status: "active", "moderation.status": "approved" };
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
            // Búsqueda ACCENT-INSENSITIVE: el patrón de cada término tolera acentos,
            // así "bujia" matchea "Bujía", "BUJIA", "Bujia", etc. Funciona directo
            // sobre los campos crudos, sin campos extra ni migraciones.
            if (search) {
              const term = search.trim().toLowerCase();

              if (term) {
                const rx = accentInsensitivePattern(term);

                query.$or = [
                  { subCategory: { $regex: `^${rx}$`, $options: 'i' } },
                  { name: { $regex: rx, $options: 'i' } },
                  { brand: { $regex: rx, $options: 'i' } },
                  { category: { $regex: rx, $options: 'i' } }
                ];

                if (term.length > 5) {
                  const root = accentInsensitivePattern(term.substring(0, term.length - 2));
                  query.$or.push({ name: { $regex: root, $options: 'i' } });
                }
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
    // ── PAGINACIÓN SERVER-SIDE ──────────────────────────────────────────
    // ANTES traíamos TODOS los documentos que matcheaban + populate y recién
    // al final recortábamos en memoria (`products.slice`). Con el catálogo
    // actual (~9.700 productos) y la sección "recently-added", eso tardaba
    // ~160s → la request quedaba colgada y el carrusel no cargaba nunca.
    //
    // AHORA paginamos EN LA BASE DE DATOS:
    //   - Secciones NORMALES con `limit`  → skip/limit/sort en Mongo + count.
    //   - Secciones ALEATORIAS (ofertas, social-selling) → no se puede paginar
    //     por fecha; pedimos un POOL acotado y barajamos en memoria.
    //   - Sin `limit` (carousels/categorías) → tope de seguridad para no colgar.
        const hasLimit = limit !== undefined && limit !== null && limit !== '';
    const perPage = hasLimit ? Math.max(1, parseInt(limit, 10) || 20) : 0;
    const parsedPage = parseInt(page, 10);
    const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const startIndex = hasLimit ? (currentPage - 1) * perPage : 0;
    // Tope de seguridad para NO colgar la API con catálogos gigantes:
    //   - Con `limit`  → devolvemos solo la página pedida (perPage).
    //   - Sin `limit`  → listados "completos" (CategoryResults, etc.). Estos
    //     pueden superar 9k productos en una sola categoría, así que:
    //       · si el total es chico (≤ 300) devolvemos TODO (comportamiento
    //         legacy intacto para categorías normales).
    //       · si es grande, devolvemos hasta 300 + `hasMore: true` para que el
    //         front sepa que debe paginar (evita el timeout de 160s de antes).
    const HARD_CAP_NO_LIMIT = 300;
    const cap = hasLimit ? perPage : HARD_CAP_NO_LIMIT;
    // Sin limit no necesitamos los campos pesados ni el populate cargado.
    const lightProjection = hasLimit ? {} : { description: 0, specifications: 0 };

        const buildBaseQuery = () => {
      const q = Product.find(query, lightProjection);
      if (Object.keys(sortOptions).length > 0) q.sort(sortOptions);
      return q;
    };

    let products;
    let total;

    if (isRandom) {
      // Aleatorio: no hay orden estable para paginar. Traemos un pool acotado
      // (cap * 5, máx 200) para tener variedad al barajar, y paginamos sobre
      // ese pool. No es paginación "Real" pero estas secciones son carousels
      // cortos, no listados navegables.
      const poolSize = Math.min(200, cap * 5);
      const pool = await buildBaseQuery().limit(poolSize).lean();
      // 🔥 Fisher-Yates sobre el pool.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      // Populate manual del seller solo de los elegidos (barato).
      products = await Product.populate(pool, {
        path: 'seller',
        select: 'username name shop isVerified walletAddress',
      });
        } else {
      // Orden estable: paginamos en Mongo. Traemos SOLO la página + total.
      // Siempre calculamos el total (barato con índice) para saber si hay más
      // allá del cap de seguridad, incluso cuando no vino `limit`.
      const [pageDocs, count] = await Promise.all([
        buildBaseQuery().skip(startIndex).limit(cap).lean(),
        Product.countDocuments(query),
      ]);
      products = await Product.populate(pageDocs, {
        path: 'seller',
        select: 'username name shop isVerified walletAddress',
      });
      total = count;
    }

    // 🔒 OCULTAR PRODUCTOS DE PAGO DE VENDEDORES SIN WALLET: el escrow/colateral
    // necesita la wallet del vendedor. Los clasificados no usan escrow.
    products = products.filter(
      (p) => p.listingType !== "product" || (p.seller && p.seller.walletAddress),
    );

    // ── Facetas ──
    // Sin `limit` (listados con filtros) calculamos las facetas reales con
    // distinct (barato, no trae documentos). Con `limit` (carousels) las
    // facetas no se usan; devolvemos las de la página para no escanear todo.
    let availableFilters;
    if (!hasLimit && !isRandom) {
      const [cats, subs, brands] = await Promise.all([
        Product.distinct('category', query),
        Product.distinct('subCategory', query),
        Product.distinct('brand', query),
      ]);
      availableFilters = {
        categories: cats.filter(Boolean),
        subCategories: subs.filter(Boolean),
        brands: brands.filter(Boolean),
      };
    } else {
      availableFilters = {
        categories: [...new Set(products.map(p => p.category))].filter(Boolean),
        subCategories: [...new Set(products.map(p => p.subCategory))].filter(Boolean),
        brands: [...new Set(products.map(p => p.brand))].filter(Boolean),
      };
    }

        // `total` real (count de la DB). `hasMore`: hay más por debajo del cap.
    const totalForResponse = total != null ? total : products.length;
    const hasMore = startIndex + products.length < totalForResponse;

    res.json({
      products: products || [],
      total: totalForResponse,
      hasMore,
      filters: availableFilters,
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

        // Validamos que el producto exista, esté activo Y aprobado por moderación.
    // Un producto pending/rejected no es visible al público (mismo mensaje
    // genérico para no filtrar el motivo de moderación).
    if (
      !product ||
      product.status !== "active" ||
      product.moderation?.status !== "approved"
    ) {
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

        // ── NORMALIZACIÓN DEL MODO DE ENVÍO A DOMICILIO (AL EDITAR) ──
        // El modo (`homeDeliveryMode`) define QUIÉN gestiona el envío a
        // domicilio. Como el checkout y el detalle dependen de este campo para
        // decidir entre cotizar con Zipnova o usar un precio fijo, lo
        // normalizamos al enum permitido (y a "zipnova" si llega vacío/ inválido)
        // para que NUNCA quede un valor ausente que arrastre un default
        // inesperado. Solo tocamos `delivery` si el cliente mandó `shipping`.
        if (updateData.shipping && typeof updateData.shipping === "object") {
          const ALLOWED_DELIVERY_MODES = ["zipnova", "fixed", "arrange"];
          const deliveryInput = updateData.shipping.delivery || {};
          const homeDeliveryMode = ALLOWED_DELIVERY_MODES.includes(
            deliveryInput.homeDeliveryMode,
          )
            ? deliveryInput.homeDeliveryMode
            : "zipnova";
          updateData.shipping.delivery = {
            ...deliveryInput,
            homeDeliveryMode,
          };
        }

                // ── RE-ABRIR REVISIÓN AL EDITAR ──
        // Si el producto ya estaba APROBADO y el vendedor lo edita, vuelve a
        // "pending": la aprobación previa deja de ser válida porque el
        // contenido cambió. Así la aprobación del admin significa algo real
        // (se revisó ESTA versión) y se evita aprobar algo y luego verlo
        // modificado. Si estaba rejected/pending, se mantiene el flujo normal.
        // NO permitimos que el cliente setee/override de la moderación.
        delete updateData.moderation;
        if (product.moderation?.status === "approved") {
          updateData["moderation.status"] = "pending";
          updateData["moderation.reason"] = "";
          updateData["moderation.reviewedBy"] = null;
          updateData["moderation.reviewedAt"] = null;
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