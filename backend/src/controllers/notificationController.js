import Notification from "../models/Notification.js";

/**
 * Obtener las notificaciones del usuario autenticado.
 * Devuelve las últimas 50, ordenadas de más reciente a más antigua.
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    // También retornamos la cantidad de no leídas para el badge de la campanita.
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    res.json({ success: true, count: notifications.length, unreadCount, notifications });
  } catch (error) {
    console.error("[Notification] Error al obtener notificaciones:", error);
    res.status(500).json({ success: false, message: "Error al obtener notificaciones", error: error.message });
  }
};

/**
 * Obtener SOLO el conteo de no leídas (para el badge de la campanita).
 * Es un endpoint liviano que el front puede consultar seguido.
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    res.json({ success: true, unreadCount });
  } catch (error) {
    console.error("[Notification] Error al obtener conteo no leído:", error);
    res.status(500).json({ success: false, message: "Error al obtener conteo", error: error.message });
  }
};

/**
 * Marcar UNA notificación como leída.
 */
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId }, // solo si es del usuario
      { read: true, readAt: new Date() },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notificación no encontrada" });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error("[Notification] Error al marcar como leída:", error);
    res.status(500).json({ success: false, message: "Error al marcar notificación", error: error.message });
  }
};

/**
 * Marcar TODAS las notificaciones del usuario como leídas.
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true, readAt: new Date() },
    );

    res.json({ success: true, message: "Notificaciones marcadas como leídas" });
  } catch (error) {
    console.error("[Notification] Error al marcar todas como leídas:", error);
    res.status(500).json({ success: false, message: "Error al marcar notificaciones", error: error.message });
  }
};
