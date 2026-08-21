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
} from "lucide-react";
import axios from "axios";
import ProductCard from "../components/ProductCard";
import LoadingSpinner from "../components/LoadingSpinner";

const BASE = import.meta.env.VITE_SERVER_URL;

export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  useEffect(() => {
    fetchProfile();
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
                {user.name || user.username || "Nero"}
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
                    Usuario
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

                {/* Rating */}
                {metrics?.rating > 0 && (
                  <span className="flex items-center gap-1 text-yellow-500 font-bold">
                    <Star size={13} className="fill-yellow-500" /> {metrics.rating}
                  </span>
                )}
              </div>
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
