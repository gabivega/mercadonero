import Notification from "../models/Notification.js";

/**
 * Helper centralizado para crear notificaciones in-app.
 * Lo único que hace es persistir en Mongo.
 *
 * En una fase posterior, acá mismo se puede emitir el evento por Socket.IO
 * para notificaciones en tiempo real sin tocar los controladores.
 */
export const createNotification = async ({
  recipient, // ObjectId del User destinatario
  type = "general",
  title,
  message,
  data = {},
}) => {
  if (!recipient) {
    console.warn("[createNotification] Falta el destinatario, se omite.");
    return null;
  }

  if (!title || !message) {
    console.warn("[createNotification] Falta title/message, se omite.");
    return null;
  }

  try {
    const notification = await Notification.create({
      recipient,
      type,
      title,
      message,
      data,
    });

    // ☝️ En Fase 2, aquí iría el emit de Socket.IO
    // (io.to(`user:${recipient}`).emit('notification', notification));

    return notification;
  } catch (error) {
    console.error("[createNotification] Error creando notificación:", error);
    return null; // NUNCA romper el flujo principal por una notificación.
  }
};
