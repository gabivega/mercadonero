import { useState } from "react";
import { Star, ThumbsUp, ThumbsDown, X } from "lucide-react";
import Swal from "sweetalert2";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import LoadingSpinner from "./LoadingSpinner";

const BASE = import.meta.env.VITE_SERVER_URL;

/**
 * Modal de calificación reutilizable para el sistema de ratings.
 *
 * Tipos soportados:
 *  - "product": estrellas (1-5) + reseña breve.      → POST /api/review/product
 *  - "user"  : manito arriba/abajo + reseña breve.   → POST /api/review/user
 *
 * @param {object} props
 * @param {boolean} props.open           Si el modal está abierto.
 * @param {function} props.onClose        Cierra el modal.
 * @param {function} props.onSuccess      Callback al crear el rating (para refrescar la orden).
 * @param {"product"|"user"} props.kind   Tipo de calificación.
 * @param {string} props.orderId          Id de la orden.
 * @param {string} [props.productId]      Id del producto (en kind="product").
 * @param {"seller_rating"|"buyer_rating"} [props.ratingType] Tipo de rating de usuario.
 * @param {object} [props.actor]          Nombre/avatar de a quién se califica (para título).
 */
export default function RatingModal({
  open,
  onClose,
  onSuccess,
  kind, // "product" | "user"
  orderId,
  productId,
  ratingType, // "seller_rating" | "buyer_rating" cuando kind === "user"
  actor,
}) {
  const { getAccessToken } = usePrivy();

  const [rating, setRating] = useState(0);
  const [recommends, setRecommends] = useState(null); // true | false | null
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const isDark = document.documentElement.classList.contains("dark");

  const reset = () => {
    setRating(0);
    setRecommends(null);
    setComment("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const token = await getAccessToken();

    try {
      setSaving(true);

      if (kind === "product") {
        if (!rating) {
          return Swal.fire({
            icon: "warning",
            title: "Falta la calificación",
            text: "Seleccioná de 1 a 5 estrellas.",
            background: isDark ? "#121212" : "#ffffff",
            color: isDark ? "#f3f4f6" : "#1f2937",
            confirmButtonColor: "#3483fa",
          });
        }
        const { data } = await axios.post(
          `${BASE}/api/review/product`,
          { orderId, productId, rating, comment },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (data?.success) {
          Swal.fire({
            icon: "success",
            title: "¡Gracias por tu reseña!",
            text: "Tu calificación quedó registrada.",
            background: isDark ? "#121212" : "#ffffff",
            color: isDark ? "#f3f4f6" : "#1f2937",
            confirmButtonColor: "#3483fa",
          });
          reset();
          onClose();
          onSuccess && onSuccess();
        }
      } else {
        // kind === "user"
        if (recommends === null) {
          return Swal.fire({
            icon: "warning",
            title: "Elegí una opción",
            text: "Indicá si lo recomendás con 👍 o no con 👎.",
            background: isDark ? "#121212" : "#ffffff",
            color: isDark ? "#f3f4f6" : "#1f2937",
            confirmButtonColor: "#3483fa",
          });
        }
        const { data } = await axios.post(
          `${BASE}/api/review/user`,
          { orderId, type: ratingType, recommends, comment },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (data?.success) {
          Swal.fire({
            icon: "success",
            title: "¡Calificación enviada!",
            text: "Tu opinión quedó registrada.",
            background: isDark ? "#121212" : "#ffffff",
            color: isDark ? "#f3f4f6" : "#1f2937",
            confirmButtonColor: "#3483fa",
          });
          reset();
          onClose();
          onSuccess && onSuccess();
        }
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          error?.response?.data?.message ||
          "No se pudo guardar tu calificación. Intentalo de nuevo.",
        background: isDark ? "#121212" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#3483fa",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title =
    kind === "product"
      ? "Calificar producto"
      : ratingType === "buyer_rating"
        ? "Calificar comprador"
        : "Calificar vendedor";

  const actorLabel =
    kind === "user" && actor
      ? actor.name || actor.username || "este usuario"
      : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-[#121212] rounded-3xl border dark:border-zinc-800 shadow-2xl p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={20} />
        </button>

        <h3 className="text-lg font-black uppercase tracking-tight dark:text-white">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {kind === "product"
            ? "Contanos cómo te fue con este producto."
            : `¿Recomendás a ${actorLabel}? Tu opinión ayuda a la comunidad.`}
        </p>

        {/* Estrellas (solo producto) */}
        {kind === "product" && (
          <div className="flex items-center justify-center gap-1 mt-6">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={36}
                  className={
                    n <= rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300 dark:text-zinc-600"
                  }
                />
              </button>
            ))}
          </div>
        )}

        {/* Manito arriba / abajo (solo usuario) */}
        {kind === "user" && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setRecommends(true)}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-6 py-4 transition-all ${
                recommends === true
                  ? "border-green-500 bg-green-50 dark:bg-green-900/10 text-green-600"
                  : "border-gray-200 dark:border-zinc-700 text-gray-400 hover:border-green-300"
              }`}
            >
              <ThumbsUp size={32} />
              <span className="text-xs font-bold">Recomiendo</span>
            </button>
            <button
              onClick={() => setRecommends(false)}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-6 py-4 transition-all ${
                recommends === false
                  ? "border-red-500 bg-red-50 dark:bg-red-900/10 text-red-500"
                  : "border-gray-200 dark:border-zinc-700 text-gray-400 hover:border-red-300"
              }`}
            >
              <ThumbsDown size={32} />
              <span className="text-xs font-bold">No recomiendo</span>
            </button>
          </div>
        )}

        {/* Reseña breve */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Escribí una breve reseña (opcional)..."
          className="w-full mt-5 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-[#F26722] dark:text-white resize-none text-sm"
        />

        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-4 py-3.5 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              Enviar calificación
            </>
          )}
        </button>
      </div>
    </div>
  );
}
