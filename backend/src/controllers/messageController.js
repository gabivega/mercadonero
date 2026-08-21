import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Product from "../models/Product.js";
import {
  getOrCreateOrderConversation,
  getOrCreateQuestionConversation,
  sendMessage,
  notifyConversation,
  findOpenOrderBetween,
} from "../services/messageService.js";

/**
 * GET /api/message/conversations
 * Lista las conversaciones del usuario autenticado (chats + preguntas donde participa),
 * ordenadas por último mensaje, con preview y contador de no leídos.
 */
export const getMyConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({ participants: userId })
      .sort({ updatedAt: -1 })
      .populate("participants", "name username avatar isVerified")
      .populate("product", "name images seller")
      .populate("order", "status productsAmount currency itemsSnapshot")
      .lean();

    // Para cada conversación, calculamos el conteo de mensajes no leídos del usuario.
    const conversationIds = conversations.map((c) => c._id);
    const unreadByConvo = await Message.aggregate([
      { $match: { conversation: { $in: conversationIds } } },
      { $match: { readBy: { $ne: userId } } },
      { $group: { _id: "$conversation", count: { $sum: 1 } } },
    ]);
    const unreadMap = {};
    for (const u of unreadByConvo) unreadMap[String(u._id)] = u.count;

    const result = conversations.map((c) => {
      // Datos de la orden asociada (para chats de orden)
      const orderInfo = c.order
        ? {
            _id: c.order._id,
            code: String(c.order._id).slice(-6).toUpperCase(),
            title: c.order.itemsSnapshot?.[0]?.title || "Orden",
            image: c.order.itemsSnapshot?.[0]?.images?.[0] || null,
            status: c.order.status,
            amount: c.order.productsAmount,
            currency: c.order.currency,
          }
        : null;

      return {
        _id: c._id,
        kind: c.kind,
        product: c.product
          ? {
              _id: c.product._id,
              name: c.product.name,
              image: c.product.images?.[0]?.url || null,
            }
          : null,
        order: orderInfo,
        participants: c.participants,
        lastMessage: c.lastMessage,
        answered: c.answered,
        unreadCount: unreadMap[String(c._id)] || 0,
        updatedAt: c.updatedAt,
      };
    });

    res.json({ success: true, conversations: result });
  } catch (error) {
    console.error("[Message] Error al listar conversaciones:", error);
    res.status(500).json({ success: false, message: "Error al obtener conversaciones" });
  }
};

/**
 * GET /api/message/conversation/:id/messages
 * Trae los mensajes de una conversación (paginado con ?before=<date>).
 */
export const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { before, limit = 30 } = req.query;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversación no encontrada" });
    }
    if (!conversation.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ success: false, message: "No participás de esta conversación" });
    }

    const filter = { conversation: conversation._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 30, 50));

    res.json({
      success: true,
      messages: messages.slice().reverse(),
      hasMore: messages.length === (Number(limit) || 30),
    });
  } catch (error) {
    console.error("[Message] Error al traer mensajes:", error);
    res.status(500).json({ success: false, message: "Error al obtener mensajes" });
  }
};

/**
 * POST /api/message/conversation
 * Inicia un chat de orden con otro usuario (verifica orden abierta).
 * Body: { userId }
 */
export const startOrderConversation = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "Falta el usuario destino" });
    }
    const conversation = await getOrCreateOrderConversation({
      userA: req.user._id,
      userB: userId,
    });
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    console.error("[Message] Error al iniciar conversación:", error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/message/conversation/:id/send
 * Envía un mensaje y notifica al otro participante.
 * Body: { text }
 */
export const sendMessageToConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await sendMessage({
      conversationId: id,
      senderId: req.user._id,
      text: req.body.text,
    });

    const conversation = await Conversation.findById(id);
    await notifyConversation(conversation, req.user._id, "new_message");

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error("[Message] Error al enviar mensaje:", error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/message/conversation/:id/read
 * Marca todos los mensajes de una conversación como leídos por el usuario actual.
 */
export const markConversationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversación no encontrada" });
    }
    if (!conversation.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ success: false, message: "No participás de esta conversación" });
    }

    await Message.updateMany(
      { conversation: conversation._id, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } },
    );

    res.json({ success: true });
  } catch (error) {
    console.error("[Message] Error al marcar leído:", error);
    res.status(500).json({ success: false, message: "Error al marcar como leído" });
  }
};

// ============================================================
// PREGUNTAS PÚBLICAS SOBRE PUBLICACIONES
// ============================================================

/**
 * GET /api/message/product/:productId/questions
 * Lista preguntas públicas (y respuestas) de un producto.
 * Endpoint público.
 */
export const getProductQuestions = async (req, res) => {
  try {
    const { productId } = req.params;
    const conversations = await Conversation.find({
      kind: "product_question",
      product: productId,
    })
      .sort({ createdAt: -1 })
      .populate("participants", "name username avatar");

    const messageIds = conversations.map((c) => c._id);
    let messages = [];
    if (messageIds.length) {
      messages = await Message.find({ conversation: { $in: messageIds } })
        .sort({ createdAt: 1 })
        .populate("sender", "name username avatar");
    }

    // Agrupamos por conversación
    const questions = conversations.map((c) => {
      const convoMessages = messages.filter(
        (m) => String(m.conversation) === String(c._id),
      );
      const first = convoMessages[0]; // la pregunta del autor
      const answer = convoMessages[convoMessages.length - 1]; // última respuesta
      return {
        _id: c._id,
        question: first ? { text: first.text, date: first.createdAt, author: first.sender } : null,
        answer: answer && answer._id !== first?._id
          ? { text: answer.text, date: answer.createdAt, author: answer.sender }
          : null,
        answered: c.answered,
        createdAt: c.createdAt,
      };
    });

    res.json({ success: true, questions });
  } catch (error) {
    console.error("[Message] Error al obtener preguntas:", error);
    res.status(500).json({ success: false, message: "Error al obtener preguntas" });
  }
};

/**
 * POST /api/message/product/:productId/ask
 * Publica una pregunta (autenticado).
 * Body: { text }
 */
export const askProductQuestion = async (req, res) => {
  try {
    const { productId } = req.params;
    const conversation = await getOrCreateQuestionConversation({
      productId,
      authorId: req.user._id,
    });

    const message = await sendMessage({
      conversationId: conversation._id,
      senderId: req.user._id,
      text: req.body.text,
    });

    await notifyConversation(conversation, req.user._id, "new_question");

    res.status(201).json({ success: true, message, conversationId: conversation._id });
  } catch (error) {
    console.error("[Message] Error al preguntar:", error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/message/product/question/:id/answer
 * Responde una pregunta (solo el vendedor del producto).
 * Body: { text }
 */
export const answerProductQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await Conversation.findById(id).populate("product", "seller");
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Pregunta no encontrada" });
    }
    const sellerId = conversation.product?.seller;
    if (!sellerId || String(sellerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Solo el vendedor puede responder" });
    }

    const message = await sendMessage({
      conversationId: conversation._id,
      senderId: req.user._id,
      text: req.body.text,
    });

    conversation.answered = true;
    conversation.answeredAt = new Date();
    await conversation.save();

    await notifyConversation(conversation, req.user._id, "question_answered");

    res.status(201).json({ success: true, message, conversationId: conversation._id });
  } catch (error) {
    console.error("[Message] Error al responder:", error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
