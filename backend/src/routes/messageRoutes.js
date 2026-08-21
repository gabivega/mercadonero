import express from "express";
const router = express.Router();
import verifyPrivyToken from "../middleware/auth.js";
import attachUser from "../middleware/attachUser.js";
import {
  getMyConversations,
  getConversationMessages,
  startOrderConversation,
  sendMessageToConversation,
  markConversationRead,
  getProductQuestions,
  askProductQuestion,
  answerProductQuestion,
} from "../controllers/messageController.js";

// --- Rutas de chat de orden (requieren sesión) ---
router.get("/conversations", verifyPrivyToken, attachUser, getMyConversations);
router.post("/conversation", verifyPrivyToken, attachUser, startOrderConversation);
router.get("/conversation/:id/messages", verifyPrivyToken, attachUser, getConversationMessages);
router.post("/conversation/:id/send", verifyPrivyToken, attachUser, sendMessageToConversation);
router.patch("/conversation/:id/read", verifyPrivyToken, attachUser, markConversationRead);

// --- Rutas de preguntas públicas (listar es público) ---
router.get("/product/:productId/questions", getProductQuestions);
router.post("/product/:productId/ask", verifyPrivyToken, attachUser, askProductQuestion);
router.post("/product/question/:id/answer", verifyPrivyToken, attachUser, answerProductQuestion);

export default router;
