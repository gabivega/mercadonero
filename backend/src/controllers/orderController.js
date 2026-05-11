import Order from "../models/Order.js";
import Product from "../models/Product.js";

const createOrder = async (req, res) => {
  try {
    const { sellerId, items, shippingAddress } = req.body;
    const buyerId = req.user._id; // Viene de tu middleware attachUser

    let maxShippingCost = 0;

    // 1. Obtener los IDs de los productos para buscarlos en la DB
    const productIds = items.map((item) => item.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } });

    // 2. Construir el itemsSnapshot validando datos reales
    let calculatedTotal = 0;
    const itemsSnapshot = items.map((cartItem) => {
      const actualProduct = dbProducts.find(
        (p) => p._id.toString() === cartItem.productId,
      );

      if (!actualProduct) {
        throw new Error(`Producto ${cartItem.productId} no encontrado`);
      }
      // 1. Lógica de Precio Dinámico (Sale vs Lista)
      let effectivePrice = actualProduct.price;

      if (actualProduct.sale?.active && actualProduct.sale?.price > 0) {
        // Si hay una oferta activa y el precio es válido, usamos el de oferta
        effectivePrice = actualProduct.sale.price;
      }

      const itemTotal = effectivePrice * cartItem.quantity;
      calculatedTotal += itemTotal;

      // Lógica de envío: buscamos el costo más alto del grupo
      const shippingCost = actualProduct.shipping?.free
        ? 0
        : actualProduct.shipping?.cost || 0;
      if (shippingCost > maxShippingCost) {
        maxShippingCost = shippingCost;
      }

      // Creamos el clon del producto para la posteridad
      return {
        productId: actualProduct._id,
        quantity: cartItem.quantity,
        title: actualProduct.name,
        description: actualProduct.description,
        price: effectivePrice,
        currency: actualProduct.currency,
        condition: actualProduct.condition,
        shipping: actualProduct.shipping, // Copiamos el objeto shipping completo
        images: actualProduct.images.map((img) => img.url), // Guardamos solo las URLs
        category: actualProduct.category,
        subCategory: actualProduct.subCategory,
        brand: actualProduct.brand,
        specifications: actualProduct.specifications,
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
      totalAmount: calculatedTotal + maxShippingCost,
      productsAmount: calculatedTotal,
      shippingAmount: maxShippingCost,
      status: "pending_payment",
      expiresAt: expiresAt,
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({
      success: true,
      message: "Orden creada con éxito",
      order: savedOrder,
    });
  } catch (error) {
    console.error("Error al crear orden:", error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la orden",
      error: error.message,
    });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id; // Obtenido por attachUser
    const { role } = req.query; // 'buyer' o 'seller'
    console.log("en mis ordenes", userId, role);
    // Definimos el filtro dinámicamente
    let filter = {};
    if (role === "seller") {
      filter = { seller: userId };
    } else {
      // Por defecto buscamos las compras del usuario
      filter = { buyer: userId };
    }

    // Buscamos y ordenamos por las más recientes (createdAt: -1)
    const orders = await Order.find(filter)
      .populate("buyer", "username firstName lastName avatar")
      .populate("seller", "username shop firstName lastName") // Datos mínimos necesarios
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al obtener tus órdenes",
      error: error.message,
    });
  }
};

const markAsPaid = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Buscamos la orden y solo actualizamos el status
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status: "verifying_payment" },
      { new: true }, // Para que devuelva la orden ya actualizada
    );

    if (!updatedOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });
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
      .populate("buyer", "username avatar")
      .populate("seller", "username shop bankDetails"); // Traemos datos del vendedor

    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    // EL FILTRO CRÍTICO:
    const isParticipant =
      order.buyer._id.toString() === req.user._id.toString() ||
      order.seller._id.toString() === req.user._id.toString();

    if (!isParticipant) {
      return res
        .status(403)
        .json({ message: "No tienes permiso para ver esta orden" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;
    const userId = req.user._id.toString();

    console.log("en update order", orderId, updates, userId);

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;

    // --- LÓGICA DE PERMISOS POR ESTADO ---

    // --- LÓGICA DE COMPRADOR: NOTIFICAR PAGO ---
    // Aceptamos la notificación si envían el comprobante O si envían el estado explícitamente
    if (
      isBuyer &&
      (updates.paymentProof || updates.status === "verifying_payment")
    ) {
      // Solo permitimos notificar si está pendiente
      if (order.status !== "pending_payment") {
        return res.status(400).json({
          success: false,
          message: `No se puede notificar pago en estado: ${order.status}`,
        });
      }

      // Si mandaron el link del comprobante, lo guardamos (es opcional)
      if (updates.paymentProof) {
        order.paymentProof = updates.paymentProof;
      }

      order.status = "verifying_payment";
      // Registramos quién hizo el cambio para auditoría interna
      console.log(
        `Orden ${orderId} marcada como verificando pago por comprador ${userId}`,
      );
    }
    // 2. Vendedor confirma pago o carga tracking
    if (isSeller) {
      if (updates.status === "paid" && order.status === "verifying_payment") {
        order.status = "paid";
      }

      if (order.status === "paid" && updates.shipping && updates.shipping.trackingNumber && updates.shipping.provider) {
        // Podés guardar el tracking y el proveedor si mandás un string "Andreani: AR123"
        order.shippingDetails.trackingNumber = updates.shipping.trackingNumber;
        order.shippingDetails.provider = updates.shipping.provider;
        order.shippingDetails.shippedAt = new Date();
        order.shippingDetails.otherProviderDetail = updates.shipping.otherProviderDetail
        order.status = "shipped"
        // Si ya está paga, podés mantenerla en 'paid' o crear un estado 'shipped' (opcional)
      }
      
    }

    // 3. Comprador confirma recepción final
    if (updates.status === "completed" && isBuyer) {
      if (order.status !== "paid" && !order.trackingNumber) {
        return res
          .status(400)
          .json({ message: "No podés completar sin pago/envío" });
      }
      order.status = "completed";
    }

    // 4. Cancelación (Solo si está pendiente)
    if (updates.status === "cancelled" && (isBuyer || isSeller)) {
      if (order.status === "pending_payment") {
        order.status = "cancelled";
      }
    }

    await order.save();

    // Devolvemos la orden poblada para que el front se actualice al instante
    const updatedOrder = await Order.findById(orderId)
      .populate("buyer", "username firstName lastName avatar")
      .populate("seller", "username shop firstName lastName");

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { createOrder, getMyOrders, markAsPaid, getOrderById, updateOrder };
