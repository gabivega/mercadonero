import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { calculateOrderFinancials } from "../../../frontend/src/Utils/OrderUtils.js";
import {
  lockVendorCollateral,
  releaseVendorCollateral,
} from "../services/blockchainServices.js";
import User from "../models/User.js";
import { ethers } from "ethers";

const createOrder = async (req, res) => {
  try {
    const { sellerId, items, shippingAddress } = req.body;
    const buyerId = req.user._id;

    let maxShippingCost = 0;
    let calculatedTotal = 0;

    // 1. Obtener los IDs de los productos para buscarlos en la DB
    const productIds = items.map((item) => item.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } });

    // 2. Construir el itemsSnapshot validando datos reales
    const itemsSnapshot = items.map((cartItem) => {
      const actualProduct = dbProducts.find(
        (p) => p._id.toString() === cartItem.productId,
      );

      if (!actualProduct) {
        throw new Error(`Producto ${cartItem.productId} no encontrado`);
      }

      let effectivePrice = actualProduct.price;

      if (actualProduct.sale?.active && actualProduct.sale?.price > 0) {
        effectivePrice = actualProduct.sale.price;
      }

      const itemTotal = effectivePrice * cartItem.quantity;
      calculatedTotal += itemTotal;

      const shippingCost = actualProduct.shipping?.free
        ? 0
        : actualProduct.shipping?.cost || 0;
      if (shippingCost > maxShippingCost) {
        maxShippingCost = shippingCost;
      }

      return {
        productId: actualProduct._id,
        quantity: cartItem.quantity,
        title: actualProduct.name,
        description: actualProduct.description,
        price: effectivePrice,
        currency: actualProduct.currency,
        condition: actualProduct.condition,
        shipping: actualProduct.shipping,
        images: actualProduct.images.map((img) => img.url),
        category: actualProduct.category,
        subCategory: actualProduct.subCategory,
        brand: actualProduct.brand,
        specifications: actualProduct.specifications,
      };
    });

    const financials = await calculateOrderFinancials(
      calculatedTotal,
      maxShippingCost,
    );
    console.log("[Server] Financials:", financials);

    // 3. Definir expiración (Parametrizable)
    const MINUTES_TO_EXPIRATION = 60;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + MINUTES_TO_EXPIRATION);

    // ==========================================
    // 🛡️ NUEVA LÓGICA: SECCIÓN DE BLOCKCHAIN 🛡️
    // ==========================================

    // A. Buscamos la wallet de Privy del vendedor en la DB
    const seller = await User.findById(sellerId);
    if (!seller || !seller.walletAddress) {
      // Suponiendo que guardas la address en 'walletAddress'
      return res.status(400).json({
        success: false,
        message:
          "El vendedor no tiene una wallet válida vinculada a la plataforma.",
      });
    }

    // B. Definimos qué ID va a tener esta orden para mandárselo al contrato.
    // Como todavía no guardamos la orden en Mongoose, generamos un ObjectId temporal.
    // const tempOrderId = new ethers.Mongoose.Types.ObjectId().toString();
    // const tempOrderId = "123456789";
    // O si usas otro generador de IDs (como uuid), ponelo acá. Lo importante es que sea único.
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
      financials,
      expiresAt: expiresAt,
    });

    // 2. Extraemos ese ID real que generó Mongoose para usarlo en la Blockchain
    const orderIdForBlockchain = newOrder._id.toString();
    // El monto a congelar como garantía.
    // Podés elegir congelar el 'calculatedTotal' (precio de los productos)
    // o el total completo con envío. Usemos productos como ejemplo:
    const amountToLock = financials.totalUsd + financials.shippingCostUsd;

    console.log(
      `[Server] Intentando bloquear ${amountToLock} USDT de garantía para el vendedor ${seller.walletAddress}`,
    );

    // C. Intentamos ejecutar el bloqueo en la Blockchain (Vía Admin)
    const blockchainResult = await lockVendorCollateral(
      orderIdForBlockchain,
      seller.walletAddress,
      amountToLock,
    );

    // Si la simulación de la blockchain falla (ej: no tiene saldo libre suficiente),
    // abortamos acá mismo y no se crea nada en la Base de Datos.
    if (!blockchainResult.success) {
      return res.status(400).json({
        success: false,
        message:
          "No se pudo procesar la orden: El vendedor no cuenta con saldo de garantía suficiente en el contrato inteligente.",
        error: blockchainResult.error,
      });
    }

    // ==========================================
    // 💾 GUARDADO DE LA ORDEN
    // ==========================================

    // 4. Crear la Orden (Ahora le asignamos el ID exacto que usamos en Blockchain)
    newOrder.collateralTxHash = blockchainResult.txHash;

    const savedOrder = await newOrder.save();

    // verifyAndSyncVendorProducts(seller.walletAddress, seller._id);
    
    res.status(201).json({
      success: true,
      message: "Orden creada con éxito y colateral congelado en Blockchain",
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
    // console.log("en mis ordenes", userId, role);
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
    // console.log("Getting order by id:", req.params.orderId);
    const order = await Order.findById(req.params.orderId)
      .populate("buyer", "username avatar firstName lastName dni")
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


////// HELPER PARA LIBERAR COLATERAL /////
const executeBlockchainRelease = async (order, sellerAddress, montoOrden) => {
  console.log(
    `[Blockchain Helper] Solicitando liberación para la orden ${order._id}. Vendedor: ${sellerAddress}`,
  );

  const blockchainResult = await releaseVendorCollateral(
    order._id.toString(),
    sellerAddress,
    montoOrden,
  );

  if (!blockchainResult.success) {
    throw new Error(`Fallo en Blockchain: ${blockchainResult.error}`);
  }

  return blockchainResult.txHash;
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
        order.paymentVerifiedAt = new Date();
      }

      if (
        order.status === "paid" &&
        updates.shipping &&
        updates.shipping.trackingNumber &&
        updates.shipping.provider
      ) {
        // Podés guardar el tracking y el proveedor si mandás un string "Andreani: AR123"
        order.shippingDetails.trackingNumber = updates.shipping.trackingNumber;
        order.shippingDetails.provider = updates.shipping.provider;
        order.shippingDetails.shippedAt = new Date();
        order.shippingDetails.otherProviderDetail =
          updates.shipping.otherProviderDetail;
        order.status = "shipped";
        // Si ya está paga, podés mantenerla en 'paid' o crear un estado 'shipped' (opcional)
      }
    }

    // 3. Comprador confirma recepción final
    if (updates.status === "completed" && isBuyer) {
      if (order.status === "completed") {
        return res.status(400).json({
          message: "La orden ya está completada.",
        });
      }
      if (order.status !== "shipped") {
        return res.status(400).json({
          message:
            "No podés completar la orden ya que el pago no fue confirmado por el vendedor o el producto no fue enviado.",
        });
      }

      // A. Buscamos al vendedor para obtener su wallet real de la DB
      const seller = await User.findById(order.seller);
      if (!seller || !seller.walletAddress) {
        return res.status(400).json({
          message:
            "Error crítico: No se encontró la wallet del vendedor para efectuar la liberación del colateral.",
        });
      }

      try {
        // B. Ejecutamos la transacción en la Blockchain usando nuestro helper
        // El backend (admin) firma el releaseOrderCollateral en el contrato pool
        const txHash = await executeBlockchainRelease(
          order,
          seller.walletAddress,
          order.financials.totalUsd,
        );
        console.log(`[Server] Colateral liberado exitosamente. Tx: ${txHash}`);

        // C. Si la blockchain no tiró error y dio el OK, recién ahí impactamos la DB local
        order.status = "completed";
        order.completedAt = new Date();
        order.releaseTxHash = txHash; // 📝 Guardamos el hash de la liberación para auditoría
      } catch (blockchainError) {
        console.error(
          "[Critical Error] No se pudo completar la orden debido a un fallo en la blockchain:",
          blockchainError.message,
        );

        // Devolvemos un error 500 para que el Front sepa que la transacción falló
        // De esta manera, la orden permanece en estado "shipped" en MongoDB y se puede reintentar
        return res.status(500).json({
          success: false,
          message:
            "Hubo un problema al liberar los fondos en la red blockchain. Por favor, reintentá en unos momentos.",
          error: blockchainError.message,
        });
      }
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
