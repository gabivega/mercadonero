import mongoose from "mongoose";

/**
 * CONFIGURACIÓN DE NOTIFICACIONES POR TELEGRAM (doc único).
 *
 * ¿Por qué en Mongo y no en `.env`?
 *   Porque queremos CONTROL GRANULAR EN CALIENTE: encender/apagar eventos
 *   (registro de usuarios, órdenes, aprobación de tienda, etc.) desde el panel
 *   de admin sin tocar variables de entorno ni redeployar el backend.
 *
 * El TOKEN del bot y el chat por defecto SÍ viven en `.env`
 *   (TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID) porque son secretos y no
 *   deben viajar al frontend ni quedar en la base. Acá solo se guardan
 *   preferencias no sensibles.
 *
 * Documento único: siempre se hace upsert sobre `{ singleton: "main" }`.
 */
const telegramConfigSchema = new mongoose.Schema(
  {
    // Candado del singleton: garantiza un solo documento de configuración.
    singleton: { type: String, default: "main", unique: true, immutable: true },

    // Interruptor maestro. Si está en false, NO se envía nada a Telegram
    // (aunque los eventos individuales estén encendidos).
    enabled: { type: Boolean, default: true },

    // Chat de destino (privado del admin). Es un override opcional del
    // TELEGRAM_ADMIN_CHAT_ID del .env: si está seteado acá, gana este.
    // Sirve para vincular el chat desde la UI sin reiniciar el server.
    chatId: { type: String, default: "" },

    /**
     * Mapa de EVENTOS ACTIVOS. Es un objeto libre (Mixed) para poder agregar
     * eventos nuevos sin migrar el schema. La fuente de verdad de qué eventos
     * EXISTEN es `EVENT_CATALOG` en `telegramService.js`.
     *   { user_registered: true, order_created: true, ... }
     * Si una clave NO está definida, se asume el default del catálogo
     * (ver `isEventEnabled`), así que sólo se persisten los overrides.
     */
    events: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Auditoría mínima de quién/cuándo tocó la config.
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Última vez que se envió un mensaje OK (diagnóstico rápido del panel).
    lastSentAt: { type: Date },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

const TelegramConfig = mongoose.model("TelegramConfig", telegramConfigSchema);

export default TelegramConfig;
