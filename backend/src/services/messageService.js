import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { createNotification } from "./notificationService.js";

/** Estados de orden considerados "abiertos" (aún en curso). */
export const OPEN_ORDER_STATUSES = [
  "pending_payment",
  "verifying_payment",
  "paid",
  "shipped",
];

/**
 * Verifica que entre dos usuarios exista una orden abierta
 * (uno como comprador, otro como vendedor, o al revés).
 * Devuelve la primera orden abierta encontrada o null.
 */
export const findOpenOrderBetween = async (userA, userB) => {
  if (String(userA) === String(userB)) return null;
  const order = await Order.findOne({
    $or: [
      { buyer: userA, seller: userB },
      { buyer: userB, seller: userA },
    ],
    status: { $in: OPEN_ORDER_STATUSES },
  })
    .sort({ createdAt: -1 })
    .lean();
  return order;
};

/**
 * Obtiene (o crea) una conversación de chat de orden entre dos usuarios.
 * Lanza un Error con `.status=403` si no hay orden abierta entre ellos.
 */
export const getOrCreateOrderConversation = async ({ userA, userB }) => {
  if (String(userA) === String(userB)) {
    const err = new Error("No podés chatear con vos mismo.");
    err.status = 400;
    throw err;
  }

  const order = await findOpenOrderBetween(userA, userB);
  if (!order) {
    const err = new Error(
      "Solo podés iniciar un chat cuando tengas una compra/venta activa con este usuario.",
    );
    err.status = 403;
    throw err;
  }

  // Conversación de orden: garantizamos 1 por par de participantes globalmente
  // (sin producto). Ordenamos participates para poder deduplicar.
  const sorted = [String(userA), String(userB)].sort();
  let conversation = await Conversation.findOne({
    kind: "order_chat",
    participants: { $all: sorted },
    $expr: { $eq: [{ $size: "$participants" }, 2] },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      kind: "order_chat",
      participants: sorted,
      order: order._id,
    });
  }

  return conversation;
};

/** Crea/obtiene la conversación de pregunta pública sobre un producto. */
export const getOrCreateQuestionConversation = async ({ productId, authorId }) => {
  const product = await Product.findById(productId);
  if (!product) {
    const err = new Error("Publicación no encontrada.");
    err.status = 404;
    throw err;
  }

  if (String(product.seller) === String(authorId)) {
    const err = new Error("No podés preguntar en tu propia publicación.");
    err.status = 400;
    throw err;
  }

  // Normalizamos participants: [author, seller] para deduplicar de forma estable.
  const participants = [String(authorId), String(product.seller._id || product.seller)].sort();

  let conversation = await Conversation.findOne({
    kind: "product_question",
    product: productId,
    participants: { $all: participants },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      kind: "product_question",
      product: productId,
      participants,
    });
  }

  return conversation;
};

/**
 * Envía un mensaje a una conversación y actualiza su lastMessage.
 * Devuelve el mensaje creado.
 */
export const sendMessage = async ({ conversationId, senderId, text }) => {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    const err = new Error("El mensaje no puede estar vacío.");
    err.status = 400;
    throw err;
  }
  if (cleanText.length > 2000) {
    const err = new Error("El mensaje es demasiado largo (máx. 2000 caracteres).");
    err.status = 400;
    throw err;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const err = new Error("Conversación no encontrada.");
    err.status = 404;
    throw err;
  }

  const inParticipants = conversation.participants.some(
    (p) => String(p) === String(senderId),
  );
  if (!inParticipants) {
    const err = new Error("No participás de esta conversación.");
    err.status = 403;
    throw err;
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    text: cleanText,
    readBy: [senderId],
  });

  conversation.lastMessage = {
    text: cleanText,
    sender: senderId,
    at: new Date(),
  };
  conversation.updatedAt = new Date();
  await conversation.save();

  return message;
};

/**
 * Genera la notificación para el/los otros participantes de la conversación.
 * Para conversaciones de pregunta, notifica al vendedor (o al autor si responde el vendedor).
 */
export const notifyConversation = async (conversation, senderId, type) => {
  const recipients = conversation.participants.filter(
    (p) => String(p) !== String(senderId),
  );
  for (const recipient of recipients) {
    await createNotification({
      recipient,
      type,
      title: type === "new_question" ? "Nueva pregunta" : type === "question_answered" ? "Respondieron tu pregunta" : "Nuevo mensaje",
      message: "Tenés una nueva actividad en tus conversaciones.",
      data: { conversationId: conversation._id, senderId, productId: conversation.product },
    });
  }
};
