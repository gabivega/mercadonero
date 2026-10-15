import express from "express";
const router = express.Router();
import verifyAuth from "../middleware/verifyAuth.js";
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
router.get("/conversations", verifyAuth, attachUser, getMyConversations);
router.post("/conversation", verifyAuth, attachUser, startOrderConversation);
router.get("/conversation/:id/messages", verifyAuth, attachUser, getConversationMessages);
router.post("/conversation/:id/send", verifyAuth, attachUser, sendMessageToConversation);
router.patch("/conversation/:id/read", verifyAuth, attachUser, markConversationRead);

// --- Rutas de preguntas públicas (listar es público) ---
router.get("/product/:productId/questions", getProductQuestions);
router.post("/product/:productId/ask", verifyAuth, attachUser, askProductQuestion);
router.post("/product/question/:id/answer", verifyAuth, attachUser, answerProductQuestion);

export default router;
