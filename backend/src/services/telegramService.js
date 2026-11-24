// backend/src/services/telegramService.js
//
// ────────────────────────────────────────────────────────────────────────────
// NOTIFICACIONES DE ADMIN POR TELEGRAM
// ────────────────────────────────────────────────────────────────────────────
// Objetivo: que el admin reciba en el celular (Telegram) TODO lo que pasa en la
// plataforma: registros, órdenes, confirmaciones de recepción, solicitudes de
// aprobación de tienda, creación/aprobación de publicaciones, disputas, etc.
//
// DECISIONES DE DISEÑO (leer antes de tocar):
//
//  1. NUNCA ROMPE EL FLUJO PRINCIPAL. Igual que `createNotification`, todo va
//     envuelto en try/catch y las llamadas desde los controladores NO se
//     esperan (`.catch(() => {})`). Si Telegram está caído o mal configurado,
//     la orden/producto se crea igual.
//
//  2. SIN TOKEN = NO-OP SILENCIOSO. Si `TELEGRAM_BOT_TOKEN` no está seteado,
//     todas las funciones devuelven `{ skipped: true }`. Esto permite apagar
//     Telegram borrando una variable de entorno, sin tocar código.
//
//  3. COLA CON AGRUPADO (debounce). El problema real: el admin modera 50
//     publicaciones en bloque → 50 mensajes seguidos → Telegram lo rate-limitea
//     (límite ~30 msg/s global, ~20/min por chat) y en la práctica te satura el
//     celular. Solución: los mensajes de la MISMA `clave` (ej. "product_approved")
//     se acumulan durante `TELEGRAM_DEBOUNCE_MS` y se envían como UN solo
//     mensaje resumido. Los eventos individuales (una orden) salen enseguida
//     porque no tienen competencia.
//
//  4. CHAT DE DESTINO: prioridad → override en DB (TelegramConfig.chatId) →
//     TELEGRAM_ADMIN_CHAT_ID del .env. El chat privado del admin es el default.
//     A futuro un grupo sólo requiere cambiar ese chat_id (empieza con -100...).
//
//  5. CONTROL GRANULAR DE EVENTOS: `EVENT_CATALOG` es la fuente de verdad de
//     qué eventos existen y su default (on/off). La config en DB guarda sólo
//     los overrides. Ver `isEventEnabled`.
// ────────────────────────────────────────────────────────────────────────────
import TelegramConfig from "../models/TelegramConfig.js";

const TELEGRAM_API = "https://api.telegram.org";

// Ventana de agrupado. 2500ms es un balance: el bulk de moderación de 50
// productos ya terminó de procesarse y el admin no espera demasiado.
const DEBOUNCE_MS = Number(process.env.TELEGRAM_DEBOUNCE_MS || 2500);

// Largo máximo de un mensaje de Telegram (límite de la API: 4096).
const MAX_LEN = 3800;

/**
 * CATÁLOGO DE EVENTOS.
 *
 * Cada entrada define:
 *   - label:   nombre legible para el panel de control.
 *   - default: si arranca encendido o apagado (los "ruidosos" arrancan OFF
 *              hasta que el admin decida, para no saturar el primer día).
 *   - group:   categoría para agrupar en la UI.
 *
 * ⚠️ Si agregás un evento nuevo en un controlador, agregalo TAMBIÉN acá (con
 * su default) para que aparezca en el panel de control.
 */
export const EVENT_CATALOG = {
  // ── Usuarios ──
  user_registered: { label: "Nuevo usuario registrado", default: true, group: "Usuarios" },
  shop_approval_requested: { label: "Solicitud de aprobación de tienda", default: true, group: "Usuarios" },
  shop_approved: { label: "Tienda aprobada", default: false, group: "Usuarios" },
  shop_disabled: { label: "Tienda desactivada", default: true, group: "Usuarios" },
  user_suspended: { label: "Cuenta suspendida", default: true, group: "Usuarios" },
  user_reactivated: { label: "Cuenta reactivada", default: false, group: "Usuarios" },

  // ── Publicaciones ──
  product_created: { label: "Publicación pendiente de aprobación (nueva o editada)", default: true, group: "Publicaciones" },
  product_approved: { label: "Publicación aprobada", default: false, group: "Publicaciones" },
  product_rejected: { label: "Publicación rechazada", default: false, group: "Publicaciones" },

  // ── Órdenes ──
  order_created: { label: "Orden creada", default: true, group: "Órdenes" },
  order_paid: { label: "Pago confirmado por el vendedor", default: true, group: "Órdenes" },
  order_shipped: { label: "Pedido enviado", default: false, group: "Órdenes" },
  reception_confirmed: { label: "Recepción confirmada (lista para liberar)", default: true, group: "Órdenes" },
  order_completed: { label: "Orden completada", default: true, group: "Órdenes" },
  order_cancelled: { label: "Orden cancelada", default: true, group: "Órdenes" },

  // ── Dinero / riesgo ──
  dispute_opened: { label: "Disputa abierta", default: true, group: "Riesgo" },
  issue_reported: { label: "Problema reportado en una orden", default: true, group: "Riesgo" },
  refund_requested: { label: "Reembolso solicitado", default: true, group: "Riesgo" },
  escrow_release_requested: { label: "Vendedor pidió liberar escrow", default: true, group: "Riesgo" },
  collateral_soon_to_expire: { label: "Garantía pendiente (vendedor debe depositar)", default: true, group: "Riesgo" },
  collateral_released: { label: "Garantía liberada", default: false, group: "Riesgo" },

  // ── Economía / referidos ──
  referral_requested: { label: "Solicitud de referidor", default: true, group: "Economía" },

  // ── Sistema ──
  gas_drip_rate_limited: { label: "Gas drip bloqueado por límite (posible abuso)", default: true, group: "Sistema" },
  system_error: { label: "Error interno relevante", default: true, group: "Sistema" },
};

// ────────────────────────────────────────────────────────────────────────────
// CONFIG (cache en memoria)
// ────────────────────────────────────────────────────────────────────────────
// Leer la config en cada notificación sería un round-trip a Mongo innecesario
// (una orden dispara 3-4 mensajes). Cacheamos con TTL corto y la invalidamos
// al escribir. Es sólo lectura de preferencias: un dato levemente viejo (60s)
// no rompe nada.
let _configCache = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 60 * 1000;

export const invalidateTelegramConfigCache = () => {
  _configCache = null;
  _configCacheAt = 0;
};

/**
 * Devuelve el documento de config (creándolo si no existe). Cacheado.
 */
export const getTelegramConfig = async () => {
  const now = Date.now();
  if (_configCache && now - _configCacheAt < CONFIG_TTL_MS) return _configCache;

  try {
    // Timeout duro: si Mongo está lento/caído NO queremos que la notificación
    // (que es accesoria) demore el flujo principal. Con buffering habilitado,
    // una query puede quedarse colgada varios segundos.
    let cfg = await TelegramConfig.findOne({ singleton: "main" }).maxTimeMS(1500);
    if (!cfg) {
      cfg = await TelegramConfig.create({ singleton: "main" });
    }
    _configCache = cfg;
    _configCacheAt = now;
    return cfg;
  } catch (err) {
    console.error("[Telegram] No se pudo leer la config:", err.message);
    // Fallback en memoria: permite seguir enviando aunque Mongo falle, con
    // los defaults del catálogo (nunca bloquea el flujo).
    _configCache = { enabled: true, chatId: "", events: {} };
    _configCacheAt = now;
    return _configCache;
  }
};

/**
 * ¿Está configurado el bot? (token presente en el .env)
 */
export const isTelegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

/**
 * Resuelve el chat de destino: override en DB > .env.
 */
export const resolveChatId = async () => {
  const cfg = await getTelegramConfig();
  const chatId = (cfg?.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "").toString().trim();
  return chatId || "";
};

/**
 * ¿Está habilitado este evento? (override de DB > default del catálogo)
 * Si el evento no está en el catálogo, se asume APAGADO (fail-safe: no
 * mandamos ruido por eventos no declarados).
 */
export const isEventEnabled = async (event) => {
  if (!event) return false;
  const cfg = await getTelegramConfig();
  if (cfg?.enabled === false) return false; // interruptor maestro
  const overrides = cfg?.events || {};
  if (typeof overrides[event] === "boolean") return overrides[event];
  const def = EVENT_CATALOG[event];
  return def ? def.default === true : false;
};

// ────────────────────────────────────────────────────────────────────────────
// ENVÍO CRUDO
// ────────────────────────────────────────────────────────────────────────────

/**
 * Escapa caracteres especiales para `parse_mode: "HTML"`.
 * Telegram sólo soporta un subconjunto de HTML (<b>, <i>, <code>, <a>).
 * Si los datos de un usuario (nombre, producto) traen `<` o `&`, sin escapar
 * la API devuelve 400 y el mensaje se pierde.
 */
export const escapeTelegramHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Envía un mensaje de texto crudo a Telegram.
 *
 * @param {string} text       Texto en HTML (se recorta a MAX_LEN).
 * @param {object} [opts]
 * @param {string} [opts.chatId]  Override del destino (default: resolveChatId).
 * @returns {Promise<{success:boolean, skipped?:boolean, error?:string}>}
 */
export const sendTelegramMessage = async (text, opts = {}) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, skipped: true, error: "TELEGRAM_BOT_TOKEN no configurado" };

  const chatId = opts.chatId || (await resolveChatId());
  if (!chatId) return { success: false, skipped: true, error: "Sin chat_id configurado" };

  let body = String(text || "").trim();
  if (!body) return { success: false, skipped: true, error: "Mensaje vacío" };
  if (body.length > MAX_LEN) body = `${body.slice(0, MAX_LEN - 20)}\n\n… (truncado)`;

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const err = data?.description || `HTTP ${res.status}`;
      console.error("[Telegram] Error al enviar:", err);
      // Guardamos el último error para diagnóstico desde el panel. Es best-effort.
      TelegramConfig.updateOne({ singleton: "main" }, { $set: { lastError: String(err).slice(0, 300) } }).catch(() => {});
      return { success: false, error: err };
    }

    TelegramConfig.updateOne(
      { singleton: "main" },
      { $set: { lastSentAt: new Date(), lastError: "" } }
    ).catch(() => {});

    return { success: true, messageId: data?.result?.message_id };
  } catch (err) {
    console.error("[Telegram] Excepción al enviar:", err.message);
    return { success: false, error: err.message };
  }
};

// ────────────────────────────────────────────────────────────────────────────
// COLA CON AGRUPADO (debounce por clave)
// ────────────────────────────────────────────────────────────────────────────
// Cada entrada pendiente: { chatId, lines: [], header }
const _queue = new Map();

const flushQueue = async (key) => {
  const item = _queue.get(key);
  if (!item) return;
  _queue.delete(key);

  const { chatId, header, lines } = item;
  if (!lines.length) return;

  // Un solo message → se envía tal cual; varios → lista resumida.
  const body = lines.length === 1 ? lines[0] : lines.map((l) => `• ${l}`).join("\n");
  const text = `${header}${lines.length > 1 ? ` (${lines.length})` : ""}\n\n${body}`;
  await sendTelegramMessage(text, { chatId });
};

/**
 * Encola un mensaje para enviarlo agrupado.
 *
 * @param {string} key      Clave de agrupado (usá el nombre del evento).
 * @param {string} line     Línea de detalle (se agrupa como viñeta si hay varias).
 * @param {object} [opts]
 * @param {string} [opts.header]  Encabezado del mensaje agrupado.
 * @param {string} [opts.chatId]  Override de destino.
 */
const enqueue = (key, line, opts = {}) => {
  const chatId = opts.chatId || "";
  const header = opts.header || "🔔 <b>Mercado Nero</b>";
  const entry = _queue.get(key);
  if (entry) {
    entry.lines.push(line);
    // Si cambia el header (raro), conservamos el primero.
    return;
  }
  _queue.set(key, { chatId, header, lines: [line] });
  const timer = setTimeout(() => {
    flushQueue(key).catch((e) => console.error("[Telegram] flush error:", e.message));
  }, DEBOUNCE_MS);
  // No mantener el proceso vivo sólo por un timer de notificación.
  if (typeof timer.unref === "function") timer.unref();
};

// ────────────────────────────────────────────────────────────────────────────
// API DE ALTO NIVEL: notifyAdmin
// ────────────────────────────────────────────────────────────────────────────

/**
 * Notifica al ADMIN por Telegram (con control granular de eventos).
 *
 * Uso típico desde un controlador (NO se espera la promesa):
 *   notifyAdmin("order_created", {
 *     header: "🛒 <b>Nueva orden</b>",
 *     lines: [`#ABC123 · $12.000 · 2 items`, `Comprador: Juan`],
 *     data: { orderId },
 *   }).catch(() => {});
 *
 * @param {string} event   Clave del catálogo (EVENT_CATALOG).
 * @param {object} payload
 * @param {string} payload.header  Título del mensaje (HTML permitido).
 * @param {string|string[]} payload.lines  Detalle (una o varias líneas).
 * @param {object} [payload.data]  Contexto (no se envía; para logs/futuro).
 * @returns {Promise<{queued:boolean, skipped?:boolean, reason?:string}>}
 */
export const notifyAdmin = async (event, payload = {}) => {
  try {
    if (!isTelegramConfigured()) return { queued: false, skipped: true, reason: "no_token" };

    const enabled = await isEventEnabled(event);
    if (!enabled) return { queued: false, skipped: true, reason: "event_disabled" };

    const chatId = await resolveChatId();
    if (!chatId) return { queued: false, skipped: true, reason: "no_chat" };

    const header = payload.header || "🔔 <b>Mercado Nero</b>";
    const rawLines = Array.isArray(payload.lines) ? payload.lines : payload.lines ? [payload.lines] : [];
    const lines = rawLines.map((l) => String(l)).filter(Boolean);
    if (!lines.length) {
      // Sin detalle, mandamos igual el header (útil para eventos simples).
      enqueue(`${event}`, header, { chatId, header: `${header}` });
      return { queued: true };
    }

    // Agrupamos por evento: 50 aprobaciones en bloque = 1 solo mensaje.
    for (const line of lines) {
      enqueue(event, line, { chatId, header });
    }
    return { queued: true };
  } catch (err) {
    console.error("[Telegram] notifyAdmin error:", err.message);
    return { queued: false, skipped: true, reason: "error" };
  }
};

// ────────────────────────────────────────────────────────────────────────────
// HELPERS DE DIAGNÓSTICO / VINCULACIÓN
// ────────────────────────────────────────────────────────────────────────────

/**
 * Llama a getUpdates para descubrir el chat_id del admin sin pedirle que lo
 * busque a mano. Devuelve el último chat que le escribió al bot.
 *
 * ⚠️ Sólo funciona si el usuario ya le mandó AL MENOS un mensaje al bot
 * (Telegram no permite que un bot inicie la conversación).
 *
 * @returns {Promise<{success:boolean, chatId?:string, name?:string, error?:string}>}
 */
export const discoverChatId = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, error: "TELEGRAM_BOT_TOKEN no configurado" };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getUpdates?limit=100`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { success: false, error: data?.description || `HTTP ${res.status}` };
    }

    const updates = data?.result || [];
    // Recorremos de atrás para adelante: el último mensaje manda.
    for (let i = updates.length - 1; i >= 0; i--) {
      const chat = updates[i]?.message?.chat || updates[i]?.edited_message?.chat;
      if (chat?.id) {
        const name =
          [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
          chat.title ||
          chat.username ||
          "";
        return { success: true, chatId: String(chat.id), name };
      }
    }
    return {
      success: false,
      error:
        "No hay mensajes recientes. Abrí Telegram, mandale /start al bot y volvé a intentar.",
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Envía un mensaje de PRUEBA (para validar token + chat).
 * Ignora el control de eventos a propósito: es un test manual.
 */
export const sendTestMessage = async () => {
  const now = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  return sendTelegramMessage(
    `✅ <b>Prueba de conexión OK</b>\n\n` +
      `Mercado Nero · notificaciones de admin\n` +
      `Fecha: ${escapeTelegramHtml(now)}\n\n` +
      `Si ves este mensaje, el bot está bien configurado y vas a recibir los eventos que actives en el panel.`
  );
};
