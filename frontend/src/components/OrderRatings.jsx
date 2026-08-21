import { useEffect, useState } from "react";
import { Star, ThumbsUp, ThumbsDown, MessageSquarePlus } from "lucide-react";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import RatingModal from "./RatingModal";
import LoadingSpinner from "./LoadingSpinner";

const BASE = import.meta.env.VITE_SERVER_URL;

/**
 * Sección de calificaciones dentro del detalle de una orden.
 *
 * Según el rol (comprador o vendedor) y el estado de la orden, muestra los
 * botones disponibles:
 *   - Comprador: "Calificar producto" (en order completada) y "Calificar vendedor".
 *   - Vendedor  : "Calificar comprador".
 *
 * También consulta al backend qué ratings ya emitió el usuario para no mostrar
 * de nuevo los botones de lo ya calificado.
 */
export default function OrderRatings({ order, role }) {
  const { getAccessToken } = usePrivy();
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal activo: contiene la config para RatingModal
  const [modal, setModal] = useState(null);

  const status = order?.status;

  const fetchMyRatings = async () => {
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(
        `${BASE}/api/review/order/${order._id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data?.success) setRatings(data.reviews || []);
    } catch (err) {
      console.error("Error cargando mis ratings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (order?._id) {
      setLoading(true);
      fetchMyRatings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?._id]);

  if (loading) {
    return (
      <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
        <div className="flex items-center justify-center py-6">
          <LoadingSpinner size="sm" text="Cargando calificaciones..." />
        </div>
      </section>
    );
  }

  // Determinar qué ratings ya emitió este usuario
  const ratedProducts = new Set(
    ratings.filter((r) => r.type === "product_rating").map((r) => r.productId),
  );
  const ratedSeller = ratings.some((r) => r.type === "seller_rating");
  const ratedBuyer = ratings.some((r) => r.type === "buyer_rating");

  // ¿La orden es calificable (completada o cancelada)?
  const isCompleted = status === "completed";
  const isCancelled = status === "cancelled";
  const cancelledBy = order?.cancelledBy;

  // Decisiones según rol
  const canRateProducts = role === "buyer" && isCompleted;
  const canRateSeller =
    role === "buyer" && (isCompleted || (isCancelled && cancelledBy !== "buyer"));
  const canRateBuyer =
    role === "seller" && (isCompleted || (isCancelled && cancelledBy !== "seller"));

  // Solo mostrar la sección si hay al menos un botón disponible
  const hasProductsToRate = canRateProducts && order.itemsSnapshot.some(
    (item) => !ratedProducts.has(item.productId?.toString()),
  );
  const showSeller = canRateSeller && !ratedSeller;
  const showBuyer = canRateBuyer && !ratedBuyer;

  if (!hasProductsToRate && !showSeller && !showBuyer) {
    return (
      <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <MessageSquarePlus className="w-5 h-5 text-[#F26722]" />
          <div>
            <h3 className="font-bold text-base dark:text-white">Calificaciones</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {ratings.length > 0
                ? "Ya dejaste todas tus calificaciones para esta orden. ¡Gracias!"
                : "Las calificaciones estarán disponibles al completarse o cancelarse la orden."}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Actor destino para ratings de usuario
  const seller = order?.seller;
  const buyer = order?.buyer;

  return (
    <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquarePlus className="w-5 h-5 text-[#F26722]" />
        <div>
          <h3 className="font-bold text-base dark:text-white">Calificaciones</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {ratings.length > 0
              ? "Podés registrar las calificaciones que te faltan."
              : "Contanos tu experiencia para generar confianza en la comunidad."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Comprador → Productos */}
        {hasProductsToRate &&
          order.itemsSnapshot.map((item) => {
            const productId = item.productId?.toString();
            if (ratedProducts.has(productId)) return null;
            return (
              <button
                key={productId}
                onClick={() =>
                  setModal({
                    kind: "product",
                    orderId: order._id,
                    productId,
                    actor: item,
                  })
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#F26722]/40 text-[#F26722] hover:bg-[#F26722]/5 font-semibold text-sm transition-colors"
              >
                <Star size={17} /> Calificar "{item.title.slice(0, 20)}..."
              </button>
            );
          })}

        {/* Comprador → Vendedor */}
        {showSeller && (
          <button
            onClick={() =>
              setModal({
                kind: "user",
                orderId: order._id,
                ratingType: "seller_rating",
                actor: seller,
              })
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#3483fa]/40 text-[#3483fa] hover:bg-[#3483fa]/5 font-semibold text-sm transition-colors"
          >
            <ThumbsUp size={17} /> Calificar vendedor
          </button>
        )}

        {/* Vendedor → Comprador */}
        {showBuyer && (
          <button
            onClick={() =>
              setModal({
                kind: "user",
                orderId: order._id,
                ratingType: "buyer_rating",
                actor: buyer,
              })
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#3483fa]/40 text-[#3483fa] hover:bg-[#3483fa]/5 font-semibold text-sm transition-colors"
          >
            <ThumbsDown size={17} /> Calificar comprador
          </button>
        )}
      </div>

      <RatingModal
        open={!!modal}
        onClose={() => setModal(null)}
        onSuccess={fetchMyRatings}
        kind={modal?.kind}
        orderId={modal?.orderId}
        productId={modal?.productId}
        ratingType={modal?.ratingType}
        actor={modal?.actor}
      />
    </section>
  );
}
