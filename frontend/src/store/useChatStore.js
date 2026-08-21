import { create } from "zustand";

/**
 * Store de conversaciones y mensajes del usuario.
 */
export const useChatStore = create((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [], // mensajes de la conversación activa
  loadingConversations: false,
  loadingMessages: false,
  hasMore: false,
  // Conteo total de no leídos (para badge global)
  totalUnread: 0,

  setConversations: (conversations) => {
    const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    set({ conversations, totalUnread });
  },

  setActiveConversationId: (id) =>
    set({ activeConversationId: id, messages: [], hasMore: false }),

  setMessages: (messages, hasMore) => set({ messages, hasMore }),

  // Prepend para "cargar anteriores"
  prependMessages: (olderMessages, hasMore) =>
    set((state) => ({ messages: [...olderMessages, ...state.messages], hasMore })),

  appendMessage: (message) =>
    set((state) => {
      // Evita duplicados
      let messages = state.messages;
      if (!messages.some((m) => m._id === message._id)) {
        messages = [...messages, message];
      }
      return { messages };
    }),

  setLoadingConversations: (loadingConversations) => set({ loadingConversations }),
  setLoadingMessages: (loadingMessages) => set({ loadingMessages }),

  // Al marcar una conversación como leída, reseteamos su contador
  clearConversationUnread: (conversationId) =>
    set((state) => {
      const conversations = state.conversations.map((c) =>
        c._id === conversationId ? { ...c, unreadCount: 0 } : c
      );
      const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
      return { conversations, totalUnread };
    }),

  // Actualiza el lastMessage y sube la conversación al tope de la lista
  updateConversationPreview: (conversationId, message, senderId) =>
    set((state) => {
      let conversations = state.conversations.map((c) =>
        c._id === conversationId
          ? { ...c, lastMessage: { text: message.text, sender: senderId, at: new Date() } }
          : c
      );
      conversations.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      return { conversations };
    }),
}));
