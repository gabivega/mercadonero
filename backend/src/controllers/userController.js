import User from "../models/User.js";
import Product from "../models/Product.js";

// -- VALIDACION DE TELEFONO (defensa en profundidad) --
// El front sanitiza el input, pero la API puede llamarse directo. Replicamos la
// regla E.164 del validador del frontend (crossmintWallet.normalizePhone):
// tolera espacios/guiones/parentesis, exige prefijo + con codigo de pais.
// Devuelve { ok, value, error }. `value` normalizado (sin separadores).
function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "Ingresa tu numero de telefono." };
  const cleaned = raw.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return {
      ok: false,
      error: "Ingresa el numero con codigo de pais y prefijo +. Ej: +5491123456789.",
    };
  }
  return { ok: true, value: cleaned };
}

// ────────────────────────────────────────────────────────────────────────
// ONBOARDING VENDEDOR (WAITING LIST)
// ────────────────────────────────────────────────────────────────────────
// En esta etapa la venta esta limitada a tiendas invitadas. El onboarding
// solo recopila datos basicos del usuario y de la tienda: NO pide datos
// bancarios (esos se administran desde el perfil, BankAccountSection). Al
// completarlo, la tienda queda en LISTA DE ESPERA (shop.active=true +
// shop.approved=false) hasta que un admin la habilite.
// ────────────────────────────────────────────────────────────────────────
export const completeSellerOnboarding = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      shopName,
      shopDescription,
      city,
      province,
      zipCode,
      taxCondition,
      firstName,
      lastName,
      dni,
      phone,
    } = req.body || {};

            // ── WAITING LIST ──────────────────────────────────────────────────────
    // En esta etapa las publicaciones estan limitadas a tiendas invitadas.
    // El onboarding YA NO pide datos bancarios: solo datos basicos del usuario
    // y de la tienda. Al completarlo la tienda queda en LISTA DE ESPERA
    // (shop.active=true + shop.approved=false) hasta que un admin la habilite.
    // La cuenta bancaria se administra aparte desde el perfil (BankAccountSection).
    const required = { shopName, city, province };
    const missing = Object.entries(required).find(([, v]) => !v || !String(v).trim());
    if (missing) {
      const [field] = missing;
      const labels = {
        shopName: "el nombre de la tienda",
        city: "la ciudad",
        province: "la provincia",
      };
      return res.status(400).json({ success: false, field, message: `Completa ${labels[field] || field} para continuar.` });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    const updates = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (dni) updates.dni = dni;
    if (phone) {
      const vPhone = normalizePhone(phone);
      if (!vPhone.ok) {
        return res.status(400).json({ success: false, field: "phone", message: vPhone.error });
      }
      updates.phone = vPhone.value;
    }
    if (firstName && lastName && dni && phone) updates.profileCompleted = true;

                updates["shop.active"] = true;
    updates["shop.name"] = shopName.trim();
    if (shopDescription) updates["shop.description"] = shopDescription.trim();
    updates["shop.location"] = { city, province };
    if (zipCode) updates["shop.location"].zipCode = zipCode.trim();
    if (taxCondition && ["Monotributista", "Responsable Inscripto", "Exento", "Consumidor Final"].includes(taxCondition)) {
      updates["shop.taxCondition"] = taxCondition;
    }
    // La tienda queda PENDIENTE de aprobacion (waiting list). Asegura que un
    // re-onboarding no deje approved=true si antes estaba aprobada pero se
    // volvio a mandar (por seguridad forzamos false hasta revision del admin).
    updates["shop.approved"] = false;
    updates.isSeller = true;

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true });

    res.status(200).json({
      success: true,
      // El onboarding quedo completo y la tienda entro en LISTA DE ESPERA.
      message:
        "Listo. Seras notificado cuando estes habilitado para vender en Mercado Nero.",
      user: updatedUser,
      shopActive: true,
      shopApproved: false,
      pendingApproval: true,
    });
  } catch (error) {
    console.error("Error en completeSellerOnboarding:", error);
    res.status(500).json({ success: false, message: "Error al completar el onboarding de vendedor." });
  }
};

// ────────────────────────────────────────────────────────────────────────
// ESTADO DE ONBOARDING VENDEDOR
// ────────────────────────────────────────────────────────────────────────
export const getSellerOnboardingStatus = async (req, res) => {
  try {
        const userId = req.user._id;
    const user = await User.findById(userId).select(
      "shop.active shop.approved shop.approvalReason shop.name firstName lastName dni phone shop.taxCondition",
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    const shopActive = Boolean(user.shop?.active);
    const shopApproved = Boolean(user.shop?.approved);
    const hasBasicData = Boolean(user.firstName && user.lastName && user.dni && user.phone);

    res.status(200).json({
      success: true,
      // `onboardingComplete` = completó los datos. Para poder publicar además
      // necesita `shopApproved` (aprobación manual del admin).
      onboardingComplete: shopActive,
      shopApproved,
      pendingApproval: shopActive && !shopApproved,
      approvalReason: user.shop?.approvalReason || "",
      prefill: {
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        dni: user.dni || "",
        phone: user.phone || "",
        shopName: user.shop?.name || "",
        taxCondition: user.shop?.taxCondition || "",
      },
            basicDataComplete: hasBasicData,
    });
  } catch (error) {
    console.error("Error en getSellerOnboardingStatus:", error);
    res.status(500).json({ success: false, message: "Error al obtener el estado de onboarding." });
  }
};

// ────────────────────────────────────────────────────────────────────────
// ACTUALIZACIÓN DE TIENDA (modo "editar tienda")
// ────────────────────────────────────────────────────────────────────────
// Actualiza SOLO los datos de la tienda y los datos básicos de usuario.
// A diferencia de completeSellerOnboarding, NUNCA toca las cuentas
// bancarias (shop.bankAccounts), que se administran exclusivamente desde
// el perfil (BankAccountSection). Esto evita duplicar o pisar la cuenta.
// ────────────────────────────────────────────────────────────────────────
export const updateShop = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      firstName,
      lastName,
      dni,
      phone,
      shopName,
      shopDescription,
      city,
      province,
      zipCode,
    } = req.body || {};

    if (!shopName || !String(shopName).trim()) {
      return res.status(400).json({ success: false, field: "shopName", message: "El nombre de la tienda es obligatorio." });
    }
    if (!city || !String(city).trim()) {
      return res.status(400).json({ success: false, field: "city", message: "La ciudad es obligatoria." });
    }
    if (!province || !String(province).trim()) {
      return res.status(400).json({ success: false, field: "province", message: "La provincia es obligatoria." });
    }

    const updates = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (dni) updates.dni = dni;
    if (phone) {
      const vPhone = normalizePhone(phone);
      if (!vPhone.ok) {
        return res.status(400).json({ success: false, field: "phone", message: vPhone.error });
      }
      updates.phone = vPhone.value;
    }
    if (firstName && lastName && dni && phone) updates.profileCompleted = true;

    updates["shop.name"] = shopName.trim();
    if (shopDescription) updates["shop.description"] = shopDescription.trim();
    updates["shop.location"] = { city, province };
    if (zipCode) updates["shop.location"].zipCode = zipCode.trim();

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true });

    res.status(200).json({
      success: true,
      message: "¡Tienda actualizada!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error en updateShop:", error);
    res.status(500).json({ success: false, message: "Error al actualizar la tienda." });
  }
};

/**
 * Formatea un contador al estilo "+10", "+50", "+100", etc.
 * Evita exponer números exactos en perfiles públicos.
 */
const approximateCount = (n = 0) => {
  const value = Number(n) || 0;
  if (value >= 1000) return `${Math.floor(value / 1000)}k+`;
  if (value >= 100) return `${Math.floor(value / 100) * 100}+`;
  if (value >= 10) return `${Math.floor(value / 10) * 10}+`;
  if (value > 0) return `${value}+`;
  return "0";
};

/**
 * PERFIL PÚBLICO DE USUARIO (comprador o vendedor).
 * Expone únicamente datos NO sensibles: avatar, username, nombre de
 * presentación, verificado, antigüedad, ubicación aproximada (provincia)
 * y métricas agregadas (ventas, compras, cancelaciones, expiradas).
 * Nunca devuelve DNI, teléfono, email, direcciones completas ni datos
 * bancarios.
 */
export const getPublicUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

        const user = await User.findById(userId)
            .select(
        "firstName lastName username name avatar isVerified shop rating createdAt addresses accounting accountStatus",
      )
      .lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }

    // Ocultamos el perfil público si la cuenta NO está activa (suspendida/
    // desactivada/eliminada). Mismo mensaje genérico para no filtrar el motivo.
    if ((user.accountStatus || "active") !== "active") {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }

    // Primera dirección (la default si existe) para inferir la provincia.
    const defaultAddr =
      user.addresses?.find((a) => a.isDefault) || user.addresses?.[0];
    const province = defaultAddr?.province || user.shop?.location?.province || null;

        const products = await Product.find({
      seller: user._id,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .select(
        "_id name price currency sale images listingType condition category rating sold sellerName seller shipping location specifications createdAt",
      )
      .lean();

    // Métricas agregadas (redondeadas para el perfil público).
    const metrics = {
      salesCompleted: approximateCount(
        user.shop?.totalSalesCount ?? user.accounting?.completedSales,
      ),
      purchasesCompleted: approximateCount(
        user.accounting?.completedPurchases,
      ),
      cancelledOrders: approximateCount(
        user.accounting?.cancellationsAsBuyer,
      ),
      expiredOrders: approximateCount(user.accounting?.expiredOrdersAsBuyer),
      rating: user.shop?.rating || user.rating || 0,
    };

    res.status(200).json({
      success: true,
      user: {
                _id: user._id,
        username: user.username,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        name: user.name,
        avatar: user.avatar,
        isVerified: user.isVerified || false,
        memberSince: user.createdAt,
        province,
        shop: {
          name: user.shop?.name,
          rating: user.shop?.rating || 0,
        },
      },
      metrics,
      products,
      totalProducts: await Product.countDocuments({
        seller: user._id,
        status: "active",
      }),
    });
  } catch (error) {
    console.error("Error en getPublicUserProfile:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBankAccounts = async (req, res) => {
  try {
    const { sellerId } = req.params;

        // Traemos tanto las cuentas de la raíz (fuente de verdad única: perfil,
    // gestionado por BankAccountSection para compradores Y vendedores) como
    // las del shop (solo como fallback de migración para vendedores antiguos).
    const seller = await User.findById(sellerId).select(
      "bankAccounts shop.bankAccounts",
    );

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Vendedor no encontrado",
      });
    }

    // 1) PRIORIDAD (fuente de verdad): user.bankAccounts.
    let rawAccount =
      seller.bankAccounts?.find((acc) => acc.isDefault) ||
      seller.bankAccounts?.[0];

    // 2) Fallback SOLO de migración: vendedores que cargaron la cuenta en el
    //    antiguo shop.bankAccounts. Se normalizan los campos (cbu→cbuCvu,
    //    cuit→cuitCuil). A futuro, cuando no queden cuentas en shop, esto se
    //    puede eliminar.
    if (!rawAccount) {
      rawAccount =
        seller.shop?.bankAccounts?.find((acc) => acc.isDefault) ||
        seller.shop?.bankAccounts?.[0];
    }

    if (!rawAccount) {
      return res.status(404).json({
        success: false,
        message: "El vendedor no tiene cuentas bancarias configuradas",
      });
    }

    // Normalizamos los nombres de campo al formato que espera el frontend
    // (PaymentAction / Checkout): holderName, cbuCvu, cuitCuil, alias, bankName.
    const bankAccount = {
      bankName: rawAccount.bankName || "",
      holderName: rawAccount.holderName || "",
      // user.bankAccounts usa `cbuCvu`; el viejo shop usaba `cbu`.
      cbuCvu: rawAccount.cbuCvu || rawAccount.cbu || "",
      cuitCuil: rawAccount.cuitCuil || rawAccount.cuit || "",
      alias: rawAccount.alias || "",
      accountType: rawAccount.accountType || "",
      isDefault: rawAccount.isDefault ?? false,
    };

    res.json({
      success: true,
      bankAccount,
    });
  } catch (error) {
    console.error("Error al obtener cuentas bancarias:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener cuentas bancarias",
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
        const { username, firstName, lastName, avatar, dni, phone, addresses, bankAccounts, bio } = req.body;
    console.log("updateProfile: ", req.body);
    const userId = req.user._id;

    // 1. Si el usuario quiere cambiar el username, validamos que esté disponible
    if (username && username !== req.user.username) {
      const existingUser = await User.findOne({
        username: { $regex: new RegExp(`^${username}$`, "i") }, // Case insensitive
        _id: { $ne: userId },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "El nombre de usuario ya está siendo usado por otro Nero.",
        });
      }
    }

                // 2. Si completó los datos básicos obligatorios de compra, marcamos el
    // onboarding de perfil como completado (desbloquea el checkout).
    const profileCompleted =
      Boolean(firstName && lastName && dni && phone);

    // 3. Construimos el $set de forma dinámica para NO pisar campos que el
    //    cliente no envió (direcciones / cuentas bancarias se gestionan aparte,
    //    entonces si vienen undefined no debemos borrarlas de la DB).
        const updates = {
      firstName,
      lastName,
      dni,
      phone,
      avatar,
      profileCompleted,
    };

    // Bio: solo actualizar si viene definida (evita pisar por undefined)
    if (bio !== undefined) updates.bio = bio;

    // Solo si vienen explícitamente definidos actualizamos username
    if (typeof username === "string" && username.trim() !== "") {
      updates.username = username.toLowerCase();
    }

    // Direcciones y cuentas bancarias: se actualizan SOLO si se envían,
    // para no pisar los flujos separados de AddressSection/BankAccountSection.
    if (addresses !== undefined) updates.addresses = addresses;
    if (bankAccounts !== undefined) updates.bankAccounts = bankAccounts;

    // 4. Actualización atómica
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error en updateProfile:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al actualizar el perfil." });
  }
};

export const getUserProfile = async (req, res) => {
  try {
        const userId = req.user._id;
    const user = await User.findById(userId).select(
      "username email phone firstName lastName isVerified avatar dni rating reviews addresses bankAccounts bio",
    );
    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });
    res.status(200).json(user);
  } catch (error) {
    console.error("Error en getUserProfile:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al obtener el perfil." });
  }
};

// ────────────────────────────────────────────────────────────────────────
// FAVORITOS (lista de productos guardados)
// Se guardan como ids (ref Product) en User.favorites.
// Los tres endpoints requieren usuario autenticado (req.user._id viene de
// attachUser).
// ────────────────────────────────────────────────────────────────────────

// GET /api/user/favorites → devuelve los productos guardados (poblados con
// el vendedor) para poder renderizar las ProductCard en la página.
export const getFavorites = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("favorites").lean();
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });

    const products = await Product.find({
      _id: { $in: user.favorites || [] },
      status: { $ne: "deleted" },
    })
      .populate("seller", "username name shop isVerified")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, favorites: products });
  } catch (error) {
    console.error("Error en getFavorites:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al obtener favoritos." });
  }
};

// POST /api/user/favorites/:productId → agrega un producto a favoritos (idempotente)
export const addFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const product = await Product.findById(productId).select("_id name status");
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Producto no encontrado." });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { favorites: productId } },
      { new: true },
    ).select("favorites");

    res.status(200).json({
      success: true,
      message: "Agregado a favoritos.",
      favorites: user.favorites,
    });
  } catch (error) {
    console.error("Error en addFavorite:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al agregar a favoritos." });
  }
};

// DELETE /api/user/favorites/:productId → quita un producto de favoritos
export const removeFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { favorites: productId } },
      { new: true },
    ).select("favorites");

    res.status(200).json({
      success: true,
      message: "Eliminado de favoritos.",
      favorites: user.favorites,
    });
  } catch (error) {
    console.error("Error en removeFavorite:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al quitar de favoritos." });
  }
};

const updateAddresses = async (req, res) => {
  try {
    const { addresses } = req.body;
    const userId = req.user._id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          addresses,
        },
      },
      { new: true, runValidators: true },
    );
    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error en updateAddresses:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error al actualizar las direcciones.",
      });
  }
};

// controllers/addressController.js

export const newAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const newAddress = req.body; // El objeto que manda el form
    const user = await User.findById(userId);
console.log("endpoint newAddress called with:", newAddress);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    // 2. VALIDACIÓN DE LÍMITE (El Escudo)
    if (user.addresses.length >= 3) {
      return res.status(400).json({
        success: false,
        message:
          "Límite de direcciones alcanzado (Máximo 3). Por favor, elimina una antes de agregar otra.",
      });
    }

    // Si la nueva dirección es 'isDefault', quitamos el default a las demás
    if (newAddress.isDefault) {
      await User.updateOne(
        { _id: userId },
        { $set: { "addresses.$[].isDefault": false } },
      );
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { addresses: newAddress } },
      { new: true, runValidators: true },
    );
    res.status(201).json({
      success: true,
      addresses: updatedUser.addresses,
      message: "Dirección agregada con éxito",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error al agregar dirección" });
  }
};

// delete address
// controllers/addressController.js

export const deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId } = req.params;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { addresses: { _id: addressId } } },
      { new: true },
    ).select("-privyDid");

    res.status(200).json({
      success: true,
      addresses: updatedUser.addresses,
      message: "Dirección eliminada correctamente",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error al eliminar la dirección" });
  }
};

// ────────────────────────────────────────────────────────────────────────
// PUNTOS DE RETIRO DEL VENDEDOR (shop.pickupLocations)
// Sucursales/locales donde el comprador puede retirar SIN COSTO.
// Requieren ser vendedor (shop.active). Sin límite por ahora.
// ────────────────────────────────────────────────────────────────────────

// Lista los puntos de retiro del PROPIO vendedor (para el panel).
export const getPickupLocations = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select("shop.pickupLocations");
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }
    res.status(200).json({
      success: true,
      pickupLocations: user.shop?.pickupLocations || [],
    });
  } catch (error) {
    console.error("Error en getPickupLocations:", error);
    res.status(500).json({ success: false, message: "Error al obtener los puntos de retiro." });
  }
};

// Crea un punto de retiro para el vendedor logueado.
export const createPickupLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }
    if (!user.shop?.active) {
      return res.status(403).json({ success: false, message: "Necesitás una tienda activa para configurar puntos de retiro." });
    }

    const {
      name, street, streetNumber, city, state, zipcode,
      floor, apartment, betweenStreets, references, hours, notes, isDefault,
    } = req.body || {};

    // Validación mínima: nombre + ubicación.
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, field: "name", message: "El nombre del punto es obligatorio." });
    }
    if (!city || !String(city).trim()) {
      return res.status(400).json({ success: false, field: "city", message: "La ciudad es obligatoria." });
    }
    if (!state || !String(state).trim()) {
      return res.status(400).json({ success: false, field: "state", message: "La provincia es obligatoria." });
    }

    const newLocation = {
      name: String(name).trim(),
      street: street || "",
      streetNumber: streetNumber || "",
      city: String(city).trim(),
      state: String(state).trim(),
      zipcode: zipcode || "",
      floor: floor || "",
      apartment: apartment || "",
      betweenStreets: betweenStreets || "",
      references: references || "",
      hours: hours || "",
      notes: notes || "",
      isDefault: Boolean(isDefault),
      active: true,
    };

    // Si es el default, o es el primer punto, lo marcamos como default y
    // quitamos el flag de los demás.
    const isFirst = (user.shop?.pickupLocations?.length || 0) === 0;
    if (newLocation.isDefault || isFirst) {
      newLocation.isDefault = true;
      await User.updateOne(
        { _id: userId },
        { $set: { "shop.pickupLocations.$[].isDefault": false } },
      );
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { "shop.pickupLocations": newLocation } },
      { new: true, runValidators: true },
    ).select("shop.pickupLocations");

    res.status(201).json({
      success: true,
      pickupLocations: updatedUser.shop.pickupLocations,
      message: "Punto de retiro agregado.",
    });
  } catch (error) {
    console.error("Error en createPickupLocation:", error);
    res.status(500).json({ success: false, message: "Error al crear el punto de retiro." });
  }
};

// Actualiza un punto de retiro existente.
export const updatePickupLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { locationId } = req.params;
    const fields = req.body || {};

    // Campos permitidos (whitelist) para evitar inyección de propiedades.
    const allowed = [
      "name", "street", "streetNumber", "city", "state", "zipcode",
      "floor", "apartment", "betweenStreets", "references", "hours",
      "notes", "isDefault", "active",
    ];
    const updates = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) updates[`shop.pickupLocations.$.${key}`] = fields[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No enviaste campos para actualizar." });
    }

    // Si lo marcan como default, quitamos el default de los demás.
    if (fields.isDefault === true) {
      await User.updateOne(
        { _id: userId },
        { $set: { "shop.pickupLocations.$[].isDefault": false } },
      );
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "shop.pickupLocations._id": locationId },
      { $set: updates },
      { new: true, runValidators: true },
    ).select("shop.pickupLocations");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Punto de retiro no encontrado." });
    }

    res.status(200).json({
      success: true,
      pickupLocations: updatedUser.shop.pickupLocations,
      message: "Punto de retiro actualizado.",
    });
  } catch (error) {
    console.error("Error en updatePickupLocation:", error);
    res.status(500).json({ success: false, message: "Error al actualizar el punto de retiro." });
  }
};

// Elimina un punto de retiro.
export const deletePickupLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { locationId } = req.params;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { "shop.pickupLocations": { _id: locationId } } },
      { new: true },
    ).select("shop.pickupLocations");

    res.status(200).json({
      success: true,
      pickupLocations: updatedUser?.shop?.pickupLocations || [],
      message: "Punto de retiro eliminado.",
    });
  } catch (error) {
    console.error("Error en deletePickupLocation:", error);
    res.status(500).json({ success: false, message: "Error al eliminar el punto de retiro." });
  }
};

// Público: devuelve los puntos de retiro ACTIVOS de un vendedor (para el
// comprador en el detalle del producto / checkout). No requiere ser el dueño.
export const getSellerPickupLocations = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const user = await User.findById(sellerId).select("shop.pickupLocations shop.name");
    if (!user) {
      return res.status(404).json({ success: false, message: "Vendedor no encontrado." });
    }
    const active = (user.shop?.pickupLocations || []).filter((p) => p.active !== false);
    res.status(200).json({
      success: true,
      shopName: user.shop?.name || "",
      pickupLocations: active,
    });
    } catch (error) {
    console.error("Error en getSellerPickupLocations:", error);
    res.status(500).json({ success: false, message: "Error al obtener los puntos de retiro." });
  }
};

// ────────────────────────────────────────────────────────────────────────
// WALLET WEB3 (Crossmint)
// ────────────────────────────────────────────────────────────────────────
// Persiste la dirección de la wallet EVM creada con Crossmint en el frontend.
// El frontend es quien crea la wallet (Crossmint exige el JWT del usuario como
// owner) y luego nos pasa la address para asociarla a la cuenta.
//
// Reglas:
//   - Una sola wallet EVM por usuario (campo User.walletAddress, único).
//   - Idempotente: si el usuario ya tiene wallet, devolvemos la existente.
//   - Validamos el formato de la dirección EVM (0x + 40 hex).
// ────────────────────────────────────────────────────────────────────────
export const saveWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address } = req.body || {};

    // 1. Validación de formato EVM (0x seguido de 40 caracteres hexadecimales).
    const clean = String(address || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(clean)) {
      return res
        .status(400)
        .json({ success: false, message: "Dirección de wallet inválida." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }

    // 2. Idempotencia: si ya tiene wallet, devolvemos la existente sin tocar nada.
    if (user.walletAddress) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        walletAddress: user.walletAddress,
        message: "El usuario ya tiene una wallet asociada.",
      });
    }

    // 3. La address es única en el índice: si otra cuenta ya la tiene, avisamos.
    const taken = await User.findOne({ walletAddress: clean }).select("_id");
    if (taken && String(taken._id) !== String(userId)) {
      return res.status(409).json({
        success: false,
        message: "Esa wallet ya está asociada a otra cuenta.",
      });
    }

    user.walletAddress = clean;
    await user.save();

    res.status(200).json({
      success: true,
      walletAddress: user.walletAddress,
      message: "Wallet asociada correctamente.",
    });
  } catch (error) {
    console.error("Error en saveWallet:", error);
    res
      .status(500)
      .json({ success: false, message: "Error al guardar la wallet." });
  }
};
