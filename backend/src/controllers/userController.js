import User from "../models/User.js";

export const updateProfile = async (req, res) => {
  try {
    const { username, firstName, lastName, avatar, dni, phone, addresses } = req.body;
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

    // 2. Actualización atómica
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          firstName,
          lastName,
          dni,
          phone,
          username: username?.toLowerCase(),
          avatar,
          addresses: addresses
        },
      },
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
      "username email phone firstName lastName isVerified avatar dni rating reviews addresses",
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
