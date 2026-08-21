import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { useChatStore } from "../store/useChatStore";
import { useUserStore } from "../store/useUserStore";

const BASE = `${import.meta.env.VITE_SERVER_URL}/api/message`;

/**
 * Hook que encapsula las operaciones de chat contra el backend.
 */
export const useChat = () => {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [error, setError] = useState("");

  const setConversations = useChatStore((s) => s.setConversations);
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const setMessages = useChatStore((s) => s.setMessages);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const setLoadingConversations = useChatStore((s) => s.setLoadingConversations);
  const setLoadingMessages = useChatStore((s) => s.setLoadingMessages);
  const clearConversationUnread = useChatStore((s) => s.clearConversationUnread);
  const updateConversationPreview = useChatStore((s) => s.updateConversationPreview);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const dbUser = useUserStore((s) => s.dbUser);
  const meId = dbUser?._id;

  const getHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  /** Carga la lista de conversaciones del usuario. */
  const fetchConversations = useCallback(async () => {
    if (!ready || !authenticated) return;
    setError("");
    setLoadingConversations(true);
    try {
      const headers = await getHeaders();
      const { data } = await axios.get(`${BASE}/conversations`, { headers });
      setConversations(data.conversations || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Error al cargar conversaciones");
    } finally {
      setLoadingConversations(false);
    }
  }, [ready, authenticated, getHeaders, setConversations, setLoadingConversations]);

  const fetchConversationMessages = useCallback(
    async (conversationId, { before } = {}) => {
      if (!conversationId) return;
      setLoadingMessages(true);
      try {
        const headers = await getHeaders();
        const params = before ? { before } : {};
        const { data } = await axios.get(
          `${BASE}/conversation/${conversationId}/messages`,
          { headers, params },
        );
        if (before) {
          prependMessages(data.messages || [], data.hasMore);
        } else {
          setMessages(data.messages || [], data.hasMore);
        }
      } catch (e) {
        setError(e?.response?.data?.message || "Error al cargar mensajes");
      } finally {
        setLoadingMessages(false);
      }
    },
    [getHeaders, setMessages, prependMessages, setLoadingMessages],
  );

  /** Abre una conversación existente y marca sus mensajes como leídos. */
  const openConversation = useCallback(
    async (conversationId) => {
      setActiveConversationId(conversationId);
      await fetchConversationMessages(conversationId);
      try {
        const headers = await getHeaders();
        await axios.patch(`${BASE}/conversation/${conversationId}/read`, {}, { headers });
        clearConversationUnread(conversationId);
      } catch (e) {
        console.error("Error al marcar leído:", e);
      }
    },
    [setActiveConversationId, fetchConversationMessages, getHeaders, clearConversationUnread],
  );

  /** Inicia un chat de orden con otro usuario (verifica orden abierta). */
  const startConversation = useCallback(
    async (userId) => {
      setError("");
      try {
        const headers = await getHeaders();
        const { data } = await axios.post(
          `${BASE}/conversation`,
          { userId },
          { headers },
        );
        await fetchConversations();
        return data.conversation;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo iniciar el chat";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getHeaders, fetchConversations],
  );

  /** Envía un mensaje y lo agrega optimista. Devuelve el mensaje guardado. */
  const sendMessageText = useCallback(
    async (conversationId, text) => {
      try {
        const headers = await getHeaders();
        const { data } = await axios.post(
          `${BASE}/conversation/${conversationId}/send`,
          { text },
          { headers },
        );
        appendMessage(data.message);
        updateConversationPreview(conversationId, data.message, meId);
        return data.message;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo enviar el mensaje";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getHeaders, appendMessage, updateConversationPreview, meId],
  );

  // Al abrir la conversación activa, marcar leído localmente
  useEffect(() => {
    if (activeConversationId) {
      clearConversationUnread(activeConversationId);
    }
  }, [activeConversationId, clearConversationUnread]);

  return {
    fetchConversations,
    fetchConversationMessages,
    openConversation,
    startConversation,
    sendMessageText,
    error,
    setError,
  };
};

