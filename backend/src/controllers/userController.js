import User from "../models/User.js";
import Product from "../models/Product.js";

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
        "username name avatar isVerified shop rating createdAt addresses accounting",
      )
      .lean();

    if (!user) {
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
    
    const seller = await User.findById(sellerId).select('bankAccounts');
    
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }
    
    // Buscar la cuenta bancaria default
    const defaultAccount = seller.bankAccounts?.find(acc => acc.isDefault) || seller.bankAccounts?.[0];
    
    if (!defaultAccount) {
      return res.status(404).json({
        success: false,
        message: 'El vendedor no tiene cuentas bancarias configuradas'
      });
    }
    
    res.json({
      success: true,
      bankAccount: defaultAccount
    });
  } catch (error) {
    console.error('Error al obtener cuentas bancarias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cuentas bancarias'
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
