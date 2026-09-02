import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  ShieldCheck,
  Star,
  Store,
  Package,
  ShoppingCart,
  Ban,
  Calendar,
  MapPin,
  Tag,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
} from "lucide-react";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import LoadingSpinner from "../components/LoadingSpinner";
import genericProfile from "../assets/img/generic-profile.png";

const BASE = import.meta.env.VITE_SERVER_URL;

export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Reseñas recibidas por el usuario (como vendedor y como comprador)
  const [reviews, setReviews] = useState([]);
  const [tab, setTab] = useState("all"); // "all" | "seller" | "buyer"
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: res } = await axios.get(`${BASE}/api/user/public/${id}`);
      if (!res?.success) throw new Error("Perfil no encontrado");
      setData(res);
    } catch (e) {
      console.error("Error cargando perfil:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    setReviewsLoading(true);
    setReviewsError(false);
    try {
      const { data: res } = await axios.get(`${BASE}/api/review/user/${id}`);
      if (res?.success) {
        setReviews(res.reviews || []);
      }
    } catch (e) {
      console.error("Error cargando reseñas:", e);
      setReviewsError(true);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const formatMemberSince = (date) => {
    if (!date) return "—";
    const d = new Date(date);
    return d.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    });
  };

  // Métricas del perfil
  const stats = [
    {
      label: "Ventas",
      value: data?.metrics?.salesCompleted ?? "0",
      icon: <Store className="w-5 h-5" />,
    },
    {
      label: "Compras",
      value: data?.metrics?.purchasesCompleted ?? "0",
      icon: <ShoppingCart className="w-5 h-5" />,
    },
    {
      label: "Canceladas",
      value: data?.metrics?.cancelledOrders ?? "0",
      icon: <Ban className="w-5 h-5" />,
    },
    {
      label: "Expiradas",
      value: data?.metrics?.expiredOrders ?? "0",
      icon: <Package className="w-5 h-5" />,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="text-center bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-3xl p-10 max-w-md">
          <span className="text-5xl">🔍</span>
          <h2 className="text-xl font-black mt-4 dark:text-white uppercase tracking-tight">
            Perfil no encontrado
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Este usuario no existe o no está disponible.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 w-full py-3 bg-[#3483fa] text-white rounded-xl font-bold hover:bg-[#2968c8] transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const { user, metrics } = data;
  const avatar =
    user.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      user.name || user.username || "U",
    )}&background=random`;
  const hasProducts = data.products?.length > 0;

  // Estilo visual de la puntuación/reputación (0-100, en %) según el valor:
  //   hasta 50%  → rojo   (baja)
  //   51 a 80%   → ámbar  (media)
  //   81 en adel → verde  (excelente)
  const ratingVisual = (value) => {
    if (!value || value <= 0) return null;
    const v = Math.min(100, Number(value));
    if (v <= 50)
      return {
        text: "Reputación baja",
        cls: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
        numText: "text-red-600 dark:text-red-400",
        bar: "bg-red-500",
      };
    if (v <= 80)
      return {
        text: "Buena reputación",
        cls: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
        numText: "text-amber-600 dark:text-amber-400",
        bar: "bg-amber-500",
      };
    return {
      text: "Excelente reputación",
      cls: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400",
      numText: "text-green-600 dark:text-green-400",
      bar: "bg-green-500",
    };
  };
  const mainRating = ratingVisual(metrics?.rating);

  // Formateo de fecha de reseñas
  const formatReviewDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Separa las reseñas en las que fue calificado como vendedor vs comprador.
  const sellerReviews = reviews.filter((r) => r.type === "seller_rating");
  const buyerReviews = reviews.filter((r) => r.type === "buyer_rating");

  const isSellerTab = tab === "seller";
  const isBuyerTab = tab === "buyer";

  const visibleReviews = tab === "seller" ? sellerReviews : tab === "buyer" ? buyerReviews : reviews;

  // Métricas de recomendación para cada rol (en %).
  const pct = (list) => {
    if (!list.length) return null;
    const positives = list.filter((r) => r.recommends).length;
    return Math.round((positives / list.length) * 100);
  };
  const sellerPositive = sellerReviews.filter((r) => r.recommends).length;
  const buyerPositive = buyerReviews.filter((r) => r.recommends).length;

  const summary = [
    {
      key: "seller",
      label: "Como vendedor",
      count: sellerReviews.length,
      positive: sellerPositive,
      pct: pct(sellerReviews),
      icon: <Store className="w-5 h-5" />,
    },
    {
      key: "buyer",
      label: "Como comprador",
      count: buyerReviews.length,
      positive: buyerPositive,
      pct: pct(buyerReviews),
      icon: <ShoppingCart className="w-5 h-5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] pb-20 transition-colors">
      {/* Top bar */}
      <header className="bg-white dark:bg-[#121212] border-b dark:border-zinc-800 py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} /> Volver
          </button>
        </div>
      </header>

      {/* Header del perfil */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-3xl mt-6 p-6 sm:p-8 relative overflow-hidden">
          {/* Decoración */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-[#3483fa]/10 to-[#F26722]/10" />

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative">
            <div className="relative shrink-0">
              <img
                src={avatar}
                alt={user.name || user.username}
                className="w-28 h-28 rounded-3xl object-cover border-4 border-white dark:border-zinc-700 shadow-xl"
              />
              {user.isVerified && (
                <span className="absolute -bottom-1 -right-1 bg-[#3483fa] text-white p-1.5 rounded-xl shadow">
                  <BadgeCheck size={18} />
                </span>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-none">
                {user.shop?.name || user.name || user.username || "Nero"}
              </h1>
              <p className="text-[#3483fa] font-bold text-sm uppercase tracking-widest mt-1">
                @{user.username}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3 text-xs">
                {/* Verificado */}
                {user.isVerified ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-bold uppercase tracking-wide">
                    <ShieldCheck size={13} /> Verificado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-full font-bold uppercase tracking-wide">
                    Usuario no verificado
                  </span>
                )}

                {/* Antigüedad */}
                <span className="flex items-center gap-1 text-gray-500 capitalize">
                  <Calendar size={13} /> Desde {formatMemberSince(user.memberSince)}
                </span>

                {/* Ubicación */}
                {user.province && (
                  <span className="flex items-center gap-1 text-gray-500">
                    <MapPin size={13} /> {user.province}
                  </span>
                )}

                {/* Rating (reputación en %) con color según el valor */}
                {mainRating && (
                  <span
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide ${mainRating.cls}`}
                    title={`${mainRating.text}: ${metrics.rating}% de recomendaciones positivas`}
                  >
                    <Star size={13} className="fill-current" /> {metrics.rating}%
                  </span>
                )}
              </div>

              {/* Barra de satisfacción (solo si hay rating) */}
              {mainRating && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${mainRating.bar}`}
                      style={{ width: `${Math.min(100, Number(metrics.rating))}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {mainRating.text}
                  </span>
                </div>
              )}
            </div>

            {/* Botón de bloqueo (solo renderizado, lógica pendiente) */}
            <button
              disabled
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 text-zinc-400 rounded-xl text-sm font-semibold cursor-not-allowed"
              title="Próximamente"
            >
              <Ban size={16} /> Bloquear usuario
            </button>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="max-w-5xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-2xl p-5 text-center"
            >
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-[#3483fa]/10 text-[#3483fa] flex items-center justify-center">
                {s.icon}
              </div>
              <p className="text-2xl font-black italic uppercase tracking-tight dark:text-white">
                {s.value}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Reseñas recibidas (como vendedor / como comprador) */}
      <section className="max-w-5xl mx-auto px-4 mt-10">
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-xl font-black italic uppercase tracking-tighter dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#3483fa]" /> Reseñas recibidas
          </h2>
          <div className="h-[2px] flex-1 bg-gray-300/50 dark:bg-zinc-800" />
          {reviews.length > 0 && (
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">
              {reviews.length} {reviews.length === 1 ? "reseña" : "reseñas"}
            </span>
          )}
        </div>

        {reviewsLoading ? (
          <div className="py-16 text-center bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-3xl flex items-center justify-center">
            <LoadingSpinner size="md" text="Cargando reseñas..." />
          </div>
        ) : reviewsError || reviews.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-3xl">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-zinc-700" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              {reviewsError
                ? "No pudimos cargar las reseñas de este usuario."
                : "Este usuario todavía no recibió reseñas."}
            </p>
          </div>
        ) : (
          <>
            {/* Resumen por rol */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {summary.map((s) => {
                const active =
                  (s.key === "seller" && isSellerTab) ||
                  (s.key === "buyer" && isBuyerTab);
                const rv = s.pct !== null ? ratingVisual(s.pct) : null;
                return (
                  <button
                    key={s.key}
                    onClick={() => setTab(s.key)}
                    className={`text-left bg-white dark:bg-[#121212] border rounded-2xl p-5 transition-colors ${
                      active
                        ? "border-[#3483fa] ring-2 ring-[#3483fa]/30"
                        : "border dark:border-zinc-800 hover:border-[#3483fa]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          s.label === "Como vendedor"
                            ? "bg-[#F26722]/10 text-[#F26722]"
                            : "bg-[#3483fa]/10 text-[#3483fa]"
                        }`}
                      >
                        {s.icon}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        {s.count} {s.count === 1 ? "reseña" : "reseñas"}
                      </span>
                    </div>
                    <p className="mt-3 font-bold text-sm dark:text-white">{s.label}</p>
                    <p
                      className={`text-2xl font-black italic uppercase tracking-tight ${
                        rv ? rv.numText : "dark:text-white"
                      }`}
                    >
                      {s.pct !== null ? `${s.pct}%` : "—"}
                    </p>
                    {/* Mini barra de satisfacción */}
                    {rv && (
                      <div className="mt-2 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${rv.bar}`}
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {s.pct !== null
                        ? `${s.positive} ${s.positive === 1 ? "recomienda" : "recomiendan"}`
                        : "Sin reseñas"}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {[
                { key: "all", label: "Todas" },
                { key: "seller", label: "Como vendedor" },
                { key: "buyer", label: "Como comprador" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    tab === t.key
                      ? "bg-[#3483fa] text-white"
                      : "bg-white dark:bg-[#121212] border dark:border-zinc-800 text-gray-600 dark:text-gray-300 hover:border-[#3483fa]/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Listado de reseñas */}
            {visibleReviews.length === 0 ? (
              <div className="py-12 text-center bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-3xl">
                <p className="text-gray-500 dark:text-gray-400 font-medium">
                  No hay reseñas en esta categoría.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleReviews.map((review) => {
                  const authorId = review.author?._id;
                  const authorName =
                    review.author?.name ||
                    review.author?.username ||
                    "Usuario";
                  const isSellerType = review.type === "seller_rating";
                  const isPositive = review.recommends !== false;
                  return (
                    <article
                      key={review._id}
                      className="bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-2xl p-5"
                    >
                      <div className="flex items-start gap-3">
                        <Link
                          to={`/user/${authorId}`}
                          className="shrink-0 group"
                        >
                          <img
                            src={review.author?.avatar || genericProfile}
                            alt={authorName}
                            className="w-11 h-11 rounded-full object-cover border border-gray-200 dark:border-zinc-700 group-hover:ring-2 group-hover:ring-[#3483fa]/50 transition-all"
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/user/${authorId}`}
                              className="text-sm font-bold dark:text-white truncate capitalize hover:text-[#3483fa] hover:underline"
                              title={`Ver el perfil de ${authorName}`}
                            >
                              {authorName}
                            </Link>
                            <span
                              className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                isSellerType
                                  ? "bg-[#F26722]/10 text-[#F26722]"
                                  : "bg-[#3483fa]/10 text-[#3483fa]"
                              }`}
                            >
                              {isSellerType ? "la calificó como vendedor" : "la calificó como comprador"}
                            </span>
                          </div>

                          {/* Recomendación 👍 / 👎 */}
                          <div className="mt-2">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                isPositive
                                  ? "bg-green-50 dark:bg-green-900/10 text-green-600"
                                  : "bg-red-50 dark:bg-red-900/10 text-red-500"
                              }`}
                            >
                              {isPositive ? (
                                <>
                                  <ThumbsUp size={14} /> Lo recomienda
                                </>
                              ) : (
                                <>
                                  <ThumbsDown size={14} /> No lo recomienda
                                </>
                              )}
                            </span>
                          </div>

                          {review.comment && (
                            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                              {review.comment}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-400 capitalize">
                          {formatReviewDate(review.createdAt)}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Productos */}
      <section className="max-w-5xl mx-auto px-4 mt-10">
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-xl font-black italic uppercase tracking-tighter dark:text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#3483fa]" /> Publicaciones
          </h2>
          <div className="h-[2px] flex-1 bg-gray-300/50 dark:bg-zinc-800" />
        </div>

        {hasProducts ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {data.products.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>

            {data.totalProducts > data.products.length && (
              <div className="mt-8 text-center">
                <Link
                  to={`/search?sellerId=${user._id}&sellerName=${encodeURIComponent(
                    user.username || "",
                  )}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#3483fa] text-white rounded-xl font-bold hover:bg-[#2968c8] transition-colors"
                >
                  <Store size={16} /> Ver todos sus productos
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center bg-white dark:bg-[#121212] border dark:border-zinc-800 rounded-3xl">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-zinc-700" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              Este usuario todavía no tiene publicaciones activas.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
