import React, { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { MessageCircle, HelpCircle, Send } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import { useUserStore } from "../store/useUserStore";

const BASE = `${import.meta.env.VITE_SERVER_URL}/api/message`;

/**
 * Sección de Preguntas y Respuestas públicas de una publicación.
 * - Muestra las preguntas y respuestas (públicas).
 * - Autenticado: permite hacer una pregunta.
 * - Si el usuario es el vendedor del producto, puede responder.
 */
export default function ProductQuestions({ productId, sellerId }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState(null);

  const [questionText, setQuestionText] = useState("");
  const [asking, setAsking] = useState(false);
  // Respuestas por conversación: { [conversationId]: value }
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [error, setError] = useState("");

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/product/${productId}/questions`);
      setQuestions(data.questions || []);
    } catch (e) {
      setError("No se pudieron cargar las preguntas.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  // Cargar id del usuario (para saber si es el vendedor)
  useEffect(() => {
    if (ready) {
      loadQuestions();
    }
  }, [ready, loadQuestions]);

  // Determinar si el usuario logueado es el vendedor
  // Para saberlo, traemos el perfil del vendedor desde el producto.
  // Usamos una consulta liviana de la DB.
  const { dbUser } = useDBUserOnce();

  const isSeller = !!dbUser && String(dbUser._id) === String(sellerId);

  const handleAsk = async (e) => {
    e.preventDefault();
    const text = questionText.trim();
    if (!text || asking) return;
    setAsking(true);
    setError("");
    try {
      const token = await getAccessToken();
      await axios.post(
        `${BASE}/product/${productId}/ask`,
        { text },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setQuestionText("");
      await loadQuestions();
    } catch (err) {
      setError(err?.response?.data?.message || "No se pudo hacer la pregunta.");
    } finally {
      setAsking(false);
    }
  };

  const handleAnswer = async (conversationId) => {
    const text = (answerDrafts[conversationId] || "").trim();
    if (!text) return;
    setError("");
    try {
      const token = await getAccessToken();
      await axios.post(
        `${BASE}/product/question/${conversationId}/answer`,
        { text },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setAnswerDrafts((d) => ({ ...d, [conversationId]: "" }));
      await loadQuestions();
    } catch (err) {
      setError(err?.response?.data?.message || "No se pudo responder.");
    }
  };

  const formatDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-800 rounded-md p-4 md:p-6">
      <h2 className="text-xl font-medium dark:text-white mb-4 flex items-center gap-2">
        <MessageCircle className="text-blue-500" size={20} />
        Preguntas y respuestas
      </h2>

      {error && (
        <p className="text-sm text-red-500 mb-3">{error}</p>
      )}

      {/* Formulario de pregunta (solo si está autenticado y no es comprador==vendedor) */}
      {authenticated && !isSeller && (
        <form
          onSubmit={handleAsk}
          className="mb-5 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-md p-3"
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Hacé tu pregunta sobre este producto
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Ej: ¿Incluye cable de corriente?"
              maxLength={500}
              className="flex-1 px-3 py-2 text-sm bg-white dark:bg-[#121212] border border-gray-300 dark:border-gray-600 rounded-md outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
            <button
              type="submit"
              disabled={asking || !questionText.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <Send size={14} />
              Preguntar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <LoadingSpinner size="md" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          <HelpCircle className="mx-auto mb-2" size={36} />
          <p>¿Tenés dudas sobre este producto?</p>
          <p className="text-xs">
            {authenticated
              ? "Hacé tu pregunta y el vendedor te responderá."
              : "Ingresá para hacer preguntas al vendedor."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div
              key={q._id}
              className="border border-gray-200 dark:border-gray-700 rounded-md p-3"
            >
              {/* Pregunta */}
              <div className="flex items-start gap-2">
                <HelpCircle className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 capitalize">
                      {q.question?.author?.name ||
                        q.question?.author?.username ||
                        "Comprador"}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {formatDate(q.question?.date)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                    {q.question?.text}
                  </p>
                </div>
              </div>

              {/* Respuesta */}
              {q.answer ? (
                <div className="ml-6 mt-2 pl-4 border-l-2 border-green-400">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                      Vendedor
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {formatDate(q.answer.date)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                    {q.answer.text}
                  </p>
                </div>
              ) : (
                /* Respuesta pendiente */
                <div className="ml-6 mt-2 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                  <p className="text-xs text-gray-400 italic">
                    Esperando respuesta del vendedor...
                  </p>

                  {/* Formulario de respuesta solo para el vendedor */}
                  {isSeller && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        value={answerDrafts[q._id] || ""}
                        onChange={(e) =>
                          setAnswerDrafts((d) => ({ ...d, [q._id]: e.target.value }))
                        }
                        placeholder="Responder públicamente..."
                        maxLength={500}
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-[#121212] border border-gray-300 dark:border-gray-600 rounded-md outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      />
                      <button
                        onClick={() => handleAnswer(q._id)}
                        disabled={!(answerDrafts[q._id] || "").trim()}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm font-semibold disabled:opacity-40 transition-colors"
                      >
                        Responder
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper para leer el dbUser una sola vez (evita suscripción costosa en cada render)
function useDBUserOnce() {
  return { dbUser: useUserStore((s) => s.dbUser) };
}
