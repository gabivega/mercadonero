import { useNavigate } from "react-router-dom";
import { Users, Clock, ChevronRight, Tag } from "lucide-react";
import useCountdown from "../hooks/useCountdown";
import { formatMoney } from "../Utils/currencyFormatter";

const ACCENT = "#F26722";

/**
 * SellerPoolCard
 * Tarjeta de "grupo activo" reutilizable para los paneles de VENDEDOR y de
 * COMPRADOR. Muestra info básica: producto, integrantes (X/target), precio
 * actual y tiempo restante. No es una orden todavía, sólo visibilidad.
 *
 * @param {object} pool  Pool serializado (con product/creator poblados)
 * @param {"seller"|"buyer"} [role="seller"]
 *   - "seller": se muestra "creado por" (quién inició el grupo).
 *   - "buyer":  se muestra "tu rol" (creador / integrante).
 * @param {string} [currentUserId]  id del usuario logueado (para el rol "buyer").
 */
export default function SellerPoolCard({ pool, role = "seller", currentUserId }) {
  const navigate = useNavigate();
  const { label: timeLeft, isExpired } = useCountdown(pool?.expiresAt);

  const product = pool?.product;
  const productName = product?.name || "Producto";
  // `product.images` es un array de objetos { url, isMain }. Preferimos la
  // marcada como principal y caemos a la primera; toleramos strings también.
  const images = Array.isArray(product?.images) ? product.images : [];
  const rawImage =
    images.find((i) => i?.isMain)?.url ||
    images[0]?.url ||
    (typeof images[0] === "string" ? images[0] : null);
  const image =
    typeof rawImage === "string" && rawImage.trim() ? rawImage : null;

  const members = pool?.members?.length || 0;
  const target = pool?.targetBuyers || 5;
  const progress = Math.min(100, Math.round((members / target) * 100));

  const creatorName =
    [pool?.creator?.firstName, pool?.creator?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    pool?.creator?.username ||
    pool?.members?.[0]?.username ||
    "Comprador";

  const isFilled = pool?.status === "filled";

  // Para el rol "buyer": ¿el usuario logueado es quien creó el grupo?
  const creatorId = pool?.creator?._id || pool?.creator;
  const isCreator =
    Boolean(currentUserId) &&
    Boolean(creatorId) &&
    String(creatorId) === String(currentUserId);

  return (
    <div
      onClick={() => navigate(`/pool/${pool._id}`)}
      className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-[2rem] hover:border-[#F26722] transition-all cursor-pointer shadow-sm hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Mini imagen del producto */}
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
            {image ? (
              <img
                src={image}
                alt={productName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Tag size={22} className="text-zinc-400" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Grupo #{pool._id.slice(-6)}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  isFilled
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}
              >
                {isFilled ? "Completo" : "Activo"}
              </span>
            </div>

            <h3 className="font-bold text-zinc-900 dark:text-white leading-tight truncate">
              {productName}
            </h3>

            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 font-medium">
              <span className="flex items-center gap-1">
                <Users size={13} /> {members}/{target}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={13} />
                {isFilled ? "Listo" : timeLeft}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-tighter">
              Precio actual
            </p>
            <p className="text-sm font-bold" style={{ color: ACCENT }}>
              {pool?.currentUnitPrice != null
                ? formatMoney(pool.currentUnitPrice)
                : "—"}
            </p>
          </div>
          <ChevronRight className="text-zinc-300 group-hover:text-[#F26722] group-hover:translate-x-1 transition-all" />
        </div>
      </div>

      {/* Barra de progreso + creador / rol */}
      <div className="mt-4">
        <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
          />
        </div>
        <p className="text-[11px] text-zinc-400 mt-1.5">
          {role === "buyer" ? (
            <>
              Tu rol: <span className="font-bold">
                {pool?.isCreator ? "Creador" : "Integrante"}
              </span>
            </>
          ) : (
            <>
              Creado por <span className="font-bold">{creatorName}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
