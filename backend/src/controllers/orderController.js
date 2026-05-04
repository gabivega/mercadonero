import Order from '../models/Order.js';
import Product from '../models/Product.js';

 const createOrder = async (req, res) => {
  try {
    const { sellerId, items, shippingAddress } = req.body;
    const buyerId = req.user._id; // Viene de tu middleware attachUser

    // 1. Obtener los IDs de los productos para buscarlos en la DB
    const productIds = items.map(item => item.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } });

    // 2. Construir el itemsSnapshot validando datos reales
    let calculatedTotal = 0;
    const itemsSnapshot = items.map(cartItem => {
      const actualProduct = dbProducts.find(p => p._id.toString() === cartItem.productId);
      
      if (!actualProduct) {
        throw new Error(`Producto ${cartItem.productId} no encontrado`);
      }
      // 1. Lógica de Precio Dinámico (Sale vs Lista)
  let effectivePrice = actualProduct.priceARS;
  
  if (actualProduct.sale?.active && actualProduct.sale?.price > 0) {
    // Si hay una oferta activa y el precio es válido, usamos el de oferta
    effectivePrice = actualProduct.sale.price;
  }

  const itemTotal = effectivePrice * cartItem.quantity;
  calculatedTotal += itemTotal;

  
      // Creamos el clon del producto para la posteridad
      return {
        productId: actualProduct._id,
        quantity: cartItem.quantity,
        title: actualProduct.name,
        description: actualProduct.description,
        price: effectivePrice,
        currency: 'ARS',
        condition: actualProduct.condition,
        shipping: actualProduct.shipping, // Copiamos el objeto shipping completo
        images: actualProduct.images.map(img => img.url), // Guardamos solo las URLs
        category: actualProduct.category,
        subCategory: actualProduct.subCategory,
        brand: actualProduct.brand,
        specifications: actualProduct.specifications
      };
    });

    // 3. Definir expiración (Parametrizable)
    const MINUTES_TO_EXPIRATION = 60;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + MINUTES_TO_EXPIRATION);

    // 4. Crear la Orden
    const newOrder = new Order({
      buyer: buyerId,
      seller: sellerId,
      products: productIds,
      itemsSnapshot,
      shippingAddress,
      totalAmount: calculatedTotal,
      expiresAt,
      status: 'pending_payment'
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({
      success: true,
      message: "Orden creada con éxito",
      order: savedOrder
    });

  } catch (error) {
    console.error("Error al crear orden:", error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la orden",
      error: error.message
    });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id; // Obtenido por attachUser
    const { role } = req.query; // 'buyer' o 'seller'

    // Definimos el filtro dinámicamente
    let filter = {};
    if (role === 'seller') {
      filter = { seller: userId };
    } else {
      // Por defecto buscamos las compras del usuario
      filter = { buyer: userId };
    }

    // Buscamos y ordenamos por las más recientes (createdAt: -1)
    const orders = await Order.find(filter)
      .populate('buyer', 'username firstName lastName avatar')
      .populate('seller', 'username shop firstName lastName') // Datos mínimos necesarios
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al obtener tus órdenes",
      error: error.message
    });
  }
};

const markAsPaid = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Buscamos la orden y solo actualizamos el status
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status: 'verifying_payment' },
      { new: true } // Para que devuelva la orden ya actualizada
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: "Orden no encontrada" });
    }

    res.status(200).json({ success: true, order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    console.log("Getting order by id:", req.params.orderId);
    const order = await Order.findById(req.params.orderId)
      .populate('buyer', 'username avatar')
      .populate('seller', 'username shop bankDetails'); // Traemos datos del vendedor

    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    // EL FILTRO CRÍTICO:
    const isParticipant = 
      order.buyer._id.toString() === req.user._id.toString() || 
      order.seller._id.toString() === req.user._id.toString();

    if (!isParticipant) {
      return res.status(403).json({ message: "No tienes permiso para ver esta orden" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { createOrder, getMyOrders, markAsPaid, getOrderById };