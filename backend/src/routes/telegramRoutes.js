// backend/src/routes/telegramRoutes.js
//
// ────────────────────────────────────────────────────────────────────────────
// NOTIFICACIONES DE ADMIN POR TELEGRAM
// ────────────────────────────────────────────────────────────────────────────
// Todas las rutas son SOLO ADMIN (verifyAuth → attachUser → isAdmin), porque
// exponen el control de a dónde van las alertas internas y permiten mandar
// mensajes de prueba por el bot.
//
//   GET   /api/telegram/status   → estado + catálogo de eventos
//   POST  /api/telegram/link     → descubre y vincula el chat_id
//   POST  /api/telegram/chat-id  → setea un chat_id explícito (grupo o privado)
//   POST  /api/telegram/test     → mensaje de prueba
//   PATCH /api/telegram/events   → encender/apagar eventos e interruptor maestro
// ────────────────────────────────────────────────────────────────────────────
import express from "express";
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  getTelegramStatus,
  linkTelegramChat,
  setTelegramChatId,
  testTelegram,
  updateTelegramEvents,
} from "../controllers/telegramController.js";

const router = express.Router();

// `attachUser` va ANTES de `isAdmin`: es quien puebla req.user.role desde la BD.
router.get("/status", verifyAuth, attachUser, isAdmin, getTelegramStatus);
router.post("/link", verifyAuth, attachUser, isAdmin, linkTelegramChat);
router.post("/chat-id", verifyAuth, attachUser, isAdmin, setTelegramChatId);
router.post("/test", verifyAuth, attachUser, isAdmin, testTelegram);
router.patch("/events", verifyAuth, attachUser, isAdmin, updateTelegramEvents);

export default router;
