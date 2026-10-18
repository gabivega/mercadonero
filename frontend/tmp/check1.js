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
  Loader2
} from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import { usePrivy } from "../Utils/authClient";
import LoadingSpinner from "./LoadingSpinner";
const TABS = [
  { id: "pending", label: "Pendientes", icon: Clock },
  { id: "approved", label: "Aprobadas", icon: CheckCircle2 },
  { id: "rejected", label: "Rechazadas", icon: Ban },
  { id: "all", label: "Todas", icon: Layers }
];
const STATUS_BADGES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
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
  const [busyId, setBusyId] = useState(null);
  const { getAccessToken } = usePrivy();
  const LIMIT = 25;
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
            limit: LIMIT
          }
        }
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
  const handleModerate = async (product, action) => {
    let reason = "";
    if (action === "reject") {
      const { value, isConfirmed } = await Swal.fire({
        title: "Rechazar publicaci\xF3n",
        input: "textarea",
        inputLabel: "Motivo del rechazo (lo ver\xE1 el vendedor)",
        inputPlaceholder: "Ej: las im\xE1genes no coinciden con la descripci\xF3n...",
        inputAttributes: { "aria-label": "Motivo del rechazo" },
        showCancelButton: true,
        confirmButtonText: "Rechazar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#e11d48",
        cancelButtonColor: "#71717a",
        background: "#1A1A1A",
        color: "#fff",
        inputValidator: (v) => !v || !v.trim() ? "Ten\xE9s que escribir un motivo." : void 0
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
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire({
        toast: true,
        position: "top-end",
        title: action === "approve" ? "Publicaci\xF3n aprobada" : "Publicaci\xF3n rechazada",
        icon: "success",
        showConfirmButton: false,
        timer: 1800,
        background: "#1A1A1A",
        color: "#fff"
      });
      await fetchProducts();
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Error",
        text: err?.response?.data?.message || "No se pudo completar la acci\xF3n.",
        icon: "error",
        background: "#1A1A1A",
        color: "#fff"
      });
    } finally {
      setBusyId(null);
    }
  };
  const handlePreview = (product) => {
    const seg = product?.slug || product?._id;
    if (seg) window.open(`/producto/${seg}`, "_blank", "noopener,noreferrer");
  };
  const sellerLabel = (p) => p?.seller?.shop?.name || [p?.seller?.firstName, p?.seller?.lastName].filter(Boolean).join(" ") || p?.seller?.username || "\u2014";
  const mainImage = (p) => p?.images?.find((i) => i.isMain)?.url || p?.images?.[0]?.url || "";
  const formatPrice = (p) => {
    if (p?.sale?.active && p?.sale?.price > 0) {
      return `${p.currency === "ARS" ? "$" : "USD"} ${p.sale.price.toLocaleString("es-AR")}`;
    }
    return `${p?.currency === "ARS" ? "$" : "USD"} ${(p?.price || 0).toLocaleString("es-AR")}`;
  };
  return /* @__PURE__ */ React.createElement("div", { className: "bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "p-6 border-b border-zinc-100 dark:border-zinc-800 space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-black italic uppercase tracking-tighter" }, "Moderaci\xF3n de publicaciones"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-zinc-500" }, "Revis\xE1, aprob\xE1 o rechaz\xE1 lo que suben los vendedores.")), /* @__PURE__ */ React.createElement("div", { className: "relative w-full sm:w-80" }, /* @__PURE__ */ React.createElement(
    Search,
    {
      size: 16,
      className: "absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: search,
      onChange: (e) => setSearch(e.target.value),
      placeholder: "Buscar por nombre, marca o categor\xEDa...",
      className: "w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-[#F26722] dark:text-zinc-100"
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, TABS.map((t) => {
    const Icon = t.icon;
    const active = tab === t.id;
    const count = counts[t.id];
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: t.id,
        onClick: () => handleTabChange(t.id),
        className: `flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? "bg-[#F26722] text-white shadow-lg shadow-[#F26722]/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-[#F26722]"}`
      },
      /* @__PURE__ */ React.createElement(Icon, { size: 14 }),
      t.label,
      count !== void 0 && /* @__PURE__ */ React.createElement(
        "span",
        {
          className: `ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${active ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-700"}`
        },
        count
      )
    );
  }))), error && /* @__PURE__ */ React.createElement("p", { className: "p-6 text-sm text-rose-500" }, error), loading ? /* @__PURE__ */ React.createElement("div", { className: "p-12" }, /* @__PURE__ */ React.createElement(LoadingSpinner, { size: "lg", text: "Cargando publicaciones..." })) : /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-[820px]" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50" }, /* @__PURE__ */ React.createElement("th", { className: "p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400" }, "Publicaci\xF3n"), /* @__PURE__ */ React.createElement("th", { className: "p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400" }, "Vendedor"), /* @__PURE__ */ React.createElement("th", { className: "p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400" }, "Precio"), /* @__PURE__ */ React.createElement("th", { className: "p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400" }, "Estado"), /* @__PURE__ */ React.createElement("th", { className: "p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400 text-right" }, "Acciones"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-zinc-100 dark:divide-zinc-800" }, products.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "p-10 text-center text-sm text-zinc-400" }, "No hay publicaciones en este estado.")) : products.map((p) => {
    const mStatus = p?.moderation?.status || "pending";
    return /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: p._id,
        className: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors align-top"
      },
      /* @__PURE__ */ React.createElement("td", { className: "p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 border border-zinc-100 dark:border-zinc-800" }, mainImage(p) ? /* @__PURE__ */ React.createElement(
        "img",
        {
          src: mainImage(p),
          alt: "",
          className: "w-full h-full object-cover"
        }
      ) : null), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 max-w-xs" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-zinc-800 dark:text-zinc-200 line-clamp-1" }, p.name), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-zinc-500 line-clamp-1" }, p.category, p.brand ? ` \xB7 ${p.brand}` : ""), mStatus === "rejected" && p?.moderation?.reason && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-rose-500 mt-1 line-clamp-2" }, "Motivo: ", p.moderation.reason)))),
      /* @__PURE__ */ React.createElement("td", { className: "p-6" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm text-zinc-700 dark:text-zinc-300" }, sellerLabel(p)), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-zinc-400" }, p?.seller?.email || "\u2014")),
      /* @__PURE__ */ React.createElement("td", { className: "p-6 text-sm font-bold text-zinc-800 dark:text-zinc-200 whitespace-nowrap" }, formatPrice(p)),
      /* @__PURE__ */ React.createElement("td", { className: "p-6" }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: `px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_BADGES[mStatus] || STATUS_BADGES.pending}`
        },
        mStatus === "pending" ? "Pendiente" : mStatus === "approved" ? "Aprobada" : "Rechazada"
      )),
      /* @__PURE__ */ React.createElement("td", { className: "p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-end items-center gap-2" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handlePreview(p),
          className: "p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors",
          title: "Vista previa"
        },
        /* @__PURE__ */ React.createElement(ExternalLink, { size: 18 })
      ), busyId === p._id ? /* @__PURE__ */ React.createElement(Loader2, { size: 18, className: "animate-spin text-zinc-400" }) : /* @__PURE__ */ React.createElement(React.Fragment, null, mStatus !== "approved" && /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleModerate(p, "approve"),
          className: "p-2 hover:bg-green-50 dark:hover:bg-green-500/10 text-green-500 rounded-lg transition-colors",
          title: "Aprobar"
        },
        /* @__PURE__ */ React.createElement(Check, { size: 18 })
      ), mStatus !== "rejected" && /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleModerate(p, "reject"),
          className: "p-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors",
          title: "Rechazar"
        },
        /* @__PURE__ */ React.createElement(XIcon, { size: 18 })
      ))))
    );
  }))))), !loading && totalPages > 1 && /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-zinc-500" }, total, " en total \xB7 P\xE1gina ", page, " de ", totalPages), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setPage((p) => Math.max(1, p - 1)),
      disabled: page <= 1,
      className: "p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    },
    /* @__PURE__ */ React.createElement(ChevronLeft, { size: 16 })
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setPage((p) => Math.min(totalPages, p + 1)),
      disabled: page >= totalPages,
      className: "p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    },
    /* @__PURE__ */ React.createElement(ChevronRight, { size: 16 })
  ))));
};
var AdminProductsTable_default = AdminProductsTable;
export {
  AdminProductsTable_default as default
};
