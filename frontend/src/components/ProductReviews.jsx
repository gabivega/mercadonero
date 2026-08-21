import { useEffect, useState } from "react";
import axios from "axios";
import { Star, MessageSquare } from "lucide-react";
import genericProfile from "../assets/img/generic-profile.png";
import LoadingSpinner from "./LoadingSpinner";

const BASE = import.meta.env.VITE_SERVER_URL;

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function StarRow({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-4 h-4 ${
            n <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-zinc-600"
          }`}
        />
      ))}
    </div>
  );
}

export default function ProductReviews({ productId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!productId) return;
    const fetchReviews = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${BASE}/api/review/product/${productId}`);
        setData(data);
      } catch (err) {
        setError("No pudimos cargar las opiniones de este producto.");
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, [productId]);

  if (loading)
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <LoadingSpinner size="md" text="Cargando opiniones..." />
      </div>
    );

  if (error || !data)
    return (
      <p className="text-sm text-gray-400 py-6">{error || "Sin opiniones disponibles."}</p>
    );

  const { average, count, reviews } = data;

  return (
    <section id="reviews" className="pb-8 scroll-mt-24">
      {/* Encabezado con promedio */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-medium dark:text-white">Opiniones del producto</h2>
        {count > 0 && (
          <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            {average} ({count} {count === 1 ? "opinión" : "opiniones"})
          </span>
        )}
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center border border-dashed border-gray-200 dark:border-zinc-700 rounded-md">
          <MessageSquare className="w-8 h-8 text-gray-300 dark:text-zinc-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Todavía no hay opiniones para este producto.
          </p>
          <p className="text-xs text-gray-400">
            Comprale y sé el primero en dejar una calificación.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <article
              key={review._id}
              className="border border-gray-100 dark:border-zinc-700 rounded-md p-4 bg-gray-50 dark:bg-[#1a1a1a]"
            >
              <div className="flex items-center gap-3">
                <img
                  src={review.author?.avatar || genericProfile}
                  alt={review.author?.name || review.author?.username || "usuario"}
                  className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-zinc-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium dark:text-white truncate capitalize">
                    @{review.author?.username || review.author?.name || "Usuario"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StarRow rating={review.rating} />
                    <span className="text-[11px] text-gray-400">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              {review.comment && (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                  {review.comment}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
