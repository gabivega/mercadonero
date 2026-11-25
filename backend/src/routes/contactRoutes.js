// backend/src/routes/contactRoutes.js
//
// ────────────────────────────────────────────────────────────────────────────
// CONTACTO Y BOTÓN DE ARREPENTIMIENTO (público)
// ────────────────────────────────────────────────────────────────────────────
// ¿Por qué existe este endpoint?
//   El footer necesita dos acciones que NO son "abrir el cliente de mail del
//   usuario" (poco confiable en mobile y expone nuestra casilla al scraping):
//     1. "Ayuda y contacto" → consulta general.
//     2. "Botón de Arrepentimiento" → derecho de revocación de la compra
//        (Ley 24.240 de Defensa del Consumidor, AR: 10 días corridos desde la
//        recepción del producto).
//
//   Ambos terminan en el ADMIN por DOS canales: mail (Resend) + Telegram
//   (ver `sendContactMessageToAdmin`). Así la solicitud no se pierde si uno de
//   los dos está caído.
//
// DISEÑO:
//   - PÚBLICO (sin verifyAuth): una persona puede arrepentirse o escribirnos sin
//     haber creado cuenta.
//   - Anti-abuso SIN dependencias externas: rate limit en memoria por IP
//     (mapa con TTL). No es perfecto (se resetea al reiniciar), pero corta el
//     spam trivial sin agregar paquetes.
//
// Contrato de respuesta: { success, message, ...data }
// ────────────────────────────────────────────────────────────────────────────
import express from "express";
import { sendContactMessageToAdmin } from "../services/sendEmail.js";

const router = express.Router();

// ── Rate limit simple en memoria (por IP) ──
// 5 envíos cada 10 minutos. Suficiente para un formulario de contacto.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const _hits = new Map(); // ip -> [timestamps]

const rateLimited = (ip) => {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    _hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  _hits.set(ip, arr);
  // Limpieza oportunista para que el Map no crezca sin control.
  if (_hits.size > 5000) {
    for (const [key, times] of _hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) _hits.delete(key);
    }
  }
  return false;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KINDS = ["contact", "refund"];

/**
 * POST /api/contact
 * Body:
 *   {
 *     kind:     "contact" | "refund"   (default "contact")
 *     name?:    string
 *     email:    string   (obligatorio: sin esto no hay forma de responder)
 *     subject?: string
 *     message:  string   (obligatorio)
 *     orderId?: string   (arrepentimiento: orden a revocar)
 *     purchaseDate?: string
 *     phone?:   string
 *   }
 */
router.post("/", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({
        success: false,
        message:
          "Recibimos varios mensajes tuyos seguidos. Esperá unos minutos antes de enviar otro.",
      });
    }

    const body = req.body || {};
    const kind = KINDS.includes(body.kind) ? body.kind : "contact";
    const email = String(body.email || "").toLowerCase().trim();
    const message = String(body.message || "").trim();
    const name = String(body.name || "").trim().slice(0, 120);
    const subject = String(body.subject || "").trim().slice(0, 160);
    const orderId = String(body.orderId || "").trim().slice(0, 80);
    const purchaseDate = String(body.purchaseDate || "").trim().slice(0, 40);
    const phone = String(body.phone || "").trim().slice(0, 40);

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Ingresá un email válido para que podamos responderte.",
      });
    }
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Contanos un poco más (mínimo 10 caracteres).",
      });
    }
    // El arrepentimiento debe poder asociarse a una compra concreta.
    if (kind === "refund" && !orderId) {
      return res.status(400).json({
        success: false,
        message: "Para el botón de arrepentimiento indicá el número de orden de la compra.",
      });
    }

    // Contexto legible para el admin (se muestra como filas en el mail/Telegram).
    const context = {
      Nombre: name,
      Email: email,
      "Teléfono": phone,
      Orden: orderId,
      "Fecha de compra": purchaseDate,
    };

    const result = await sendContactMessageToAdmin({
      adminEmail: process.env.ADMIN_CONTACT_EMAIL || process.env.ADMIN_EMAILS,
      kind,
      fromEmail: email,
      subject: subject || (kind === "refund" ? `Orden ${orderId}` : `Consulta de ${name || email}`),
      message,
      context,
    });

    // Si no hay ni mail ni Telegram configurado, `error` viene de Resend.
    // No rompemos la UX: el mensaje igual quedó registrado en los logs.
    if (result?.error) {
      console.error("[contact] No se pudo entregar el mensaje:", result.error);
      return res.status(502).json({
        success: false,
        message:
          "No pudimos enviar tu mensaje en este momento. Probá de nuevo en unos minutos.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        kind === "refund"
          ? "Recibimos tu solicitud de arrepentimiento. Te vamos a contactar a la brevedad."
          : "¡Gracias! Recibimos tu mensaje y te vamos a responder a la brevedad.",
    });
  } catch (error) {
    console.error("[contact] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al enviar el mensaje. Probá más tarde.",
    });
  }
});

/**
 * GET /api/contact/info
 * Datos PÚBLICOS de contacto (para el footer). No expone secretos: sólo
 * muestra lo que el admin configure en el .env.
 */
router.get("/info", (req, res) => {
  res.json({
    success: true,
    email: process.env.PUBLIC_CONTACT_EMAIL || "",
    social: {
      instagram: process.env.PUBLIC_INSTAGRAM_URL || "",
      x: process.env.PUBLIC_X_URL || "",
    },
  });
});

export default router;
