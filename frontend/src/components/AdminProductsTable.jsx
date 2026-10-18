import React, { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X as XIcon,
  ExternalLink,
  Clock,
  CheckCircle2,
  Ban,
  Layers,
  Loader2,
} from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import { usePrivy } from "../Utils/authClient";
import LoadingSpinner from "./LoadingSpinner";

/**
 * Panel de MODERACIÓN de publicaciones (admin).
 *
 * El vendedor publica y el producto nace en moderación "pending" (no visible
 * al público). Acá el admin revisa y aprueba o rechaza (con motivo).
 *
 * - Pestañas por estado: Pendientes / Aprobadas / Rechazadas / Todas.
 * - Búsqueda server-side + paginación.
 * - Vista previa (abre /producto/:slug) para revisar el contenido real.
 */
const TABS = [
  { id: "pending", label: "Pendientes", icon: Clock },
  { id: "approved", label: "Aprobadas", icon: CheckCircle2 },
  { id: "rejected", label: "Rechazadas", icon: Ban },
  { id: "all", label: "Todas", icon: Layers },
];

const STATUS_BADGES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
};

const AdminProductsTable = () => {
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState(null); // id de la publicación en proceso

  const { getAccessToken } = usePrivy();
  const LIMIT = 25;

  // Debounce de la búsqueda.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/products`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            moderation: tab,
            search: debouncedSearch,
            page,
            limit: LIMIT,
          },
        },
      );
      const d = res.data;
      setProducts(d?.products || []);
      setCounts(d?.counts || { pending: 0, approved: 0, rejected: 0 });
      setTotal(d?.pagination?.total || 0);
      setTotalPages(d?.pagination?.totalPages || 1);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las publicaciones.");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, tab, debouncedSearch, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleTabChange = (id) => {
    setTab(id);
    setPage(1);
  };

  // Aprobar / rechazar. Al rechazar, pedimos el motivo con un modal.
  const handleModerate = async (product, action) => {
    let reason = "";

    if (action === "reject") {
      const { value, isConfirmed } = await Swal.fire({
        title: "Rechazar publicación",
        input: "textarea",
        inputLabel: "Motivo del rechazo (lo verá el vendedor)",
        inputPlaceholder: "Ej: las imágenes no coinciden con la descripción...",
        inputAttributes: { "aria-label": "Motivo del rechazo" },
        showCancelButton: true,
        confirmButtonText: "Rechazar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#e11d48",
        cancelButtonColor: "#71717a",
        background: "#1A1A1A",
        color: "#fff",
        inputValidator: (v) =>
          !v || !v.trim() ? "Tenés que escribir un motivo." : undefined,
      });
      if (!isConfirmed) return;
      reason = String(value).trim();
    }

    setBusyId(product._id);
    try {
      const token = await getAccessToken();
      await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/products/${product._id}/moderate`,
        { action, reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      Swal.fire({
        toast: true,
        position: "top-end",
        title: action === "approve" ? "Publicación aprobada" : "Publicación rechazada",
        icon: "success",
        showConfirmButton: false,
        timer: 1800,
        background: "#1A1A1A",
        color: "#fff",
      });

      await fetchProducts();
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Error",
        text: err?.response?.data?.message || "No se pudo completar la acción.",
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = (product) => {
    const seg = product?.slug || product?._id;
    if (seg) window.open(`/producto/${seg}`, "_blank", "noopener,noreferrer");
  };

  const sellerLabel = (p) =>
    p?.seller?.shop?.name ||
    [p?.seller?.firstName, p?.seller?.lastName].filter(Boolean).join(" ") ||
    p?.seller?.username ||
    "—";

  const mainImage = (p) =>
    p?.images?.find((i) => i.isMain)?.url || p?.images?.[0]?.url || "";

  const formatPrice = (p) => {
    if (p?.sale?.active && p?.sale?.price > 0) {
      return `${p.currency === "ARS" ? "$" : "USD"} ${p.sale.price.toLocaleString("es-AR")}`;
    }
    return `${p?.currency === "ARS" ? "$" : "USD"} ${(p?.price || 0).toLocaleString("es-AR")}`;
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Header: tabs + búsqueda */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black italic uppercase tracking-tighter">
              Moderación de publicaciones
            </h2>
            <p className="text-sm text-zinc-500">
              Revisá, aprobá o rechazá lo que suben los vendedores.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, marca o categoría..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-[#F26722] dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Pestañas por estado con contador */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const count = counts[t.id];
            return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  active
                    ? "bg-[#F26722] text-white shadow-lg shadow-[#F26722]/20"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-[#F26722]"
                }`}
              >
                <Icon size={14} />
                {t.label}
                {count !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${
                      active ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-700"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="p-6 text-sm text-rose-500">{error}</p>}

      {loading ? (
        <div className="p-12">
          <LoadingSpinner size="lg" text="Cargando publicaciones..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Publicación
                  </th>
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Vendedor
                  </th>
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Precio
                  </th>
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Estado
                  </th>
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-sm text-zinc-400">
                      No hay publicaciones en este estado.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const mStatus = p?.moderation?.status || "pending";
                    return (
                      <tr
                        key={p._id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors align-top"
                      >
                        {/* Publicación */}
                        <td className="p-6">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 border border-zinc-100 dark:border-zinc-800">
                              {mainImage(p) ? (
                                <img
                                  src={mainImage(p)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 max-w-xs">
                              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 line-clamp-1">
                                {p.name}
                              </p>
                              <p className="text-xs text-zinc-500 line-clamp-1">
                                {p.category}
                                {p.brand ? ` · ${p.brand}` : ""}
                              </p>
                              {mStatus === "rejected" && p?.moderation?.reason && (
                                <p className="text-[11px] text-rose-500 mt-1 line-clamp-2">
                                  Motivo: {p.moderation.reason}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Vendedor */}
                        <td className="p-6">
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            {sellerLabel(p)}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {p?.seller?.email || "—"}
                          </p>
                        </td>

                        {/* Precio */}
                        <td className="p-6 text-sm font-bold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                          {formatPrice(p)}
                        </td>

                        {/* Estado de moderación */}
                        <td className="p-6">
                          <span
                            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                              STATUS_BADGES[mStatus] || STATUS_BADGES.pending
                            }`}
                          >
                            {mStatus === "pending"
                              ? "Pendiente"
                              : mStatus === "approved"
                                ? "Aprobada"
                                : "Rechazada"}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="p-6">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => handlePreview(p)}
                              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors"
                              title="Vista previa"
                            >
                              <ExternalLink size={18} />
                            </button>

                            {busyId === p._id ? (
                              <Loader2 size={18} className="animate-spin text-zinc-400" />
                            ) : (
                              <>
                                {mStatus !== "approved" && (
                                  <button
                                    onClick={() => handleModerate(p, "approve")}
                                    className="p-2 hover:bg-green-50 dark:hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                                    title="Aprobar"
                                  >
                                    <Check size={18} />
                                  </button>
                                )}
                                {mStatus !== "rejected" && (
                                  <button
                                    onClick={() => handleModerate(p, "reject")}
                                    className="p-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors"
                                    title="Rechazar"
                                  >
                                    <XIcon size={18} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación */}
      {!loading && totalPages > 1 && (
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {total} en total · Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProductsTable;
