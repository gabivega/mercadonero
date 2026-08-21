import { create } from "zustand";

/**
 * Store de notificaciones in-app.
 * Guarda el listado de notificaciones y el conteo de no leídas
 * para que la campanita del Header muestre el badge en tiempo real.
 */
export const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.read).length }),

  setUnreadCount: (unreadCount) => set({ unreadCount }),

  setLoading: (loading) => set({ loading }),

  // Marcar una notificación local como leída (sin esperar el server)
  markLocalAsRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n._id === notificationId ? { ...n, read: true, readAt: new Date() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  // Marcar todas como leídas localmente
  markAllLocalAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}));
