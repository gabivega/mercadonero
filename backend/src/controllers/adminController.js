// controllers/adminController.js

import Order from '../models/Order.js';

export const getAllOrders = async (req, res) => {
  try {
    // Solo permitimos si el middleware de auth confirmó que es admin
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({ message: "Acceso denegado. Se requiere rol de administrador." });
    // }

    const orders = await Order.find()
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Error al obtener las órdenes" });
  }
};