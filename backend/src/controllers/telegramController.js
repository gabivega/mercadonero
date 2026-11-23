// backend/src/controllers/telegramController.js
//
// ────────────────────────────────────────────────────────────────────────────
// CONTROL DE NOTIFICACIONES POR TELEGRAM (solo admin)
// ────────────────────────────────────────────────────────────────────────────
// Endpoints para vincular el chat, probar la conexión y encender/apagar
// eventos individuales SIN redeploy. Todo detrás de `isAdmin`.
//
// Contrato de respuesta: { success, message, ...data }
// ────────────────────────────────────────────────────────────────────────────
import TelegramConfig from "../models/TelegramConfig.js";
import {
  EVENT_CATALOG,
  getTelegramConfig,
  invalidateTelegramConfigCache,
  isTelegramConfigured,
  resolveChatId,
  sendTestMessage,
  discoverChatId,
} from "../services/telegramService.js";

/**
 * GET /api/telegram/status
 * Estado completo para pintar el panel: si hay token, chat vinculado,
 * interruptor maestro, catálogo de eventos con su estado efectivo.
 */
export const getTelegramStatus = async (req, res) => {
  try {
    const cfg = await getTelegramConfig();
    const chatId = await resolveChatId();
    const overrides = cfg?.events || {};

    // Armamos el catálogo con el estado EFECTIVO de cada evento
    // (override de DB si existe, si no el default del catálogo).
    const events = Object.entries(EVENT_CATALOG).map(([key, meta]) => ({
      key,
      label: meta.label,
      group: meta.group,
      default: meta.default,
      enabled: typeof overrides[key] === "boolean" ? overrides[key] : meta.default === true,
      overridden: typeof overrides[key] === "boolean",
    }));

    res.status(200).json({
      success: true,
      configured: isTelegramConfigured(),
      botConfigured: isTelegramConfigured(),
      enabled: cfg?.enabled !== false,
      chatId,
      chatSource: cfg?.chatId ? "db" : process.env.TELEGRAM_ADMIN_CHAT_ID ? "env" : "none",
      lastSentAt: cfg?.lastSentAt || null,
      lastError: cfg?.lastError || "",
      events,
    });
  } catch (error) {
    console.error("[Telegram] getTelegramStatus:", error);
    res.status(500).json({ success: false, message: "No se pudo leer el estado de Telegram." });
  }
};

/**
 * POST /api/telegram/link
 * Descubre el chat_id (último mensaje recibido por el bot) y lo guarda en la
 * config. Requiere que el admin le haya escrito /start al bot.
 */
export const linkTelegramChat = async (req, res) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(400).json({
        success: false,
        message:
          "Falta TELEGRAM_BOT_TOKEN en el .env del backend. Creá el bot con @BotFather y pegá el token.",
      });
    }

    const found = await discoverChatId();
    if (!found.success) {
      return res.status(400).json({ success: false, message: found.error });
    }

    await TelegramConfig.findOneAndUpdate(
      { singleton: "main" },
      { $set: { chatId: found.chatId } },
      { upsert: true, new: true },
    );
    invalidateTelegramConfigCache();

    res.status(200).json({
      success: true,
      message: `Chat vinculado${found.name ? ` a ${found.name}` : ""}.`,
      chatId: found.chatId,
      name: found.name || "",
    });
  } catch (error) {
    console.error("[Telegram] linkTelegramChat:", error);
    res.status(500).json({ success: false, message: "No se pudo vincular el chat." });
  }
};

/**
 * POST /api/telegram/chat-id
 * Setea un chat_id EXPLÍCITO (útil para grupos o si getUpdates está vacío
 * porque el bot ya consumió los updates). Body: { chatId }
 */
export const setTelegramChatId = async (req, res) => {
  try {
    const { chatId } = req.body || {};
    const clean = String(chatId || "").trim();
    // Acepta chats privados (número) y grupos/canales (-100xxxxxxxxxx).
    if (!/^-?\d{5,20}$/.test(clean)) {
      return res.status(400).json({
        success: false,
        message: "chat_id inválido. Ejemplo privado: 123456789 · grupo: -1001234567890.",
      });
    }

    await TelegramConfig.findOneAndUpdate(
      { singleton: "main" },
      { $set: { chatId: clean } },
      { upsert: true, new: true },
    );
    invalidateTelegramConfigCache();

    res.status(200).json({ success: true, message: "chat_id guardado.", chatId: clean });
  } catch (error) {
    console.error("[Telegram] setTelegramChatId:", error);
    res.status(500).json({ success: false, message: "No se pudo guardar el chat_id." });
  }
};

/**
 * POST /api/telegram/test
 * Envía un mensaje de prueba al chat configurado. Es la "pruebita".
 */
export const testTelegram = async (req, res) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(400).json({
        success: false,
        message: "Falta TELEGRAM_BOT_TOKEN en el .env del backend.",
      });
    }
    const chatId = await resolveChatId();
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: "No hay chat vinculado. Usá POST /api/telegram/link (o /chat-id) primero.",
      });
    }

    const result = await sendTestMessage();
    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: `Telegram rechazó el mensaje: ${result.error}`,
        chatId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Mensaje de prueba enviado. Revisá Telegram en el celular.",
      chatId,
    });
  } catch (error) {
    console.error("[Telegram] testTelegram:", error);
    res.status(500).json({ success: false, message: "No se pudo enviar la prueba." });
  }
};

/**
 * PATCH /api/telegram/events
 * Activa/desactiva eventos. Body admite:
 *   { enabled: boolean }                 → interruptor maestro
 *   { events: { order_created: false } } → overrides por evento
 */
export const updateTelegramEvents = async (req, res) => {
  try {
    const { enabled, events } = req.body || {};
    const set = {};

    if (typeof enabled === "boolean") set.enabled = enabled;

    if (events && typeof events === "object") {
      // Validamos las claves contra el catálogo para no acumular basura.
      const unknown = Object.keys(events).filter((k) => !EVENT_CATALOG[k]);
      if (unknown.length) {
        return res.status(400).json({
          success: false,
          message: `Eventos desconocidos: ${unknown.join(", ")}.`,
        });
      }
      const cfg = await getTelegramConfig();
      const merged = { ...(cfg?.events || {}) };
      for (const [k, v] of Object.entries(events)) {
        if (typeof v !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `El evento "${k}" debe ser true o false.`,
          });
        }
        merged[k] = v;
      }
      set.events = merged;
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No enviaste cambios. Usá { enabled } o { events }.",
      });
    }

    set.updatedBy = req.user._id;
    await TelegramConfig.findOneAndUpdate({ singleton: "main" }, { $set: set }, { upsert: true, new: true });
    invalidateTelegramConfigCache();

    res.status(200).json({
      success: true,
      message: "Configuración de Telegram actualizada.",
    });
  } catch (error) {
    console.error("[Telegram] updateTelegramEvents:", error);
    res.status(500).json({ success: false, message: "No se pudo actualizar la configuración." });
  }
};
