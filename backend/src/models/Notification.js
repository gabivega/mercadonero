import mongoose from "mongoose";

/**
 * Modelo de Notificaciones In-App.
 * Guarda las notificaciones por usuario para alimentar el badge de la campanita
 * y el historial del panel de notificaciones.
 */
const notificationSchema = new mongoose.Schema(
  {
    // Usuario destinatario de la notificación
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Tipo de evento (sirve para que el frontend pueda renderizar cada una distinta)
    type: {
      type: String,
      enum: [
        "order_created", // Se creó una nueva orden
        "payment_confirmed", // El comprador notificó un pago
        "order_shipped", // El vendedor envió el producto
        "order_completed", // La orden se completó (recepción confirmada)
        "order_cancelled", // La orden fue cancelada
        "general", // Cualquier otro aviso
        "new_message", // Llegó un mensaje en una conversación
        "new_question", // Alguien preguntó en una publicación
        "question_answered", // El vendedor respondió una pregunta
        // ── Flujo de garantías / cancelaciones / reembolsos ──
        "rating_reminder", // Recordatorio de calificar (producto/vendedor/comprador)
        "collateral_hold_requested", // El vendedor debe depositar garantía (orden en espera)
        "order_activated", // La orden pasó de "awaiting_collateral" a activa (vendedor depositó)
        "order_disputed", // El comprador reportó un problema y se abrió una disputa
        "order_refund_requested", // Comprador pidió cancelar con reembolso
        "order_refund_paid_by_vendor", // Vendedor confirmó que reembolsó
        "order_refund_received", // Comprador confirmó recibir el reintegro
        "order_release_requested_to_admin", // Vendedor solicitó liberación al admin
        "order_admin_release_request", // Notificación interna para el admin
        "order_guarantee_released", // La garantía del vendedor fue liberada
        "review_received", // A alguien lo calificaron (producto/usuario)
      ],
      default: "general",
    },

    // Título corto y mensaje (el front puede caer a datos complementarios si quiere)
    title: { type: String, required: true },
    message: { type: String, required: true },

    // Datos de contexto linkeados al evento (opcional). Ej: { orderId: "..." }
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Si la notificación ya fue leída o no (para el badge)
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  {
    // createdAt / updatedAt
    timestamps: true,
  },
);

// Índice compuesto para traer las no leídas del usuario de forma eficiente
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;

