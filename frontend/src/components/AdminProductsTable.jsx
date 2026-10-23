import React, { useEffect, useState, useCallback, useRef } from "react";
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
  const [loading, setLoading] = useState(true); // SOLO carga "grande"
  const [refreshingCounts, setRefreshingCounts] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyIds, setBusyIds] = useState(() => new Set()); // filas en proceso
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // ids seleccionados

  const { getAccessToken } = usePrivy();
  const LIMIT = 25;
  const lastQueryRef = useRef("");

  // Debounce de la búsqueda.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Clave de contexto: si cambia (tab/búsqueda/página) se considera "nueva carga"
  // y mostramos el spinner grande. Un refresh tras moderar NO cambia la clave.
  const queryKey = `${tab}|${debouncedSearch}|${page}`;

  const fetchProducts = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
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
        if (!silent) setLoading(false);
      }
    },
    [getAccessToken, tab, debouncedSearch, page],
  );

  useEffect(() => {
    lastQueryRef.current = queryKey;
    setSelected(new Set());
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const handleTabChange = (id) => {
    setTab(id);
    setPage(1);
  };

  // Refresca SOLO los contadores (silencioso, no toca la tabla ni el spinner).
  const refreshCountsSilently = useCallback(async () => {
    setRefreshingCounts(true);
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/products`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { moderation: tab, search: debouncedSearch, page, limit: LIMIT },
        },
      );
      if (res.data?.counts) setCounts(res.data.counts);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshingCounts(false);
    }
  }, [getAccessToken, tab, debouncedSearch, page]);

  // ── Selección ──
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    products.length > 0 && products.every((p) => selected.has(p._id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) products.forEach((p) => next.delete(p._id));
      else products.forEach((p) => next.add(p._id));
      return next;
    });
  };

  // Aprobar / rechazar. Al rechazar, pedimos el motivo con un modal.
  // OPTIMISTA: no recarga con spinner grande, actualiza la fila al instante.
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

    setBusyIds((prev) => new Set(prev).add(product._id));
    try {
      const token = await getAccessToken();
      const res = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/products/${product._id}/moderate`,
        { action, reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const newStatus = action === "approve" ? "approved" : "rejected";
      const updated = res.data?.product;

      if (tab === "pending") {
        // Deja de pertenecer a este tab: la quitamos sin recargar todo.
        setProducts((prev) => prev.filter((p) => p._id !== product._id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        // Otros tabs: actualizamos la fila en memoria.
        setProducts((prev) =>
          prev.map((p) =>
            p._id === product._id
              ? {
                  ...p,
                  ...(updated || {}),
                  moderation: updated?.moderation || {
                    ...p.moderation,
                    status: newStatus,
                    reason,
                  },
                }
              : p,
          ),
        );
      }

      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(product._id);
        return next;
      });

      Swal.fire({
        toast: true,
        position: "top-end",
        title: action === "approve" ? "Publicación aprobada" : "Publicación rechazada",
        icon: "success",
        showConfirmButton: false,
        timer: 1500,
        background: "#1A1A1A",
        color: "#fff",
      });

      refreshCountsSilently(); // contadores en segundo plano
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Error",
        text: err?.response?.data?.message || "No se pudo completar la acción.",
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
      fetchProducts({ silent: true }); // resincroniza sin spinner grande
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(product._id);
        return next;
      });
    }
  };

  // ── Moderación masiva (una sola request al backend) ──
  const handleBulkModerate = async (action) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    let reason = "";
    if (action === "reject") {
      const { value, isConfirmed } = await Swal.fire({
        title: `Rechazar ${ids.length} publicación(es)`,
        input: "textarea",
        inputLabel: "Motivo del rechazo (lo verán los vendedores)",
        inputPlaceholder: "Ej: imágenes no coinciden con la descripción...",
        showCancelButton: true,
        confirmButtonText: "Rechazar todas",
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
    } else {
      const { isConfirmed } = await Swal.fire({
        title: `Aprobar ${ids.length} publicación(es)`,
        text: "Se publicarán de inmediato en el catálogo.",
        showCancelButton: true,
        confirmButtonText: "Aprobar todas",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#16a34a",
        cancelButtonColor: "#71717a",
        background: "#1A1A1A",
        color: "#fff",
      });
      if (!isConfirmed) return;
    }

    setBulkBusy(true);
    try {
      const token = await getAccessToken();
      const res = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/products/moderate-bulk`,
        { ids, action, reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const idSet = new Set(ids);
      const newStatus = action === "approve" ? "approved" : "rejected";
      if (tab === "pending") {
        setProducts((prev) => prev.filter((p) => !idSet.has(p._id)));
        setTotal((t) => Math.max(0, t - (res.data?.modifiedCount ?? ids.length)));
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            idSet.has(p._id)
              ? { ...p, moderation: { ...p.moderation, status: newStatus, reason } }
              : p,
          ),
        );
      }
      setSelected(new Set());
      if (res.data?.counts) setCounts(res.data.counts);

      Swal.fire({
        toast: true,
        position: "top-end",
        title:
          action === "approve"
            ? `${res.data?.modifiedCount ?? ids.length} aprobada(s)`
            : `${res.data?.modifiedCount ?? ids.length} rechazada(s)`,
        icon: "success",
        showConfirmButton: false,
        timer: 1800,
        background: "#1A1A1A",
        color: "#fff",
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Error",
        text: err?.response?.data?.message || "No se pudo completar la acción masiva.",
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
    } finally {
      setBulkBusy(false);
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
          {refreshingCounts && (
            <span className="flex items-center text-zinc-400" title="Actualizando...">
              <Loader2 size={14} className="animate-spin" />
            </span>
          )}
        </div>

        {/* Barra de acciones masivas (aparece al seleccionar) */}
        {selected.size > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#F26722]/5 dark:bg-[#F26722]/10 border border-[#F26722]/20 px-4 py-3">
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
              {selected.size} seleccionada(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkModerate("approve")}
                disabled={bulkBusy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest transition-colors"
              >
                {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Aprobar
              </button>
              <button
                onClick={() => handleBulkModerate("reject")}
                disabled={bulkBusy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest transition-colors"
              >
                {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                Rechazar
              </button>
              <button
                onClick={() => setSelected(new Set())}
                disabled={bulkBusy}
                className="px-3 py-2 rounded-xl text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs font-black uppercase tracking-widest transition-colors"
              >
                Limpiar
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="p-6 text-sm text-rose-500">{error}</p>}

      {loading ? (
        <div className="p-12">
          <LoadingSpinner size="lg" text="Cargando publicaciones..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                  <th className="pl-6 pr-2 py-6 w-10">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 accent-[#F26722] cursor-pointer"
                    />
                  </th>
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
                    <td colSpan={6} className="p-10 text-center text-sm text-zinc-400">
                      No hay publicaciones en este estado.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const mStatus = p?.moderation?.status || "pending";
                    const isBusy = busyIds.has(p._id);
                    const isSelected = selected.has(p._id);
                    return (
                      <tr
                        key={p._id}
                        className={`transition-colors align-top ${
                          isSelected
                            ? "bg-[#F26722]/5 dark:bg-[#F26722]/10"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="pl-6 pr-2 py-6 align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${p.name}`}
                            checked={isSelected}
                            onChange={() => toggleOne(p._id)}
                            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 accent-[#F26722] cursor-pointer"
                          />
                        </td>

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

                            {isBusy ? (
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
