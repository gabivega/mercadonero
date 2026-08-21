import React, { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSearchParams } from "react-router-dom";
import {
  MessageSquare,
  Send,
  ChevronLeft,
  ShoppingBag,
  Tag,
  User,
} from "lucide-react";
import { useChatStore } from "../../store/useChatStore";
import { useChat } from "../../Utils/useChat";
import { useUserStore } from "../../store/useUserStore";
import LoadingSpinner from "../../components/LoadingSpinner";

/**
 * Página de Mensajes (chat entre usuarios con órdenes activas).
 * Split view: lista de conversaciones + hilo de mensajes.
 */
export default function Mensajes() {
  const { dbUser } = useUserStore();
  const { ready, authenticated } = usePrivy();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    activeConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    hasMore,
  } = useChatStore();

  const {
    fetchConversations,
    openConversation,
    sendMessageText,
  } = useChat();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollTopRef = useRef(null);

  const meId = dbUser?._id;

  // Cargar conversaciones al montar
  useEffect(() => {
    if (ready && authenticated) fetchConversations();
  }, [ready, authenticated, fetchConversations]);

  // Si venimos desde una orden con ?c=conversationId, abrir ese chat
  useEffect(() => {
    if (!ready) return;
    const convId = searchParams.get("c");
    if (convId) {
      // Asegurar que la conversación esté en la lista antes de abrirla
      (async () => {
        await fetchConversations();
        await openConversation(convId);
        // Limpiar el query param para evitar re-abrir al navegar
        setSearchParams({}, { replace: true });
      })();
    }
  }, [ready, searchParams, fetchConversations, openConversation, setSearchParams]);

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeConversationId]);

  const activeConversation = conversations.find(
    (c) => c._id === activeConversationId,
  );

  // Determina el otro participante (el que no soy yo)
  const otherParticipant = (conversation) =>
    conversation?.participants?.find((p) => p._id !== meId) || null;

  const activeOther = activeConversation
    ? otherParticipant(activeConversation)
    : null;

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !activeConversationId || sending) return;
    setSending(true);
    try {
      await sendMessageText(activeConversationId, trimmed);
      setText("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) +
      " " +
      d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };

  if (loadingConversations) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" text="Cargando conversaciones..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Mensajes
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Conversás con compradores y vendedores de tus compras/ventas activas.
        </p>
      </div>

      <div className="bg-white dark:bg-[#121212] rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[520px]">
          {/* LISTA DE CONVERSACIONES */}
          <div className="md:col-span-4 border-r border-gray-200 dark:border-gray-800">
            <div className="p-3 border-b border-gray-200 dark:border-gray-800 font-semibold text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1a1a1a]">
              Conversaciones
            </div>

            {conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <MessageSquare className="mx-auto mb-2" size={40} />
                <p>No tenés conversaciones todavía.</p>
                <p className="mt-1 text-xs">
                  Podés chatear cuando tengas una compra o venta activa.
                </p>
              </div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                {conversations.map((conv) => {
                  const other = otherParticipant(conv);
                  const isQuestion = conv.kind === "product_question";
                  // Para chats de orden, mostramos la imagen del producto de la orden
                  const convImage = !isQuestion
                    ? conv.order?.image || other?.avatar
                    : conv.product?.image || other?.avatar;
                  const convTitle = isQuestion
                    ? conv.product?.name || "Pregunta"
                    : conv.order?.title || other?.name || other?.username || "Compra activa";
                  return (
                    <button
                      key={conv._id}
                      onClick={() => openConversation(conv._id)}
                      className={`w-full text-left px-3 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors ${
                        activeConversationId === conv._id
                          ? "bg-blue-50 dark:bg-[#16222e]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">

                        {/* Avatar / Imagen del producto de la orden */}
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">

                          {convImage ? (
                            <img

                              src={convImage}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            <User className="text-gray-500 dark:text-gray-300" size={26} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">



                              {convTitle}
                            </span>
                            {conv.unreadCount > 0 && (
                              <span className="ml-2 bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0">
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {conv.lastMessage?.text || "Sin mensajes"}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {isQuestion ? (
                              <Tag size={10} className="text-gray-400" />
                            ) : (
                              <ShoppingBag size={10} className="text-gray-400" />
                            )}
                            <span className="text-[10px] text-gray-400">

                              {isQuestion
                                ? "Pregunta pública"
                                : conv.order?.code
                                  ? `Chat de compra · #${conv.order.code}`
                                  : "Chat de compra"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* HILO DE MENSAJES */}
          <div className="md:col-span-8 flex flex-col">
            {!activeConversation ? (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                <MessageSquare className="mb-3 text-gray-300 dark:text-gray-600" size={48} />
                <p className="text-gray-400 text-sm">
                  Seleccioná una conversación para ver los mensajes.
                </p>
              </div>
            ) : (
              <>
                {/* Header de la conversación */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a] flex items-center gap-3">
                  <button
                    className="md:hidden text-gray-500"
                    onClick={() => useChatStore.getState().setActiveConversationId(null)}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {(activeConversation.kind !== "product_question"
                      ? activeConversation.order?.image
                      : activeConversation.product?.image) || activeOther?.avatar ? (
                      <img
                        src={
                          (activeConversation.kind !== "product_question"
                            ? activeConversation.order?.image
                            : activeConversation.product?.image) || activeOther?.avatar
                        }
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <User className="text-gray-500 dark:text-gray-300" size={22} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {activeConversation.kind === "product_question"
                        ? activeConversation.product?.name
                        : activeConversation.order?.title ||
                          activeOther?.name ||
                          activeOther?.username ||
                          "Usuario"}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {activeConversation.kind === "product_question"
                        ? "Pregunta pública"
                        : activeConversation.order?.code
                          ? `Compra/venta activa · Orden #${activeConversation.order.code}`
                          : "Compra/venta activa"}
                    </p>
                  </div>
                </div>

                {/* Mensajes */}
                <div
                  ref={scrollTopRef}
                  className="flex-1 overflow-y-auto p-4 max-h-[400px] space-y-2 bg-gray-50 dark:bg-[#0f0f0f]"
                >
                  {loadingMessages && (
                    <div className="text-center py-2 text-xs text-gray-400">
                      Cargando...
                    </div>
                  )}

                  {activeConversation.kind === "product_question" &&
                    !activeConversation.answered && (
                      <div className="text-[11px] text-center text-gray-400 text-amber-600 dark:text-amber-400">
                        Pregunta pública: el vendedor puede responderla desde la publicación.
                      </div>
                    )}

                  {messages.length === 0 && !loadingMessages ? (
                    <div className="text-center py-8 text-sm text-gray-400">
                      Enviá el primer mensaje.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const mine = String(msg.sender) === String(meId);
                      return (
                        <div
                          key={msg._id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? "bg-blue-600 text-white rounded-br-sm"
                                : "bg-white dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-sm"
                            }`}
                          >
                            <p>{msg.text}</p>
                            <p
                              className={`text-[10px] mt-1 ${
                                mine ? "text-blue-200" : "text-gray-400"
                              }`}
                            >
                              {formatTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form
                  onSubmit={handleSend}
                  className="p-3 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escribí un mensaje..."
                    maxLength={2000}
                    className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={sending || !text.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
