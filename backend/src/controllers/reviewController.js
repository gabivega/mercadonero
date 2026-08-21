import Review from "../models/Review.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { createNotification } from "../services/notificationService.js";

/**
 * Valida permisos y coherencia general del rating antes de persistir.
 * Devuelve un objeto { error } o { ok }.
 */
const validateRating = ({ order, type, author, productId, targetUser }) => {
  const orderId = order._id.toString();
  const authorStr = author.toString();

  const isBuyer = order.buyer.toString() === authorStr;
  const isSeller = order.seller.toString() === authorStr;

  if (!isBuyer && !isSeller) {
    return { error: "Solo el comprador o el vendedor pueden calificar esta orden." };
  }

  switch (type) {
    case "product_rating":
      if (!isBuyer) return { error: "Solo el comprador puede calificar los productos." };
      // El comprador debe haber completado la compra para calificar el producto.
      if (order.status !== "completed") {
        return { error: "Podés calificar el producto solo cuando la orden esté completada." };
      }
      // Validar que el producto pertenece a la orden
      if (!productId || !order.itemsSnapshot.some((i) => i.productId?.toString() === productId.toString())) {
        return { error: "El producto a calificar no pertenece a esta orden." };
      }
      break;

    case "seller_rating":
      if (!isBuyer) return { error: "Solo el comprador puede calificar al vendedor." };
      // Solo orden completada o cancelada por el vendedor
      if (order.status !== "completed" && order.status !== "cancelled") {
        return { error: "Solo podés calificar al vendedor en órdenes completadas o canceladas." };
      }
      if (order.status === "cancelled" && order.cancelledBy === "buyer") {
        return { error: "Esta orden fue cancelada por el comprador; el rating de vendedor no aplica." };
      }
      if (targetUser) {
        if (targetUser.toString() !== order.seller.toString()) {
          return { error: "El usuario a calificar no es el vendedor de esta orden." };
        }
      }
      break;

    case "buyer_rating":
      if (!isSeller) return { error: "Solo el vendedor puede calificar al comprador." };
      // Solo orden completada o cancelada por el comprador
      if (order.status !== "completed" && order.status !== "cancelled") {
        return { error: "Solo podés calificar al comprador en órdenes completadas o canceladas." };
      }
      if (order.status === "cancelled" && order.cancelledBy === "seller") {
        return { error: "Esta orden fue cancelada por el vendedor; el rating de comprador no aplica." };
      }
      if (targetUser) {
        if (targetUser.toString() !== order.buyer.toString()) {
          return { error: "El usuario a calificar no es el comprador de esta orden." };
        }
      }
      break;

    default:
      return { error: "Tipo de rating inválido." };
  }

  return { ok: true };
};

/**
 * POST /api/review/product  → crear rating de producto (comprador → producto)
 */
export const createProductReview = async (req, res) => {
  try {
    const { orderId, productId, rating, comment } = req.body;
    const author = req.user._id;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Orden no encontrada." });

    const validation = validateRating({
      order,
      type: "product_rating",
      author,
      productId,
    });
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Debés indicar una calificación de 1 a 5 estrellas.",
      });
    }

    // Evitar duplicados (índice único también lo garantiza)
    const already = await Review.findOne({ orderId, type: "product_rating", author });
    if (already) {
      return res.status(400).json({
        success: false,
        message: "Ya calificaste este producto de esta orden.",
      });
    }

    const review = await Review.create({
      orderId,
      author,
      targetType: "product",
      type: "product_rating",
      productId,
      rating,
      comment: comment || "",
    });

    // Recalcular el rating promedio del producto
    const productReviews = await Review.find({ productId, type: "product_rating" }).select("rating");
    if (productReviews.length > 0) {
      const avg =
        productReviews.reduce((acc, r) => acc + r.rating, 0) / productReviews.length;
      await Product.findByIdAndUpdate(productId, { rating: Math.round(avg * 10) / 10 });
    }

    // Notificación in-app del producto al vendedor
    const product = await Product.findById(productId).select("seller name");
    if (product) {
      createNotification({
        recipient: product.seller,
        type: "review_received",
        title: "¡Recibiste una nueva reseña de producto!",
        message: `Tu producto "${product.name}" recibió ${rating} ${rating === 1 ? "estrella" : "estrellas"}.`,
        data: { orderId, productId },
      }).catch(() => {});
    }

    return res.status(201).json({ success: true, review });
  } catch (error) {
    console.error("Error creando rating de producto:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/review/user  → crear rating de usuario (comprador→vendedor o vendedor→comprador)
 * Utiliza `type` = "seller_rating" | "buyer_rating".
 */
export const createUserReview = async (req, res) => {
  try {
    const { orderId, type, recommends, comment } = req.body;
    const author = req.user._id;

    if (!["seller_rating", "buyer_rating"].includes(type)) {
      return res.status(400).json({ success: false, message: "Tipo de rating inválido." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Orden no encontrada." });

    // targetUser se determina según el rol que califica
    const targetUser =
      type === "seller_rating" ? order.seller : order.buyer;

    const validation = validateRating({ order, type, author, targetUser });
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    if (typeof recommends !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Debés indicar si lo recomendás (manito arriba/abajo).",
      });
    }

    const already = await Review.findOne({ orderId, type, author });
    if (already) {
      return res.status(400).json({
        success: false,
        message:
          type === "seller_rating"
            ? "Ya calificaste a este vendedor en esta orden."
            : "Ya calificaste a este comprador en esta orden.",
      });
    }

    const review = await Review.create({
      orderId,
      author,
      targetType: "user",
      type,
      targetUser,
      recommends,
      comment: comment || "",
    });

    // Recalcular métricas del usuario calificado
    await recomputeUserRating(targetUser);

    // Notificación in-app a la persona calificada
    createNotification({
      recipient: targetUser,
      type: "review_received",
      title: "Recibiste una nueva calificación",
      message: recommends
        ? "Te recomendaron 👍. Ingresá a la orden para ver la reseña."
        : "Recibiste una calificación 👎. Ingresá a la orden para ver la reseña.",
      data: { orderId },
    }).catch(() => {});

    return res.status(201).json({ success: true, review });
  } catch (error) {
    console.error("Error creando rating de usuario:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Recalcula el promedio (0 a 1) de recomendaciones de un usuario y lo
 * expone como "rating" (porcentaje de recomendación). Actualiza también
 * el arreglo `shop.reviews` con estadísticas agregadas.
 */
const recomputeUserRating = async (userId) => {
  const reviews = await Review.find({
    targetUser: userId,
    type: { $in: ["seller_rating", "buyer_rating"] },
  }).select("recommends");

  if (reviews.length === 0) {
    await User.findByIdAndUpdate(userId, { $set: { rating: 0 } });
    return;
  }

  const positives = reviews.filter((r) => r.recommends).length;
  const pct = Math.round((positives / reviews.length) * 100);

  await User.findByIdAndUpdate(userId, {
    $set: {
      "rating": pct, // 0..100 (porcentaje de recomendación)
      "shop.rating": pct,
    },
  });
};

/**
 * GET /api/review/order/:orderId → devuelve los ratings que ya emitió el
 * usuario logueado sobre esa orden (para saber si puede calificar o no).
 */
export const getOrderReviews = async (req, res) => {
  try {
    const { orderId } = req.params;
    const author = req.user._id;

    const reviews = await Review.find({ orderId, author }).lean();

    // Agregar el rol del usuario para el front (si es buyer o seller)
    const order = await Order.findById(orderId).select("buyer seller status cancelledBy");
    let role = null;
    if (order) {
      if (order.buyer.toString() === author.toString()) role = "buyer";
      else if (order.seller.toString() === author.toString()) role = "seller";
    }

    return res.json({
      success: true,
      role,
      status: order?.status || null,
      cancelledBy: order?.cancelledBy || null,
      reviews: reviews.map((r) => ({
        _id: r._id,
        type: r.type,
        rating: r.rating,
        recommends: r.recommends,
        comment: r.comment,
        productId: r.productId,
      })),
    });
  } catch (error) {
    console.error("Error obteniendo reseñas de la orden:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/review/product/:productId → ratings públicos de un producto.
 * Devuelve también el promedio calculado.
 */
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ productId, type: "product_rating" })
      .populate("author", "username name avatar")
      .sort({ createdAt: -1 })
      .lean();

    const avg =
      reviews.length > 0
        ? Math.round(
            (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10,
          ) / 10
        : 0;

    return res.json({
      success: true,
      average: avg,
      count: reviews.length,
      reviews: reviews.map((r) => ({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        author: {
          username: r.author?.username,
          name: r.author?.name,
          avatar: r.author?.avatar,
        },
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error obteniendo reseñas del producto:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/review/user/:userId → ratings públicos de un usuario
 * (recomendaciones recibidas como vendedor y como comprador).
 */
export const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    const reviews = await Review.find({
      targetUser: userId,
      type: { $in: ["seller_rating", "buyer_rating"] },
    })
      .populate("author", "username name avatar")
      .sort({ createdAt: -1 })
      .lean();

    const total = reviews.length;
    const positives = reviews.filter((r) => r.recommends).length;

    return res.json({
      success: true,
      total,
      positive: positives,
      negative: total - positives,
      recommendation: total > 0 ? Math.round((positives / total) * 100) : 0,
      reviews: reviews.map((r) => ({
        _id: r._id,
        type: r.type,
        recommends: r.recommends,
        comment: r.comment,
        author: {
          username: r.author?.username,
          name: r.author?.name,
          avatar: r.author?.avatar,
        },
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error obteniendo reviews del usuario:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
