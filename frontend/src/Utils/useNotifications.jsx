import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { useNotificationStore } from "../store/useNotificationStore";

const POLL_INTERVAL_MS = 60000; // 60 segundos

/**
 * Hook que sincroniza las notificaciones del usuario con el backend.
 * - Carga el listado y el badge al montar.
 * - Hace polling cada 60s para actualizar el conteo de no leídas.
 * (En una Fase 2, esto se reemplazará por Socket.IO para push inmediato.)
 */
export const useNotifications = () => {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const setLoading = useNotificationStore((s) => s.setLoading);
  const markLocalAsRead = useNotificationStore((s) => s.markLocalAsRead);
  const markAllLocalAsRead = useNotificationStore((s) => s.markAllLocalAsRead);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  // Cargar listado completo + badge
  const fetchNotifications = useCallback(async () => {
    if (!ready || !authenticated) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/notification`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error("Error al cargar notificaciones:", error);
    } finally {
      setLoading(false);
    }
  }, [ready, authenticated, getAccessToken, setNotifications, setLoading]);

  // Solo refrescar el badge (liviano, para polling)
  const refreshUnreadCount = useCallback(async () => {
    if (!ready || !authenticated) return;
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/notification/unread-count`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      // Silencioso: no es crítico
      console.error("Error al refrescar badge:", error);
    }
  }, [ready, authenticated, getAccessToken, setUnreadCount]);

  // Marcar una notificación como leída (server + local)
  const markAsRead = useCallback(
    async (notificationId) => {
      try {
        const token = await getAccessToken();
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/notification/${notificationId}/read`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (error) {
        console.error("Error al marcar notificación como leída:", error);
      } finally {
        // Actualizar local sin depender del server (optimista)
        markLocalAsRead(notificationId);
      }
    },
    [getAccessToken, markLocalAsRead],
  );

  // Marcar todas como leídas
  const markAllAsRead = useCallback(async () => {
    if (isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      const token = await getAccessToken();
      await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/notification/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      markAllLocalAsRead();
    } catch (error) {
      console.error("Error al marcar todas como leídas:", error);
    } finally {
      setIsMarkingAll(false);
    }
  }, [getAccessToken, markAllLocalAsRead, isMarkingAll]);

  // Cargar inicial + polling del badge
  useEffect(() => {
    fetchNotifications();
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications, refreshUnreadCount]);

  return {
    fetchNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
    isMarkingAll,
  };
};
