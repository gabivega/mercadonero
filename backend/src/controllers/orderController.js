import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { calculateOrderFinancials } from "../../../frontend/src/Utils/OrderUtils.js";
import {
  lockVendorCollateral,
  releaseVendorCollateral,
  cancelVendorCollateral,
  getOrderLock,
  getVendorCollateral,
  verifyOrderReleased,
  triggerOrderDispute,
} from "../services/blockchainServices.js";
import User from "../models/User.js";
import { ethers } from "ethers";
import {
  sendOrderCreatedToBuyer,
  sendOrderCreatedToVendor,
  sendPaymentConfirmedToVendor,
  sendShippingDetailsToBuyer,
  sendOrderCompletedToVendor,
  sendOrderCompletedToBuyer,
    sendRefundRequestedToVendor,
    sendOrderCancelledToBuyer,
  sendOrderCancelledToVendor,
  sendAdminCancellationRequest,
  sendVendorCollateralHoldRequested,
} from "../services/sendEmail.js";
import {
  createNotification,
} from "../services/notificationService.js";
import { accrueCashbackForOrder } from "../services/cashbackService.js";
import { transitionToStatus } from "../services/orderHelpers.js";
import {
  getVendorEffectiveAvailable,
  validateVendorHoldCapacity,
  resolveCollateralHold,
  expireCollateralHold,
  COLLATERAL_HOLD_CONFIG,
} from "../services/collateralHoldService.js";

const createOrder = async (req, res) => {
  try {
        const { sellerId, items, shippingAddress, paymentMethod = "bank_transfer", token = "USDT" } = req.body;
    const buyerId = req.user._id;

        const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ message: "Comprador no encontrado" });
    }

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN DE ONBOARDING DEL COMPRADOR
    // El checkout del front ya bloquea la compra, pero por seguridad
    // también rechazamos acá en el servidor si alguien hace un bypass
    // y envía la creación de la orden sin haber completado sus datos.
    // ─────────────────────────────────────────────────────────────
    const hasMandatoryData =
      buyer.firstName && buyer.lastName && buyer.dni && buyer.phone;
    const hasCompletedOnboarding =
      buyer.profileCompleted === true || hasMandatoryData;

    if (!hasCompletedOnboarding) {
      return res.status(400).json({
        success: false,
        message:
          "Faltan datos obligatorios del comprador. Completá tu perfil (nombre, apellido, DNI y teléfono) antes de continuar con la compra.",
      });
    }

        let maxShippingCost = 0;
    let calculatedTotal = 0;

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN DEL VENDEDOR
    // Verificamos que el vendedor exista y no sea el propio comprador
    // (un usuario no puede comprarse a sí mismo).
    // ─────────────────────────────────────────────────────────────
    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no existe en la plataforma.",
      });
    }
    if (seller._id.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "No podés comprarte un producto a vos mismo.",
      });
    }

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

      // ─────────────────────────────────────────────────────────────
      // 🛡️ VALIDACIÓN CRÍTICA DE PERTENENCIA
      // Nos aseguramos de que cada producto realmente pertenezca al
      // vendedor indicado en la URL/request. Esto evita que un atacante
      // haga bypass del front y asocie productos de un vendedor B a una
      // orden del vendedor A.
      // ─────────────────────────────────────────────────────────────
      if (actualProduct.seller.toString() !== sellerId.toString()) {
        throw new Error(
          `El producto "${actualProduct.name}" no pertenece al vendedor indicado.`,
        );
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

    // ════════════════════════════════════════════════════════════
    // FLUJO PAGO CON CRIPTOMONEDAS (Escrow NeroEscrow)
    // El comprador fondeará USDT en el contrato escrow y los fondos quedan
    // retenidos hasta que el admin libere (comprador confirmó recepción).
    // NO se exige colateral al vendedor: el escrow retiene el pago del comprador.
    // ════════════════════════════════════════════════════════════
    if (paymentMethod === "crypto") {
      // Validamos que AMBOS (comprador y vendedor) tengan wallet, ya que:
      //  - El comprador fondea el escrow con su wallet.
      //  - El vendedor recibe el pago del escrow en SU wallet.
      if (!buyer.walletAddress) {
        return res.status(400).json({
          success: false,
          message:
            "Para pagar con criptomonedas necesitás tener una wallet Web3 vinculada. Activá tu billetera desde 'Mi Billetera' antes de continuar.",
        });
      }
      if (!seller.walletAddress) {
        return res.status(400).json({
          success: false,
          message:
            "El vendedor no tiene una wallet Web3 vinculada, por lo que no puede recibir pagos en criptomonedas.",
        });
      }

            // El fee del escrow es GLOBAL y lo define el admin en el contrato (feeBps).
      // Al crear la orden leemos el fee ACTUAL on-chain para que la comisión de
      // esta orden coincida con la que cobrará el contrato al liberar el escrow.
      const { getFeeBps } = await import("../services/escrowServices.js");
      const feeRead = await getFeeBps();
      const currentFeeBps = feeRead.success ? feeRead.feeBps : 300;
      // Recalculamos la comisión de ESTA orden según el fee global vigente.
      financials.platformFeeUsd = parseFloat(
        (financials.totalUsd * (currentFeeBps / 10000)).toFixed(2),
      );
      financials.sellerNetReleaseUsd = parseFloat(
        (financials.totalUsd - financials.platformFeeUsd).toFixed(2),
      );

      // Creamos la orden en estado 'pending_payment' con el sub-estado de pago
      // crypto en 'funding'. El comprador fondeará el escrow desde su billetera.
      const newOrderCrypto = new Order({
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
        payment: {
          method: "crypto",
          token: token,
          status: "funding",
          tokenAddress: "",
          amountUsdRetained: financials.totalUsd + financials.shippingCostUsd,
          feeUsd: financials.platformFeeUsd,
          feeBps: currentFeeBps,
          sellerNetUsd: financials.sellerNetReleaseUsd,
        },
      });

      const savedCryptoOrder = await newOrderCrypto.save();

      // Notificaciones (comprador y vendedor)
      sendOrderCreatedToBuyer({
        buyerEmail: buyer.email,
        orderId: savedCryptoOrder._id,
        amount: savedCryptoOrder.totalAmount,
        products: savedCryptoOrder.itemsSnapshot,
        seller: seller.username,
      }).catch((err) => console.error("Falló notificación a comprador:", err));

      sendOrderCreatedToVendor({
        vendorEmail: seller.email,
        orderId: savedCryptoOrder._id,
        amount: savedCryptoOrder.totalAmount,
        products: savedCryptoOrder.itemsSnapshot,
        buyerName: buyer.name,
      }).catch((err) => console.error("Falló notificación a vendedor:", err));

      createNotification({
        recipient: sellerId,
        type: "order_created",
        title: "¡Nueva orden de compra (cripto)!",
        message: `${buyer.name} inició la orden #${savedCryptoOrder._id.toString().slice(-6).toUpperCase()} y abonará en USDT.`,
        data: { orderId: savedCryptoOrder._id, totalAmount: savedCryptoOrder.totalAmount },
      }).catch((err) => console.error("Falló notif in-app a vendedor:", err));

            return res.status(201).json({
        success: true,
        message:
          "Orden creada con pago en criptomonedas. Fondéa el escrow desde tu billetera para que el vendedor pueda despachar.",
        order: savedCryptoOrder,
        sellerWallet: seller.walletAddress,
        buyerWallet: buyer.walletAddress,
        escrowContract: process.env.ESCROW_CONTRACT_ADDRESS,
      });
    }

    // ════════════════════════════════════════════════════════════
    // FLUJO TRANSFERENCIA BANCARIA (COLATERAL EXISTENTE)
    // ════════════════════════════════════════════════════════════
    // A. Buscamos la wallet de Privy del vendedor en la DB
    // (seller ya fue cargado y validado más arriba)
    if (!seller.walletAddress) {
      // Suponiendo que guardas la address en 'walletAddress'
      return res.status(400).json({
        success: false,
        message:
          "El vendedor no tiene una wallet válida vinculada a la plataforma.",
      });
    }


        // B. Definimos qué ID va a tener esta orden para mandárselo al contrato.
    // Como todavía no guardamos la orden en Mongoose, generamos un ObjectId temporal.
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
      status: "pending_payment", // Se ajusta más abajo si pasa a "awaiting_collateral"
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

    // ────────────────────────────────────────────────────────────────
    // C. LÓGICA DE COLATERAL: capacidad efectiva vs. lo que se necesita
    // Antes de golpear la blockchain, verificamos si el vendedor tiene
    // SALDO LIBRE suficiente (on-chain - reservado por holds activos).
    //  - Si alcanza                      → flujo normal (block + pending_payment)
    //  - Si NO alcanza (colateral fuera) → entra a "awaiting_collateral"
    //    (se le da 15 min al vendedor para depositar, el comprador decide).
    // ────────────────────────────────────────────────────────────────
    const effective = await getVendorEffectiveAvailable(
      seller._id,
      seller.walletAddress,
    );

    if (effective.effectiveAvailable >= amountToLock) {
      // ── FLUJO NORMAL: hay colateral suficiente ──
      const blockchainResult = await lockVendorCollateral(
        orderIdForBlockchain,
        seller.walletAddress,
        amountToLock,
      );

      // Si la blockchain falla (error real del contrato, no insuficiencia),
      // abortamos y no se crea nada en la DB.
      if (!blockchainResult.success) {
        console.error(
          "[Server] Fallo al bloquear colateral del vendedor",
          seller.walletAddress,
          "| amountToLock:",
          amountToLock,
          "| error:",
          blockchainResult.error,
        );
        return res.status(400).json({
          success: false,
          message:
            "No se pudo procesar la orden: el sistema no pudo congelar la garantía del vendedor en el contrato inteligente.",
          error:
            blockchainResult.error ||
            "Error desconocido al bloquear colateral en blockchain",
          detail: {
            vendorWallet: seller.walletAddress,
            contractAddress: process.env.CONTRACT_ADDRESS,
            amountToLockUsd: amountToLock,
          },
        });
      }

      // ── GUARDADO (flujo normal) ──
      newOrder.collateralTxHash = blockchainResult.txHash;
      newOrder.status = "pending_payment";

      const savedOrder = await newOrder.save();

      // Notificaciones (normal)
      sendOrderCreatedToBuyer({
        buyerEmail: buyer.email,
        orderId: newOrder._id,
        amount: newOrder.totalAmount,
        products: newOrder.itemsSnapshot,
        seller: seller.username,
      }).catch((err) => console.error("Falló notificación a comprador:", err));

      sendOrderCreatedToVendor({
        vendorEmail: seller.email,
        orderId: newOrder._id,
        amount: newOrder.totalAmount,
        products: newOrder.itemsSnapshot,
        buyerName: buyer.name,
      }).catch((err) => console.error("Falló notificación a vendedor:", err));

      createNotification({
        recipient: sellerId,
        type: "order_created",
        title: "¡Nueva orden de compra!",
        message: `${buyer.name} inició la orden #${newOrder._id.toString().slice(-6).toUpperCase()}.`,
        data: { orderId: newOrder._id, totalAmount: newOrder.totalAmount },
      }).catch((err) => console.error("Falló notif in-app a vendedor:", err));

      return res.status(201).json({
        success: true,
        message: "Orden creada con éxito y colateral congelado en Blockchain",
        order: savedOrder,
      });
    }

    // ────────────────────────────────────────────────────────────────
    // D. COLATERAL INSUFICIENTE → estado intermedio "awaiting_collateral"
    // No rebotamos la orden: le damos al vendedor 15 min para depositar y
    // al comprador la opción de esperar o cancelar.
    // ────────────────────────────────────────────────────────────────
    const holdCheck = await validateVendorHoldCapacity(seller._id);
    if (!holdCheck.ok) {
      // El vendedor ya agotó sus holds disponibles (2 activos o 3 vencidos/día).
      return res.status(409).json({
        success: false,
        code: holdCheck.code,
        message:
          "El vendedor no puede recibir más solicitudes en espera de garantía en este momento.",
        reason: holdCheck.reason,
      });
    }

    const holdExpiresAt = new Date(Date.now() + COLLATERAL_HOLD_CONFIG.HOLD_MS);

    newOrder.status = "awaiting_collateral";
    newOrder.collateralHold = {
      requestedAt: new Date(),
      expiresAt: holdExpiresAt,
      reserveUsd: amountToLock,
      reason: "insufficient_collateral",
      status: "pending",
    };

    const holdOrder = await newOrder.save();

        // Notificar al VENDEDOR: necesita depositar colateral para no perder la venta
    createNotification({
      recipient: sellerId,
      type: "collateral_hold_requested",
      title: "¡Tenés una venta en espera por falta de garantía!",
      message: `${buyer.name} quiere comprarte, pero no tenés saldo libre de garantía. Depositá USDT en los próximos ${Math.round(
        COLLATERAL_HOLD_CONFIG.HOLD_MS / 60000,
      )} minutos para no perder la venta (orden #${newOrder._id
        .toString()
        .slice(-6)
        .toUpperCase()}).`,
      data: { orderId: newOrder._id, amountToLockUsd: amountToLock },
    }).catch((err) => console.error("Falló notif hold a vendedor:", err));

    // 💌 MAIL al vendedor: aviso de espera por falta de garantía, para que
    // deposite USDT en el plazo y no pierda la venta.
    if (seller?.email) {
      sendVendorCollateralHoldRequested({
        vendorEmail: seller.email,
        orderId: newOrder._id,
        amount: amountToLock,
        products: newOrder.itemsSnapshot || [],
        buyerName: buyer.name || buyer.firstName || "El comprador",
        minutesLeft: Math.round(COLLATERAL_HOLD_CONFIG.HOLD_MS / 60000),
      }).catch((err) =>
        console.error("Falló email de garantía al vendedor:", err),
      );
    }

    return res.status(202).json({
      success: true,
      status: "awaiting_collateral",
      message:
        "El vendedor debe depositar colateral para confirmar el envío. Podés esperar unos minutos o cancelar y buscar este producto en otro vendedor.",
      order: holdOrder,
            collateralHold: {
        expiresAt: holdExpiresAt,
        minutesLeft: Math.round(COLLATERAL_HOLD_CONFIG.HOLD_MS / 60000),
        amountToLockUsd: amountToLock,
      },
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

            // Notificar al vendedor que el comprador confirmó el pago (Background)
      const orderSeller = await User.findById(order.seller);
      if (orderSeller?.email) {
        sendPaymentConfirmedToVendor({
          vendorEmail: orderSeller.email,
          orderId: order._id,
          amount: order.totalAmount,
        }).catch((err) =>
          console.error("Falló notificación de pago al vendedor:", err),
        );
      }

      // Notificación in-app al Vendedor - Pago confirmado por el comprador
      if (orderSeller) {
        createNotification({
          recipient: orderSeller._id,
          type: "payment_confirmed",
          title: "El comprador notificó el pago",
          message: `Se reportó el pago de la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
          data: { orderId: order._id, totalAmount: order.totalAmount },
        }).catch((err) =>
          console.error("Falló notif in-app de pago a vendedor:", err),
        );
      }
    }
    // 2. Vendedor confirma pago o carga tracking
        if (isSeller) {
      if (updates.status === "paid" && order.status === "verifying_payment") {
        order.status = "paid";
        order.paymentVerifiedAt = new Date();
      }

      // Cambio solicitado: el vendedor puede marcar el pago como recibido
      // aunque el comprador no lo notificara manualmente (la orden sigue en
      // 'pending_payment'). Esto evita que el flujo se trabe cuando el
      // comprador paga pero demora/olvida notificar. El front muestra una
      // confirmación extra de seguridad antes de llamar este endpoint.
      if (updates.status === "paid" && order.status === "pending_payment") {
        order.status = "paid";
        order.paymentVerifiedAt = new Date();
        order.statusHistory.push({
          status: "paid",
          changedAt: new Date(),
          comment:
            "El vendedor confirmó la recepción del pago sin que el comprador lo notificara manualmente.",
        });
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

                // Notificar al comprador con los detalles del envío (Background)
        const orderBuyer = await User.findById(order.buyer);
        if (orderBuyer?.email) {
          sendShippingDetailsToBuyer({
            buyerEmail: orderBuyer.email,
            orderId: order._id,
            provider: order.shippingDetails.provider,
            trackingNumber: order.shippingDetails.trackingNumber,
            otherProviderDetail: order.shippingDetails.otherProviderDetail,
            amount: order.totalAmount,
            shippingAddress: order.shippingAddress,
          }).catch((err) =>
            console.error("Falló notificación de envío al comprador:", err),
          );
        }

        // Notificación in-app al Comprador - Pedido enviado
        if (orderBuyer) {
          createNotification({
            recipient: orderBuyer._id,
            type: "order_shipped",
            title: "¡Tu pedido fue enviado!",
            message: `El vendedor envió la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
            data: {
              orderId: order._id,
              provider: order.shippingDetails.provider,
              trackingNumber: order.shippingDetails.trackingNumber,
            },
          }).catch((err) =>
            console.error("Falló notif in-app de envío a comprador:", err),
          );
        }
      }
    }

        // 3. Comprador confirma recepción final
    if (updates.status === "completed" && isBuyer) {
      if (order.status === "completed") {
        return res.status(400).json({
          message: "La orden ya está completada.",
        });
      }
      // No se puede confirmar recepción si hay una disputa abierta.
      if (order.dispute?.exists) {
        return res.status(409).json({
          success: false,
          message:
            "Hay una disputa abierta en esta orden. No podés confirmar la recepción hasta que el admin la resuelva.",
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
        // ════════════════════════════════════════════════════════════
        // FLUJO PAGO CRIPTO: el comprador confirmó la recepción.
        // En vez de liberar el colateral del vendedor (transferencia bancaria),
        // liberamos el escrow: el admin firma releaseOrder() y el contrato
        // envía al vendedor el neto y el fee a la feeWallet.
        // ════════════════════════════════════════════════════════════
        let txHash;
        if (order.payment?.method === "crypto") {
          // La liberación del escrow NO requiere la wallet del vendedor como
          // parámetro propio: el contrato guarda la dirección del vendedor al
          // momento de fundar. El admin la envía al releaseOrder contract.
          // Importamos el servicio escrow localmente para evitar ciclos.
          const { releaseOrderEscrow } = await import("../services/escrowServices.js");
          if (order.payment?.status !== "funded") {
            return res.status(400).json({
              success: false,
              message:
                "El escrow no está fondeado on-chain. Verificá que el comprador haya depositado los USDT antes de completar la orden.",
            });
          }
          const escrowResult = await releaseOrderEscrow(order._id.toString());
          if (!escrowResult.success) {
            throw new Error(`Fallo en escrow: ${escrowResult.error}`);
          }
          txHash = escrowResult.txHash;

          // Actualizamos el sub-estado de pago.
          order.payment.status = "released";
          order.payment.releaseTxHash = txHash;
          order.payment.feeUsd = order.financials.platformFeeUsd;
          order.payment.sellerNetUsd = order.financials.sellerNetReleaseUsd;
          order.payment.releasedAt = new Date();
        } else {
          // B. Ejecutamos la transacción en la Blockchain usando nuestro helper
          // El backend (admin) firma el releaseOrderCollateral en el contrato pool
          txHash = await executeBlockchainRelease(
            order,
            seller.walletAddress,
            order.financials.totalUsd,
          );
          console.log(`[Server] Colateral liberado exitosamente. Tx: ${txHash}`);
        }

                // C. Si la blockchain no tiró error y dio el OK, recién ahí impactamos la DB local
                order.status = "completed";
                order.completedAt = new Date();
                order.releaseTxHash = txHash; // 📝 Guardamos el hash de la liberación para auditoría

                // C.b. CASHBACK: acreditamos cashback al comprador (acumulación en BD).
                // No bloqueamos la finalización de la orden si el cashback falla: no es crítico.
                try {
                  const cashbackResult = await accrueCashbackForOrder(order);
                  if (cashbackResult.applied) {
                    console.log(
                      `[Cashback] Orden ${order._id} generó US$ ${cashbackResult.earnedUsd} de cashback para el comprador.`,
                    );
                  }
                } catch (cashbackErr) {
                  console.error(
                    `[Cashback] Fallo no crítico al acreditar cashback en orden ${order._id}:`,
                    cashbackErr.message,
                  );
                }


        // D. Actualización de métricas: contadores de ventas/compras y stock vendido.
        // Se hace SÓLO acá, al completarse la orden (la venta es efectiva), para que
        // el perfil público y las unidades vendidas del producto se actualicen.

        // D1. Vendedor: total de ventas completadas (accounting + shop).
        await User.findByIdAndUpdate(order.seller, {
          $inc: {
            "accounting.completedSales": 1,
            "shop.totalSalesCount": 1,
          },
        });

        // D2. Comprador: total de compras completadas.
        await User.findByIdAndUpdate(order.buyer, {
          $inc: { "accounting.completedPurchases": 1 },
        });

        // D3. Incrementar "vendidos" de cada producto de la orden por su cantidad.
        // Descontamos también el stock, ya que la venta se concretó.
        for (const item of order.itemsSnapshot) {
          const qty = item.quantity || 1;
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { sold: qty, stock: -qty },
          });
        }

                // Notificar al vendedor que la venta se completó y los fondos fueron liberados (Background)
        if (seller?.email) {
          sendOrderCompletedToVendor({
            vendorEmail: seller.email,
            orderId: order._id,
            amount: order.totalAmount,
          }).catch((err) =>
            console.error(
              "Falló notificación de orden completada al vendedor:",
              err,
            ),
          );
        }

        // Notificación in-app al Vendedor - Venta completada / fondos liberados
        if (seller) {
          createNotification({
            recipient: seller._id,
            type: "order_completed",
            title: "¡Venta completada y fondos liberados!",
            message: `El comprador confirmó la recepción de la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
            data: { orderId: order._id, totalAmount: order.totalAmount },
          }).catch((err) =>
            console.error(
              "Falló notif in-app de venta completada a vendedor:",
              err,
            ),
          );
        }

                // Confirmación al comprador de compra completada (Background)
        const completedOrderBuyer = await User.findById(order.buyer);
        if (completedOrderBuyer?.email) {
          sendOrderCompletedToBuyer({
            buyerEmail: completedOrderBuyer.email,
            orderId: order._id,
            amount: order.totalAmount,
          }).catch((err) =>
            console.error(
              "Falló notificación de compra completada al comprador:",
              err,
            ),
          );
        }

        // ── RECORDATORIOS DE RATING (orden completada) ──
        // Comprador: puede calificar cada producto comprado y al vendedor.
        if (completedOrderBuyer) {
          createNotification({
            recipient: completedOrderBuyer._id,
            type: "rating_reminder",
            title: "¡Comprá con confianza! Calificá tus productos",
            message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se completó. Contanos tu experiencia con las estrellas y una breve reseña.`,
            data: { orderId: order._id, ratingType: "product_rating" },
          }).catch(() => {});
          createNotification({
            recipient: completedOrderBuyer._id,
            type: "rating_reminder",
            title: "Calificá al vendedor",
            message: `¿Recomendás a este vendedor? Dejá tu calificación (👍/👎) en la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
            data: { orderId: order._id, ratingType: "seller_rating" },
          }).catch(() => {});
        }
        // Vendedor: puede calificar al comprador.
        if (seller) {
          createNotification({
            recipient: seller._id,
            type: "rating_reminder",
            title: "Calificá al comprador",
            message: `La venta #${order._id.toString().slice(-6).toUpperCase()} se completó. Dejá tu calificación (👍/👎) sobre el comprador.`,
            data: { orderId: order._id, ratingType: "buyer_rating" },
          }).catch(() => {});
        }
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

/**
 * CANCELACIÓN DE ORDEN (Comprador cancela compra / Vendedor rechaza orden)
 * Solo permitido ANTES del envío: estados 'pending_payment' y 'verifying_payment'.
 *
 * Escenarios:
 *  a) Iniciador declara que NO pagó -> cancelación directa. Se libera el
 *     colateral al vendedor (0% fee) y la orden pasa a 'cancelled'.
 *  b) Iniciador declara que SÍ pagó -> NO se cancela todavía. Se registra una
 *     solicitud de reembolso pendiente (pendingRequest), se notifica a la otra
 *     parte y el comprador provee sus datos bancarios. Recién cuando el
 *     vendedor confirme el reembolso (confirmRefund) se cancela la orden.
 */
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // El comprador es quien cancela su propia compra. La cancelación por parte
    // del vendedor se gestiona por el admin (requestAdminRelease/adminReleaseGuarantee).
    // body:
    //   paidStatus, reason, refundBankAccount
    const { paidStatus, reason, refundBankAccount } = req.body;

        // Forzamos iniciador según quién llama: comprador (flujo clásico) o
    // vendedor (cancela una orden ya pagada, debe reembolsar).
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res
        .status(403)
        .json({ message: "No tenés permisos para cancelar esta orden." });
    }

    // ════════════════════════════════════════════════════════════════
    // FLUJO VENDEDOR: cancela una orden YA PAGADA (transferencia bancaria).
    // El vendedor no libera su garantía por sí mismo (política anti-fraude).
    // Para cancelar una orden pagada debe reembolsar el dinero al comprador:
    // registramos una solicitud de reembolso (pendingRequest con initiator
    // 'seller') y la garantía queda retenida hasta que el vendedor confirme el
    // reembolso y el comprador confirme haberlo recibido (recién ahí se libera).
    // ════════════════════════════════════════════════════════════════
    if (isSeller && !isBuyer) {
      if (order.payment?.method === "crypto") {
        return res.status(400).json({
          success: false,
          message:
            "Esta orden usa criptomonedas. La cancelación se gestiona devolviendo los USDT del escrow (cancel-crypto).",
        });
      }
      if (order.status === "cancelled" || order.status === "completed") {
        return res
          .status(400)
          .json({ success: false, message: `La orden ya está ${order.status}.` });
      }
      if (order.status !== "paid") {
        return res.status(400).json({
          success: false,
          message: `El vendedor solo puede cancelar cuando la orden está pagada (estado actual: ${order.status}).`,
        });
      }
            if (order.pendingRequest?.exists) {
        return res.status(400).json({
          success: false,
          message: "Ya existe una cancelación en curso para esta orden.",
        });
      }

      // El VENDEDOR inició la cancelación de una orden paga, por lo que debe
      // reembolsar al comprador. Necesita los datos bancarios del comprador
      // para saber a dónde transferirle el reintegro: los tomamos de su cuenta
      // por defecto del perfil y los dejamos en la solicitud de reembolso.
      const buyerForRefund = await User.findById(order.buyer);
      const rawAcct =
        buyerForRefund?.bankAccounts?.find((a) => a.isDefault) ||
        buyerForRefund?.bankAccounts?.[0];
      const buyerRefundAccount = rawAcct
        ? {
            bankName: rawAcct.bankName || "",
            holderName: rawAcct.holderName || "",
            cbuCvu: rawAcct.cbuCvu || rawAcct.cbu || "",
            cuitCuil: rawAcct.cuitCuil || rawAcct.cuit || "",
            alias: rawAcct.alias || "",
            accountType: rawAcct.accountType || "",
          }
        : null;

      order.pendingRequest = {
        exists: true,
        initiator: "seller",
        paidStatus: "paid",
        status: "pending",
        reason: reason || "Cancelación iniciada por el vendedor con la orden pagada",
        // Datos bancarios del comprador para que el vendedor pueda reembolsarle.
        ...(buyerRefundAccount ? { refundBankAccount: buyerRefundAccount } : {}),
        createdAt: new Date(),
      };
      order.orderActions.push({
        type: "refund_request",
        initiator: "seller",
        paidStatus: "paid",
        status: "pending",
        reason:
          "El vendedor inició la cancelación de una orden pagada. Debe reembolsar al comprador para que su garantía sea liberada.",
        createdBy: order.seller,
      });
      await order.save();

      // Notificar al comprador que el vendedor canceló y le devolverá el dinero.
      const buyerUsr = await User.findById(order.buyer);
      createNotification({
        recipient: order.buyer,
        type: "order_refund_requested",
        title: "El vendedor canceló tu compra",
        message: `El vendedor canceló la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()} y te devolverá el dinero. Verificá que te llegue la transferencia y confirmá la recepción para cerrar el proceso.`,
        data: { orderId: order._id },
      }).catch(() => {});
      if (buyerUsr?.email) {
        sendOrderCancelledToBuyer({
          buyerEmail: buyerUsr.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: true,
        }).catch(() => {});
      }

            // Contador de cancelaciones iniciadas por el vendedor.
      await User.findByIdAndUpdate(order.seller, {
        $inc: {
          "accounting.cancellationsAsSeller": 1,
          // El vendedor queda con un reembolso pendiente de procesar/dar al
          // comprador. Este +1 lo balancea el -1 de buyerConfirmsRefundReceived
          // cuando el comprador confirma haberlo recibido.
          "accounting.refundsPending": 1,
        },
      });

      return res.status(200).json({
        success: true,
        message:
          "Cancelación registrada. Deberás devolver el dinero al comprador y él lo confirmará para liberar tu garantía.",
        order,
      });
    }

    // ════════════════════════════════════════════════════════════════
    // FLUJO COMPRADOR (flujo clásico)
    // ════════════════════════════════════════════════════════════════
    void isSeller;

    // Solo se puede cancelar antes del envío
    const cancellable = ["pending_payment", "verifying_payment"].includes(
      order.status,
    );
    if (!cancellable) {
      return res.status(400).json({
        success: false,
        message: `No se puede cancelar la orden en estado: ${order.status}`,
      });
    }

        /* ════════════════════════════════════════════════════════════════
       PUNTO 1: 'pending_payment' pero el comprador indica que SÍ abonó.
       Como la orden aún figura sin pago notificado en la plataforma, primero
       la marcamos como pagada (flujo estándar → 'verifying_payment') y recién
       ahí continuamos al flujo de reembolso que viene más abajo (Caso B).
       Esto evita preguntarle genéricamente si pagó: si declara haber pagado
       en 'pending_payment', lo notificamos en el sistema.
       ════════════════════════════════════════════════════════════════ */
    if (order.status === "pending_payment" && paidStatus === "paid") {
      order.status = "verifying_payment";
      order.paymentVerifiedAt = new Date();
      order.statusHistory.push({
        status: "verifying_payment",
        changedAt: new Date(),
        comment:
          "Comprador notificó el pago al cancelar. Se continúa con la solicitud de reembolso.",
      });

      const pvOrderSeller = await User.findById(order.seller);
      if (pvOrderSeller?.email)
        sendPaymentConfirmedToVendor({
          vendorEmail: pvOrderSeller.email,
          orderId: order._id,
          amount: order.totalAmount,
        }).catch(() => {});
      if (pvOrderSeller) {
        createNotification({
          recipient: pvOrderSeller._id,
          type: "payment_confirmed",
          title: "El comprador notificó el pago",
          message: `Se reportó el pago de la orden #${order._id.toString().slice(-6).toUpperCase()} al iniciar una cancelación.`,
          data: { orderId: order._id, totalAmount: order.totalAmount },
        }).catch(() => {});
      }
      // No retornamos acá: seguimos al flujo de reembolso (Caso B) ya que el
      // comprador pidió cancelar habiendo abonado.
    }

    /* ════════════════════════════════════════════════════════════════
       Caso A (sub-caso "no pagué"): 'pending_payment' y el comprador dice NO
       haber abonado. Es seguro liberar la garantía al vendedor y cancelar.
       ════════════════════════════════════════════════════════════════ */
    if (order.status === "pending_payment" && paidStatus !== "paid") {
      const seller = await User.findById(order.seller);
      if (!seller || !seller.walletAddress) {
        return res.status(400).json({
          success: false,
          message:
            "No se pudo liberar el colateral: el vendedor no tiene wallet asociada.",
        });
      }

      const blockchainResult = await cancelVendorCollateral(
        order._id.toString(),
        seller.walletAddress,
      );
      if (!blockchainResult.success) {
        return res.status(500).json({
          success: false,
          message: "No se pudo liberar el colateral en la blockchain.",
          error: blockchainResult.error,
        });
      }

            order.status = "cancelled";
      order.releaseTxHash = blockchainResult.txHash;
      order.pendingRequest.exists = false;
      order.cancelledBy = "buyer";
      order.statusHistory.push({
        status: "cancelled",
        changedAt: new Date(),
        comment: `Cancelada por el comprador (sin pago notificado). ${reason || ""}`.trim(),
      });
      order.orderActions.push({
        type: "cancel_executed",
        initiator: "buyer",
        paidStatus: "not_paid",
        status: "completed",
        reason: reason || "Cancelación por el comprador sin pago notificado",
        releaseTxHash: blockchainResult.txHash,
        createdBy: order.buyer,
      });
      await order.save();

      // Contadores
      await User.findByIdAndUpdate(order.buyer, {
        $inc: { "accounting.cancellationsAsBuyer": 1 },
      });

      // Notificaciones
      const orderBuyer = await User.findById(order.buyer);
      const orderSeller = await User.findById(order.seller);
      if (orderBuyer?.email)
        sendOrderCancelledToBuyer({
          buyerEmail: orderBuyer.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch(() => {});
      if (orderSeller?.email)
        sendOrderCancelledToVendor({
          vendorEmail: orderSeller.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch(() => {});
            createNotification({
        recipient: order.seller,
        type: "order_cancelled",
        title: "Orden cancelada",
        message: `La orden #${order._id.toString().slice(-6).toUpperCase()} fue cancelada por el comprador sin que se notificara un pago.`,
        data: { orderId: order._id },
      }).catch(() => {});
      // Recordatorio de rating: el vendedor puede calificar al comprador
      // (cancelación iniciada por el comprador).
      createNotification({
        recipient: order.seller,
        type: "rating_reminder",
        title: "Calificá al comprador",
        message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
        data: { orderId: order._id, ratingType: "buyer_rating" },
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: "Orden cancelada y colateral liberado al vendedor.",
        order,
      });
    }

    /* ── Caso B: 'verifying_payment' → el comprador YA notificó su pago.
       NO se puede liberar la garantía. Se retiene hasta que el vendedor
       reembolse y el comprador confirme haber recibido el reintegro. ── */
    if (!refundBankAccount || !refundBankAccount.cbuCvu) {
      return res.status(400).json({
        success: false,
        message:
          "Para cancelar habiendo pagado, debés ingresar los datos bancarios donde recibir el reembolso.",
      });
    }

    order.pendingRequest = {
      exists: true,
      initiator: "buyer",
      paidStatus: "paid",
      status: "pending", // pendiente de que el vendedor reembolse
      reason: reason || "",
      refundBankAccount: {
        bankName: refundBankAccount.bankName || "",
        holderName: refundBankAccount.holderName || "",
        cbuCvu: refundBankAccount.cbuCvu,
        alias: refundBankAccount.alias || "",
        cuitCuil: refundBankAccount.cuitCuil || "",
        accountType: refundBankAccount.accountType || "",
      },
      createdAt: new Date(),
    };
    order.orderActions.push({
      type: "refund_request",
      initiator: "buyer",
      paidStatus: "paid",
      status: "pending",
      reason: reason || "Cancelación con pago - solicitud de reembolso",
      refundBankAccount: order.pendingRequest.refundBankAccount,
      createdBy: order.buyer,
    });
    await order.save();

    // Contadores
    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.refundsRequested": 1 },
    });

    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (sellerUsr?.email) {
      sendRefundRequestedToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        buyerName: buyer?.firstName || buyer?.username || "El comprador",
      }).catch(() => {});
    }
    createNotification({
      recipient: order.seller,
      type: "order_refund_requested",
      title: "El comprador solicitó cancelar con pago",
      message: `Se registró una solicitud de cancelación con pago para la orden #${order._id.toString().slice(-6).toUpperCase()}. Deberás reembolsar al comprador y luego confirmarlo.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Solicitud de cancelación registrada. La garantía queda retenida hasta que reembolses al comprador y éste confirme la recepción.",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar orden:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CONFIRMAR REEMBOLSO (Solo el VENDEDOR)
 * Se llama cuando el vendedor ya devolvió el dinero al comprador.
 * Cierra la cancelación: libera su colateral y pone la orden en 'cancelled'.
 */
/**
 * VENDEDOR CONFIRMA QUE REEMBOLSÓ al comprador (solo vendedor).
 * Actualiza el estado de la solicitud a "refunded_by_vendor" y notifica al
 * comprador para que confirme la recepción del reintegro.
 * La garantía sigue retenida.
 */
const vendorConfirmsRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.seller.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el vendedor puede confirmar que reembolsó" });
    }

    if (
      !order.pendingRequest?.exists ||
      order.pendingRequest.paidStatus !== "paid"
    ) {
      return res.status(400).json({
        success: false,
        message: "No hay una solicitud de reembolso pendiente en esta orden.",
      });
    }
    if (order.pendingRequest.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Este reembolso ya fue completado.",
      });
    }

    order.pendingRequest.status = "refunded_by_vendor";
    order.orderActions.push({
      type: "refund_confirmed",
      initiator: "seller",
      paidStatus: "paid",
      status: "pending",
      reason: "El vendedor confirmó haber reembolsado al comprador.",
      createdBy: order.seller,
    });
    await order.save();

    const buyer = await User.findById(order.buyer);
    createNotification({
      recipient: order.buyer,
      type: "order_refund_paid_by_vendor",
      title: "El vendedor te reembolsó",
      message: `El vendedor confirmó el reembolso de la orden #${order._id.toString().slice(-6).toUpperCase()}. Verificá la acreditación y confirmá la recepción del reintegro para cerrar la cancelación y liberar la garantía.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Reembolso marcado como realizado por el vendedor.",
      order,
    });
  } catch (error) {
    console.error("Error al confirmar reembolso del vendedor:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * COMPRADOR CONFIRMA QUE RECIBIÓ el reintegro (solo comprador).
 * Es la confirmación final que permite liberar la garantía y cerrar la
 * cancelación. Solo se permite si el vendedor ya confirmó que reembolsó.
 */
const buyerConfirmsRefundReceived = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el comprador puede confirmar la recepción del reintegro" });
    }

    if (
      !order.pendingRequest?.exists ||
      order.pendingRequest.paidStatus !== "paid"
    ) {
      return res.status(400).json({
        success: false,
        message: "No hay una solicitud de reembolso pendiente en esta orden.",
      });
    }
    if (order.pendingRequest.status !== "refunded_by_vendor") {
      return res.status(400).json({
        success: false,
        message:
          "El vendedor todavía no confirmó que te reembolsó. Esperá a que lo haga.",
      });
    }

    const seller = await User.findById(order.seller);
    if (!seller || !seller.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene wallet asociada para liberar colateral.",
      });
    }

    // Liberar colateral (0% fee)
    const blockchainResult = await cancelVendorCollateral(
      order._id.toString(),
      seller.walletAddress,
    );
    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        message: "No se pudo liberar el colateral en la blockchain.",
        error: blockchainResult.error,
      });
    }

        order.status = "cancelled";
    order.releaseTxHash = blockchainResult.txHash;
    order.pendingRequest.status = "completed";
    order.pendingRequest.exists = false;
    order.cancelledBy = "buyer";
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: "Cancelada tras reembolso confirmado y recibido por el comprador.",
    });
    order.orderActions.push({
      type: "refund_confirmed",
      initiator: "buyer",
      paidStatus: "paid",
      status: "completed",
      reason: "El comprador confirmó haber recibido el reintegro.",
      releaseTxHash: blockchainResult.txHash,
      createdBy: order.buyer,
    });
    await order.save();

    await User.findByIdAndUpdate(order.seller, {
      $inc: { "accounting.refundsPending": -1 },
    });

    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (buyer?.email)
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: true,
      }).catch(() => {});
    if (sellerUsr?.email)
      sendOrderCancelledToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: true,
      }).catch(() => {});
        createNotification({
      recipient: order.seller,
      type: "order_refund_received",
      title: "¡Reembolso confirmado por el comprador!",
      message: `El comprador confirmó recibir el reintegro de la orden #${order._id.toString().slice(-6).toUpperCase()}. Tu garantía fue liberada.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating: el vendedor puede calificar al comprador
    // (cancelación iniciada por el comprador).
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se cerró con cancelación. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Reintegro confirmado. Orden cancelada y garantía liberada.",
      order,
    });
  } catch (error) {
    console.error("Error al confirmar recepción de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * VENDEDOR SOLICITA al admin que libere su garantía manualmente.
 * Por seguridad, el vendedor no libera su colateral por sí mismo.
 * Notifica al admin y avisa al comprador.
 */
const requestAdminRelease = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.seller.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el vendedor puede solicitar la liberación de su garantía" });
    }

    if (order.status === "cancelled" || order.status === "completed") {
      return res.status(400).json({
        success: false,
        message: `La orden ya está ${order.status}.`,
      });
    }

    if (!order.collateralTxHash) {
      return res.status(400).json({
        success: false,
        message: "Esta orden no tiene garantía congelada registrada.",
      });
    }

    if (order.releaseRequest?.exists) {
      return res.status(400).json({
        success: false,
        message: "Ya existe una solicitud de liberación de garantía en curso. Esperá la resolución del admin.",
      });
    }

    order.releaseRequest = {
      exists: true,
      requestedBy: order.seller,
      reason: reason || "",
      status: "pending",
      createdAt: new Date(),
    };
    order.orderActions.push({
      type: "admin_intervention",
      initiator: "seller",
      paidStatus: order.pendingRequest?.paidStatus || "unknown",
      status: "pending",
      reason:
        "El vendedor solicita la liberación manual de su garantía al admin. " +
        (reason || ""),
      createdBy: order.seller,
    });
    await order.save();

        // Notificar al admin (por mail e in-app si el admin existe en DB)
    const adminId = process.env.ADMIN_PRIVY_ID;
    const adminUser = adminId ? await User.findOne({ privyDid: adminId }) : null;
    if (adminUser) {
      createNotification({
        recipient: adminUser._id,
        type: "order_admin_release_request",
        title: "Solicitud de liberación de garantía",
        message: `El vendedor solicita liberar la garantía de la orden #${order._id.toString().slice(-6).toUpperCase()}. Revisala en el panel de admin.`,
        data: { orderId: order._id },
      }).catch(() => {});

            // Email al admin para resolución rápida
      if (adminUser.email) {
        const [sellerInfo, buyerInfo] = await Promise.all([
          User.findById(order.seller),
          User.findById(order.buyer),
        ]);
        sendAdminCancellationRequest({
          adminEmail: adminUser.email,
          orderId: order._id,
          amount: order.totalAmount,
          sellerName:
            sellerInfo?.username ||
            sellerInfo?.firstName ||
            "El vendedor",
          buyerName:
            buyerInfo?.firstName || buyerInfo?.username || "El comprador",
          reason: reason || "",
        }).catch((err) =>
          console.error("Falló email de solicitud de cancelación al admin:", err),
        );
      }
    }

    // Notificar al comprador que el vendedor pidió liberar
    createNotification({
      recipient: order.buyer,
      type: "order_release_requested_to_admin",
      title: "El vendedor solicitó liberar su garantía",
      message: `El vendedor solicitó al admin la liberación de la garantía de la orden #${order._id.toString().slice(-6).toUpperCase()}. Si no abonaste o ya recibiste tu reintegro, la plataforma te contactará para confirmarlo.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Solicitud enviada al admin. La garantía se liberará manualmente luego de verificar con el comprador.",
      order,
    });
  } catch (error) {
    console.error("Error al solicitar liberación de garantía:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN LIBERA la garantía manualmente (solo admin).
 * Resuelve la solicitud del vendedor tras verificar con el comprador.
 * Cierra la orden como cancelada y libera el colateral del vendedor.
 */
const adminReleaseGuarantee = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { approve, note } = req.body; // approve: boolean

        const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

        // Permite liberar la garantía manualmente incluso si la orden ya fue
    // cancelada por el admin (flujo: cancelar primero → luego liberar).
    // Se bloquea si la venta se completó. El guard por `releaseTxHash` ya NO
    // existe porque es un FALSO POSITIVO: hubo casos donde una tx se minó y el
    // hash quedó registrado, pero el colateral REALMENTE siguió congelado en el
    // contrato (firma/fee distinto). Por eso primero verificamos on-chain el
    // estado real del lock antes de decidir si hace falta (re)liberar.
    if (order.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "La orden está completada; no se puede liberar la garantía.",
      });
    }

    // Verificación on-chain del lock real. Si el lock ya no existe (liberado de
    // verdad), la liberación es idempotente y solo registramos la acción.
    const lockState = await getOrderLock(order._id.toString());
    const alreadyReleasedOnChain =
      !lockState.success || (lockState.success && lockState.lockUsd === 0);

    if (!approve) {
      if (!order.releaseRequest) order.releaseRequest = {};
      if (!order.releaseRequest.exists) order.releaseRequest.exists = true;
      order.releaseRequest.status = "declined";
      order.orderActions.push({
        type: "admin_intervention",
        initiator: "admin",
        paidStatus: "unknown",
        status: "rejected",
        reason: note || "El admin declinó la solicitud de liberación de garantía.",
        createdBy: req.user?._id,
      });
      await order.save();
      return res.json({
        success: true,
        message: "Solicitud de liberación rechazada.",
        order,
      });
    }

        const seller = await User.findById(order.seller);
    if (!seller || !seller.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene wallet asociada para liberar colateral.",
      });
    }

    // Liberación idempotente: si on-chain el lock ya no existe (liberado de
    // verdad), no re-intentamos la tx (el contrato la rechazaría con
    // "No hay saldo bloqueado"). Solo registramos la acción en la DB.
    let releaseTxHash = "";
    if (alreadyReleasedOnChain) {
      releaseTxHash = order.releaseTxHash || "";
      console.log(
        `[Admin] La orden ${order._id} ya estaba liberada on-chain (lock=0). Solo se registra la acción localmente.`,
      );
    } else {
      const blockchainResult = await cancelVendorCollateral(
        order._id.toString(),
        seller.walletAddress,
      );
      if (!blockchainResult.success) {
        return res.status(500).json({
          success: false,
          message: "No se pudo liberar el colateral en la blockchain.",
          error: blockchainResult.error,
        });
      }
      releaseTxHash = blockchainResult.txHash;
    }

        order.status = "cancelled";
    order.releaseTxHash = releaseTxHash;
    order.cancelledBy = "admin";
    if (!order.releaseRequest) order.releaseRequest = {};
    if (!order.releaseRequest.exists) order.releaseRequest.exists = true;
    order.releaseRequest.status = "approved_released";
    order.releaseRequest.resolvedAt = new Date();
    order.pendingRequest.exists = false;
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: `Garantía liberada manualmente por el admin. ${note || ""}`.trim(),
    });
        order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "unknown",
      status: "completed",
      reason:
        note ||
        "El admin liberó la garantía del vendedor manualmente tras verificación.",
      releaseTxHash: releaseTxHash || undefined,
      createdBy: req.user?._id,
    });
    await order.save();

    // Notificar a ambas partes
    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (buyer?.email)
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    if (sellerUsr?.email)
      sendOrderCancelledToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
        createNotification({
      recipient: order.seller,
      type: "order_guarantee_released",
      title: "Tu garantía fue liberada",
      message: `El admin liberó tu garantía de la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating entre vendedor y comprador (cancelación por admin).
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});
    createNotification({
      recipient: order.buyer,
      type: "rating_reminder",
      title: "Calificá al vendedor",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el vendedor en la página de la orden.`,
      data: { orderId: order._id, ratingType: "seller_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Garantía liberada y orden cancelada por el admin.",
      order,
    });
    } catch (error) {
    console.error("Error al liberar garantía (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN VERIFICA el estado REAL del colateral de una orden on-chain y lo
 * contrasta con lo que la DB cree (releaseTxHash / status).
 *
 * Es la primera acción que debe hacer el admin ante una orden "cancelada pero
 * con colateral congelado": ver si el lock aún existe en el contrato y cuánto
 * tiene bloquedo el vendedor, para decidir si hace falta (re)liberar.
 */
const adminGetCollateralStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const seller = await User.findById(order.seller);
    if (!seller || !seller.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene wallet asociada. No se puede verificar el colateral.",
      });
    }

    // Lectura on-chain en paralelo: lock de la orden y estado del vendedor.
    const [orderLock, vendor] = await Promise.all([
      getOrderLock(order._id.toString()),
      getVendorCollateral(seller.walletAddress),
    ]);

    const lockStillActive =
      orderLock.success === true && orderLock.lockUsd > 0;
    const dbBelievesReleased = Boolean(order.releaseTxHash);

    const reconciled = !lockStillActive; // on-chain no tiene lock = está liberado

    return res.status(200).json({
      success: true,
      orderId: order._id,
      orderStatus: order.status,
      collateralTxHash: order.collateralTxHash,
      releaseTxHash: order.releaseTxHash || null,
      db: {
        believesReleased: dbBelievesReleased,
        believesLocked: !dbBelievesReleased,
      },
      onChain: {
        orderLockUsd: orderLock.success ? orderLock.lockUsd : null,
        orderLockActive: lockStillActive,
        vendorTotalCollateral: vendor.success ? vendor.totalCollateral : null,
        vendorLockedCollateral: vendor.success ? vendor.lockedCollateral : null,
        vendorAvailable: vendor.success ? vendor.available : null,
      },
      reconciled,
      resolucion_requerida:
        lockStillActive
          ? "El colateral SIGUE congelado on-chain. Usá 'release_guarantee' para liberarlo (o el botón 'Liberar Garantía (Admin)' que ahora está disponible aunque exista releaseTxHash)."
          : "El colateral YA está liberado on-chain. Solo resta alinear la DB (la orden puede marcarse como cancelada si corresponde).",
    });
  } catch (error) {
    console.error("Error al verificar estado del colateral (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN CANCELA la orden manualmente (solo admin).
 * A diferencia de "adminReleaseGuarantee", acá SOLO se marca la orden como
 * cancelada SIN liberar la garantía. La liberación sigue siendo un paso
 * manual independiente: el admin primero cancela y, tras verificar con el
 * comprador que no hubo pago (o que recibió su reintegro), libera el
 * colateral recién con "release-guarantee".
 */
const adminCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (["cancelled", "completed", "expired"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `La orden ya está ${order.status}.`,
      });
    }

        order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = "admin";
    // Cerramos cualquier solicitud en curso (reembolso / liberación) sin
    // tocar el colateral: eso se resuelve por separado con la liberación.
    if (order.pendingRequest?.exists) {
      order.pendingRequest.status = "completed";
      order.pendingRequest.exists = false;
    }
    if (order.releaseRequest?.exists) {
      order.releaseRequest.status = "resolved_by_cancel";
    }
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: "Cancelada manualmente por el admin.",
    });
    order.orderActions.push({
      type: "admin_cancel",
      initiator: "admin",
      paidStatus: "unknown",
      status: "completed",
      reason: "El admin canceló la orden manualmente (liberación de garantía pendiente y manual).",
      createdBy: req.user?._id,
    });
    await order.save();

    // Notificar a ambas partes
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);
    if (buyer?.email) {
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    }
    if (seller?.email) {
      sendOrderCancelledToVendor({
        vendorEmail: seller.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    }
    createNotification({
      recipient: order.buyer,
      type: "order_cancelled",
      title: "Tu compra fue cancelada",
      message: `El admin canceló la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
      data: { orderId: order._id },
    }).catch(() => {});
        createNotification({
      recipient: order.seller,
      type: "order_cancelled",
      title: "Tu venta fue cancelada",
      message: `El admin canceló la orden #${order._id.toString().slice(-6).toUpperCase()}. La liberación de tu garantía se gestiona aparte.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating mutuo (cancelación por admin).
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});
    createNotification({
      recipient: order.buyer,
      type: "rating_reminder",
      title: "Calificá al vendedor",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el vendedor en la página de la orden.`,
      data: { orderId: order._id, ratingType: "seller_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Orden cancelada por el admin. La garantía sigue retenida y se libera manualmente aparte.",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar orden (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * REINTENTAR COLATERAL (estado "awaiting_collateral" → "pending_payment").
 * Se llama cuando el vendedor deposita la garantía y quiere activar la orden.
 * La pueden invocar:
 *   - El VENDEDOR de la orden (tras depositar, pulsa "Deposité, activar orden").
 *   - El ADMIN (si verifica que el depósito se hizo y lo activa manualmente).
 *
 * Delega la lógica en resolveCollateralHold (idempotente y a prueba de
 * concurrencia: solo una llamada "gana" y crea el lock on-chain).
 */
const retryCollateral = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.status !== "awaiting_collateral") {
      return res.status(400).json({
        success: false,
        message: `La orden ya no está esperando colateral (estado actual: ${order.status}).`,
      });
    }

    const isSeller = order.seller.toString() === userId;
    const isAdmin = req.user.role === "admin" || req.user.privyDid === process.env.ADMIN_PRIVY_ID;
    if (!isSeller && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Solo el vendedor o el admin pueden activar el colateral de esta orden.",
      });
    }

    // Verificamos que el hold no haya vencido antes de intentar depositar.
    if (new Date(order.collateralHold.expiresAt) < new Date()) {
      // El hold venció. Lo marcamos como expirado (penalización al vendedor)
      // y avisamos que ya no se puede reactivar por esta vía.
      await expireCollateralHold(order);
      return res.status(409).json({
        success: false,
        message: "El plazo para depositar colateral ya venció. Esta solicitud de compra fue cancelada.",
        order,
      });
    }

    const result = await resolveCollateralHold(order._id.toString());

        if (!result.success) {
      // Mostramos el detalle (p. ej. saldo insuficiente en la wallet registrada)
      // si existe; si no, el mensaje genérico de reintento.
      const message =
        result.error && typeof result.error === "string"
          ? result.error
          : "No se pudo activar la orden. Revisá que hayas depositado la garantía (USDT) y reintentá.";
      return res.status(400).json({
        success: false,
        message,
        retryable: result.retryable !== false,
        insufficientFunds: result.insufficientFunds || false,
        error: result.error,
      });
    }

    // Notificar al comprador que su orden ya está activa.
    createNotification({
      recipient: order.buyer,
      type: "order_activated",
      title: "¡Tu compra fue activada!",
      message: `El vendedor depositó la garantía y tu orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()} ya está lista para que la abones.`,
      data: { orderId: order._id, totalAmount: order.totalAmount },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Orden activada: el colateral fue congelado y ya podés proceder con el pago.",
      order: result.order,
      txHash: result.txHash,
    });
  } catch (error) {
    console.error("Error al reintentar colateral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CANCELAR UN HOLD DE COLATERAL ("buscar otro vendedor").
 * Cierra la orden en estado "awaiting_collateral" sin tocar blockchain
 * (en este estado todavía NO se congeló ningún colateral on-chain, la orden
 * recién pasa a reservar capacidad). La pueden invocar:
 *   - El COMPRADOR: decide no esperar más y buscar este producto en otro
 *     vendedor. Se marca como cancelada (no queda nada bloqueado).
 *   - El VENDEDOR: decide que no puede cubrir la garantía y libera el "hold"
 *     que tenía reservando capacidad (para no penalizar su cupo).
 */
const cancelCollateralHold = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.status !== "awaiting_collateral") {
      return res.status(400).json({
        success: false,
        message: `La orden no está en estado de espera de colateral (estado actual: ${order.status}).`,
      });
    }

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({
        success: false,
        message: "No tenés permisos para cancelar este hold de colateral.",
      });
    }

        // En "awaiting_collateral" no hay colateral on-chain congelado, así que no
    // hacemos transiciones a blockchain. Solo cerramos la orden como cancelada
    // y liberamos la reserva de capacidad del vendedor.
        order.collateralHold.status = "cancelled";
    order.collateralHold.cancelledAt = new Date();
    order.cancelledBy = isBuyer ? "buyer" : "seller";

    await transitionToStatus(
      order,
      "cancelled",
      isBuyer
        ? "El comprador canceló la espera de colateral y buscará este producto en otro vendedor."
        : "El vendedor no pudo cubrir la garantía de esta orden.",
    );

    // ══ CONTABILIZACIÓN (no penaliza; solo lleva la cuenta para que el admin
    //    decida qué hacer). Órdenes que no se concretan por falta de colateral
    //    del vendedor.
    //  - El VENDEDOR rechazó  → collateralRejectedBySeller (+1 al vendedor)
    //  - El COMPRADOR canceló → collateralHoldCancelledByBuyer (+1 al vendedor,
    //    ya que la inacción fue del vendedor, no culpa del comprador).
    if (isSeller) {
      await User.findByIdAndUpdate(order.seller, {
        $inc: { "accounting.collateralRejectedBySeller": 1 },
      });
    } else {
      await User.findByIdAndUpdate(order.seller, {
        $inc: { "accounting.collateralHoldCancelledByBuyer": 1 },
      });
    }

    // Si es el VENDEDOR quien rechaza, avisamos al comprador de inmediato para
    // que no quede esperando: notificación in-app + mail.
    if (isSeller) {
      const buyer = await User.findById(order.buyer);
      createNotification({
        recipient: order.buyer,
        type: "order_cancelled",
        title: "El vendedor rechazó tu orden",
        message: `El vendedor no pudo cubrir la garantía y rechazó la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()}. Buscá este producto en otro vendedor.`,
        data: { orderId: order._id },
      }).catch((err) =>
        console.error("Falló notif de rechazo al comprador:", err),
      );
      if (buyer?.email) {
        sendOrderCancelledToBuyer({
          buyerEmail: buyer.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch((err) =>
          console.error("Falló email de rechazo al comprador:", err),
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "La solicitud en espera de colateral fue cancelada. No se descontó ni se congeló nada.",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar hold de colateral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════════════
// ESCROW DE PAGOS EN CRIPTO (NeroEscrow)
// ════════════════════════════════════════════════════════════════════════

/**
 * COMPRADOR CONFIRMA que fondeó el escrow on-chain.
 * El front, tras firmar fundOrder() con su wallet de Privy, envía el txHash.
 * El backend VERIFICA on-chain que el escrow quedó fondeado (lección aprendida:
 * no confiar solo en que una tx se minó) y actualiza el estado de la orden a
 * "funded". Solo entonces el vendedor puede despachar.
 */
const confirmEscrowFunding = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fundTxHash, tokenAddress, token } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el comprador puede confirmar el fondeo del escrow" });
    }

    if (order.payment?.method !== "crypto") {
      return res.status(400).json({
        success: false,
        message: "Esta orden no usa pago en criptomonedas.",
      });
    }

    if (order.payment?.status === "funded") {
      return res.status(200).json({
        success: true,
        alreadyFunded: true,
        message: "El escrow ya estaba marcado como fondeado.",
        order,
      });
    }
    if (!["funding", "unpaid"].includes(order.payment?.status)) {
      return res.status(400).json({
        success: false,
        message: `No se puede confirmar el fondeo en este estado de pago: ${order.payment?.status}.`,
      });
    }
    if (!fundTxHash) {
      return res.status(400).json({
        success: false,
        message: "Falta el hash de la transacción del fondeo.",
      });
    }

    // Verificamos on-chain que el escrow quedó fondeado y que el monto retenido
    // coincida con lo esperado (total productos + envío en USD).
    const { verifyOrderFunded } = await import("../services/escrowServices.js");
    const verification = await verifyOrderFunded(
      order._id.toString(),
      order.financials.totalUsd + order.financials.shippingCostUsd,
    );

    if (!verification.success || !verification.funded) {
      return res.status(409).json({
        success: false,
        message:
          "No pudimos verificar el fondeo on-chain. ¿Estás seguro de que hiciste la transacción al contrato correcto?",
        error: verification.error || "El escrow no está fondeado on-chain.",
        fundTxHash,
      });
    }
    if (verification.amountMatches === false) {
      return res.status(409).json({
        success: false,
        message:
          "El monto retenido on-chain no coincide con el total de la orden. Verificá el importe fondeado.",
        escrow: verification.escrow,
      });
    }

    // Actualizamos la orden y el sub-estado de pago.
    order.payment.status = "funded";
    order.payment.fundTxHash = fundTxHash;
    order.payment.tokenAddress = tokenAddress || verification.escrow?.token || order.payment.tokenAddress;
    order.payment.token = token || order.payment.token;
    order.payment.amountUsdRetained =
      order.financials.totalUsd + order.financials.shippingCostUsd;
    order.payment.fundedAt = new Date();
    order.statusHistory.push({
      status: "paid",
      changedAt: new Date(),
      comment: "El comprador fondeó el escrow en cripto (USDT). Fondos retenidos en el contrato.",
    });
    // Mapeamos a "paid" para que el vendedor pueda despachar (ya no está pendiente de pago).
    order.status = "paid";
    order.paymentVerifiedAt = new Date();

    // Notificamos al vendedor que puede despachar.
    const seller = await User.findById(order.seller);
    if (seller?.email) {
      sendPaymentConfirmedToVendor({
        vendorEmail: seller.email,
        orderId: order._id,
        amount: order.totalAmount,
      }).catch((err) => console.error("Falló notif pago al vendedor:", err));
    }
    if (seller) {
      createNotification({
        recipient: seller._id,
        type: "payment_confirmed",
        title: "El comprador fondeó el escrow",
        message: `El comprador depositó los USDT en el contrato de garantía para la orden #${order._id.toString().slice(-6).toUpperCase()}. Ya podés despachar.`,
        data: { orderId: order._id, totalAmount: order.totalAmount },
      }).catch((err) => console.error("Falló notif fondeo a vendedor:", err));
    }

    await order.save();
    return res.status(200).json({
      success: true,
      message: "Escrow verificado y orden activada. El vendedor puede despachar.",
      order,
    });
  } catch (error) {
    console.error("Error al confirmar fondeo del escrow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Ver el estado on-chain del escrow de una orden (útil para diagnóstico).
 * Cualquier participante (comprador/vendedor) o admin puede consultarlo.
 */
const getEscrowStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isParticipant =
      order.buyer.toString() === userId || order.seller.toString() === userId;
    const isAdmin = req.user.role === "admin" || req.user.privyDid === process.env.ADMIN_PRIVY_ID;
    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ message: "No tenés permisos para ver esta orden" });
    }

    const { getEscrow } = await import("../services/escrowServices.js");
    const escrow = await getEscrow(order._id.toString());

    return res.status(200).json({
      success: true,
      order,
      escrow,
    });
  } catch (error) {
    console.error("Error al obtener estado del escrow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CANCELACIÓN CON ESCROW (comprador / vendedor).
 * A diferencia del flujo de transferencia bancaria (que requiere datos bancarios
 * para el reembolso), acá si el escrow ya está fondeado, el admin firma
 * cancelOrder() del contrato y devuelve el 100% de los USDT al comprador.
 *
 * Se distingue por order.payment.method === "crypto" && order.payment.status === "funded".
 */
const cancelCryptoOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;

    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: "No tenés permisos para cancelar esta orden" });
    }

    // Solo aplica a órdenes de pago crypto y en estados previos a liberar.
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({
        success: false,
        message: "Esta orden no usa pago en criptomonedas. Usá el flujo de cancelación bancaria.",
      });
    }

    const cancellable = ["pending_payment", "verifying_payment", "paid", "funded"].includes(order.status);
    if (!cancellable) {
      return res.status(400).json({
        success: false,
        message: `No se puede cancelar la orden en estado: ${order.status}`,
      });
    }

    if (order.payment?.status === "funded") {
      // El comprador ya fondeó el escrow → devolvemos el 100% vía el contrato.
      const { cancelOrderEscrow } = await import("../services/escrowServices.js");
      const escrowResult = await cancelOrderEscrow(order._id.toString());
      if (!escrowResult.success) {
        return res.status(500).json({
          success: false,
          message: "No se pudo devolver los USDT al comprador en la blockchain.",
          error: escrowResult.error,
        });
      }

      order.payment.status = "cancelled_refunded";
      order.payment.cancelTxHash = escrowResult.txHash;
      order.payment.cancelledRefundedAt = new Date();
      order.payment.releasedAt = new Date(); // se usa closedAt para no duplicar estado
      order.cancelledBy = isBuyer ? "buyer" : "seller";
      order.status = "cancelled";
      order.cancelledAt = new Date();
      order.statusHistory.push({
        status: "cancelled",
        changedAt: new Date(),
        comment: `${isBuyer ? "El comprador" : "El vendedor"} canceló la orden. Los USDT del escrow fueron devueltos al comprador (reembolso on-chain).`,
      });
      order.orderActions.push({
        type: "cancel_executed",
        initiator: isBuyer ? "buyer" : "seller",
        paidStatus: "paid",
        status: "completed",
        reason: "Cancelación de orden con escrow fondeado. Reembolso on-chain al comprador.",
        releaseTxHash: escrowResult.txHash,
        createdBy: order.buyer,
      });
      await order.save();

      // Contadores
      await User.findByIdAndUpdate(order.buyer, {
        $inc: { "accounting.cancellationsAsBuyer": 1 },
      });

      // Notificaciones
      if (isBuyer) {
        const buyer = await User.findById(order.buyer);
        if (buyer?.email)
          sendOrderCancelledToBuyer({
            buyerEmail: buyer.email,
            orderId: order._id,
            amount: order.totalAmount,
            withRefund: true,
          }).catch(() => {});
      }
      const seller = await User.findById(order.seller);
      if (seller?.email)
        sendOrderCancelledToVendor({
          vendorEmail: seller.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch(() => {});
      createNotification({
        recipient: order.seller,
        type: "order_cancelled",
        title: "Orden cancelada",
        message: `La orden #${order._id.toString().slice(-6).toUpperCase()} fue cancelada. Los USDT fueron devueltos al comprador.`,
        data: { orderId: order._id },
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: "Orden cancelada. Los USDT del escrow fueron devueltos al comprador.",
        order,
        cancelTxHash: escrowResult.txHash,
      });
    }

    // Si el escrow aún NO está fondeado (funding/unpaid), es una cancelación
    // simple sin reembolso on-chain.
    order.cancelledBy = isBuyer ? "buyer" : "seller";
    order.status = "cancelled";
    order.cancelledAt = new Date();
    if (order.payment) {
      order.payment.status = "cancelled_refunded";
    }
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: `${isBuyer ? "El comprador" : "El vendedor"} canceló la orden antes de fondear el escrow.`,
    });
    order.orderActions.push({
      type: "cancel_executed",
      initiator: isBuyer ? "buyer" : "seller",
      paidStatus: "not_paid",
      status: "completed",
      reason: "Cancelación de orden crypto antes de fondear el escrow.",
      createdBy: order.buyer,
    });
    await order.save();

    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.cancellationsAsBuyer": 1 },
    });

    const buyer = await User.findById(order.buyer);
    if (buyer?.email)
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    const sellerUsr = await User.findById(order.seller);
    if (sellerUsr?.email)
      sendOrderCancelledToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_cancelled",
      title: "Orden cancelada",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} fue cancelada antes del fondeo del escrow.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Orden cancelada (escrow aún no fondeado).",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar orden crypto:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN: LIBERA el escrow manualmente (solo admin).
 * Cuando el comprador confirmó la recepción (o se resolvió un reclamo a favor
 * del vendedor), el admin firma releaseOrder() y el contrato envía el neto al
 * vendedor y el fee (ESCRoy feeBps) a la feeWallet.
 */
const adminReleaseEscrow = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.payment?.method !== "crypto") {
      return res.status(400).json({
        success: false,
        message: "Esta orden no usa pago en criptomonedas (escrow).",
      });
    }
    if (order.payment?.status !== "funded") {
      return res.status(400).json({
        success: false,
        message: `El escrow no está fondeado (estado: ${order.payment?.status}).`,
      });
    }

    const { releaseOrderEscrow } = await import("../services/escrowServices.js");
    const result = await releaseOrderEscrow(order._id.toString());
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "No se pudo liberar el escrow on-chain.",
        error: result.error,
      });
    }

    order.payment.status = "released";
    order.payment.releaseTxHash = result.txHash;
    order.payment.releasedAt = new Date();
    order.status = "completed";
    order.completedAt = new Date();
    order.statusHistory.push({
      status: "completed",
      changedAt: new Date(),
      comment: "Escrow liberado manualmente por el admin (fondos enviados al vendedor).",
    });
    order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "paid",
      status: "completed",
      reason: "El admin liberó el escrow manualmente.",
      releaseTxHash: result.txHash,
      createdBy: req.user?._id,
    });
    await order.save();

    // Actualizar métricas de venta completada (paridad con el flujo normal).
    await User.findByIdAndUpdate(order.seller, {
      $inc: { "accounting.completedSales": 1, "shop.totalSalesCount": 1 },
    });
    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.completedPurchases": 1 },
    });
    for (const item of order.itemsSnapshot) {
      const qty = item.quantity || 1;
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { sold: qty, stock: -qty },
      });
    }

    const buyerThis = await User.findById(order.buyer);
    if (buyerThis?.email)
      sendOrderCompletedToBuyer({
        buyerEmail: buyerThis.email,
        orderId: order._id,
        amount: order.totalAmount,
      }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Escrow liberado y orden completada por el admin.",
      order,
      releaseTxHash: result.txHash,
    });
  } catch (error) {
    console.error("Error al liberar escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN: CANCELA y reembolsa el escrow al comprador (solo admin).
 * El admin firma cancelOrder() del contrato y los USDT vuelven al comprador.
 */
const adminCancelEscrow = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.payment?.method !== "crypto") {
      return res.status(400).json({
        success: false,
        message: "Esta orden no usa pago en criptomonedas (escrow).",
      });
    }
    if (order.payment?.status !== "funded") {
      return res.status(400).json({
        success: false,
        message: `El escrow no está fondeado (estado: ${order.payment?.status}).`,
      });
    }

    const { cancelOrderEscrow } = await import("../services/escrowServices.js");
    const result = await cancelOrderEscrow(order._id.toString());
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "No se pudo cancelar/dev oler el escrow on-chain.",
        error: result.error,
      });
    }

    order.payment.status = "cancelled_refunded";
    order.payment.cancelTxHash = result.txHash;
    order.payment.cancelledRefundedAt = new Date();
    order.payment.releasedAt = new Date();
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = "admin";
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
            comment: "Escrow cancelado y reembolsado al comprador por el admin.",
    });
    order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "paid",
      status: "completed",
      reason:
        "El admin canceló el escrow y devolvió el 100% de los USDT al comprador.",
      releaseTxHash: result.txHash,
      createdBy: req.user?._id,
    });
    await order.save();

    // Actualizar métricas del comprador (cancelación).
    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.cancellationsAsBuyer": 1 },
    });

    // Notificar a ambas partes.
    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (buyer?.email)
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: true,
      }).catch(() => {});
    if (sellerUsr?.email)
      sendOrderCancelledToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    createNotification({
      recipient: order.buyer,
      type: "order_cancelled",
      title: "Tu compra fue cancelada y tu dinero devuelto",
      message: `El admin canceló la orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()} y los USDT del escrow fueron devueltos a tu billetera.`,
      data: { orderId: order._id },
    }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_cancelled",
      title: "Tu venta fue cancelada (escrow reembolsado)",
      message: `El admin canceló la orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()} y devolvió los USDT al comprador.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating mutuo (cancelación por admin).
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});
    createNotification({
      recipient: order.buyer,
      type: "rating_reminder",
      title: "Calificá al vendedor",
      message: `La orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el vendedor en la página de la orden.`,
      data: { orderId: order._id, ratingType: "seller_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Escrow cancelado y orden cancelada por el admin. Los USDT fueron devueltos al comprador.",
      order,
      cancelTxHash: result.txHash,
    });
  } catch (error) {
    console.error("Error al cancelar escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN: ACTUALIZA el fee global del escrow en el contrato (solo admin).
 * El fee es GLOBAL y se cobra on-chain al liberar el escrow (releaseOrder).
 * Se expresa en puntos base (bps): 300 = 3%, 100 = 1%, 500 = 5%, máx 5000.
 */
const adminUpdateEscrowFee = async (req, res) => {
  try {
    const { feeBps } = req.body;

    if (
      typeof feeBps !== "number" ||
      isNaN(feeBps) ||
      feeBps < 0 ||
      feeBps > 5000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "El fee debe ser un número entero de puntos base entre 0 y 5000 (5000 = 50%).",
      });
    }

    const { setEscrowFeeBps } = await import("../services/escrowServices.js");
    const result = await setEscrowFeeBps(Math.round(feeBps));
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "No se pudo actualizar el fee del escrow on-chain.",
        error: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Fee del escrow actualizado a ${result.feeBps} bps (${(result.feeBps / 100).toFixed(2)}%).`,
      feeBps: result.feeBps,
      txHash: result.txHash,
    });
  } catch (error) {
    console.error("Error al actualizar fee del escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * COMPRADOR REPORTA UN PROBLEMA con su pedido dispachado.
 * Marca la orden en estado DISPUTA: se congela la liberación del colateral
 * (on-chain si el dinero está bloqueado en el escrow de garantía) y se notifica
 * al admin para que lo resuelva manualmente. A partir de acá el comprador NO
 * puede marcar la orden como recibida hasta que el admin intervenga.
 */
const openDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { issueType, description } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el comprador de la orden puede abrir una disputa." });
    }

    // Solo se puede disputar mientras el pedido está despachado/en curso.
    if (!["shipped"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `No se puede abrir una disputa en el estado actual (${order.status}). Solo mientras el pedido está en camino.`,
      });
    }
    if (order.dispute?.exists) {
      return res.status(400).json({
        success: false,
        message: "Ya hay una disputa abierta en esta orden. El admin la resolverá.",
      });
    }

    // Se congela la liberación del colateral on-chain (si hay saldo bloqueado).
    // Si el contrato no tiene lock (ej. orden crypto), igualmente marcamos la
    // disputa en la DB y notificamos al admin.
    let txHash = "";
    try {
      const bc = await triggerOrderDispute(order._id.toString());
      if (bc.success) txHash = bc.txHash;
    } catch (bcErr) {
      console.warn("[Dispute] No se pudo congelar on-chain (posible escrow):", bcErr.message);
    }

    order.dispute = {
      exists: true,
      raisedBy: order.buyer,
      issueType:
        issueType ||
        "El comprador reportó un problema con el pedido (sin especificar).",
      description: description || "",
      status: "open",
      txHash: txHash || "",
      createdAt: new Date(),
    };
    order.orderActions.push({
      type: "dispute_opened",
      initiator: "buyer",
      paidStatus: "paid",
      status: "open",
      reason: issueType || "Producto incorrecto, dañado o no recibido.",
      description: description || "",
      disputeTxHash: txHash || undefined,
      createdBy: order.buyer,
    });
    await order.save();

    // Notificar al admin (in-app + mail si existe).
    const adminId = process.env.ADMIN_PRIVY_ID;
    const adminUser = adminId ? await User.findOne({ privyDid: adminId }) : null;
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);
    if (adminUser) {
      createNotification({
        recipient: adminUser._id,
        type: "order_disputed",
        title: "Disputa abierta en una orden",
        message: `El comprador abrió una disputa en la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()} (${issueType || "problema con el pedido"}). El colateral queda retenido hasta resolver.`,
        data: { orderId: order._id },
      }).catch(() => {});
    }

    // Notificar al comprador y al vendedor.
    createNotification({
      recipient: order.buyer,
      type: "order_disputed",
      title: "Disputa abierta",
      message: `Registramos tu problema en la orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()}. El admin la revisará. Mientras tanto los fondos del vendedor quedan retenidos.`,
      data: { orderId: order._id },
    }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_disputed",
      title: "Tu venta fue disputada",
      message: `El comprador reportó un problema con la orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()}. Tu garantía queda retenida hasta que el admin resuelva la disputa.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Disputa registrada. El admin revisará el caso y la garantía del vendedor queda retenida hasta la resolución.",
      order,
    });
  } catch (error) {
    console.error("Error al abrir disputa:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  createOrder,
  getMyOrders,
  markAsPaid,
  getOrderById,
  updateOrder,
  cancelOrder,
  vendorConfirmsRefund,
  buyerConfirmsRefundReceived,
  requestAdminRelease,
  adminReleaseGuarantee,
  adminGetCollateralStatus,
  adminCancelOrder,
  retryCollateral,
  cancelCollateralHold,
  confirmEscrowFunding,
  getEscrowStatus,
  cancelCryptoOrder,
  adminReleaseEscrow,
  adminCancelEscrow,
  adminUpdateEscrowFee,
  openDispute,
};
