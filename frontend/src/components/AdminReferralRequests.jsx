import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { usePrivy } from "../Utils/authClient";
import Swal from "sweetalert2";
import {
  UserCheck,
  Clock,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  Search,
  Loader2,
  BadgeCheck,
  CheckCircle2,
} from "lucide-react";
import { InlineLoadingSpinner } from "./LoadingSpinner.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// AdminReferralRequests
//
// Panel de ADMIN para aprobar/rechazar solicitudes de REFERIDOR.
// El programa de referidos tiene una barrera de entrada: el usuario debe
// solicitar acceso (con su perfil completo) y un admin lo aprueba manualmente.
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "pending", label: "Pendientes", cls: "text-amber-500" },
  { key: "approved", label: "Aprobados", cls: "text-green-500" },
  { key: "rejected", label: "Rechazados", cls: "text-rose-500" },
  { key: "all", label: "Todos", cls: "text-gray-500" },
];

export default function AdminReferralRequests() {
  const { getAccessToken } = usePrivy();
  const serverUrl = import.meta.env.VITE_SERVER_URL;

  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${serverUrl}/api/admin/referral/requests`,
        {
          params: { status: tab, search },
          headers: await authHeaders(),
        },
      );
      setRequests(data.requests || []);
      setCounts(data.counts || { pending: 0, approved: 0, rejected: 0 });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({
        title: "Error",
        text: msg,
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
    } finally {
      setLoading(false);
    }
  }, [serverUrl, authHeaders, tab, search]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Aprobar ──
  const handleApprove = async (req) => {
    setBusyId(req._id);
    try {
      await axios.patch(
        `${serverUrl}/api/admin/referral/requests/${req._id}`,
        { action: "approve" },
        { headers: await authHeaders() },
      );
      Swal.fire({
        toast: true,
        position: "top-end",
        title: "Referidor aprobado",
        icon: "success",
        showConfirmButton: false,
        timer: 1800,
        background: "#1A1A1A",
        color: "#fff",
      });
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({
        title: "Error",
        text: msg,
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
    } finally {
      setBusyId(null);
    }
  };

  // ── Rechazar (motivo obligatorio) ──
  const handleReject = async (req) => {
    const { value: reason, isConfirmed } = await Swal.fire({
      title: "Rechazar solicitud",
      html: `
        <p style="font-size:12px;opacity:.7;margin-bottom:8px">Indicá el motivo (se le muestra al usuario):</p>
        <textarea id="swal-reason" class="swal2-textarea" placeholder="Motivo del rechazo..."></textarea>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Rechazar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
      background: "#1A1A1A",
      color: "#fff",
      preConfirm: () => document.getElementById("swal-reason").value.trim(),
    });
    if (!isConfirmed) return;
    if (!reason) {
      return Swal.fire({
        title: "Falta el motivo",
        text: "El motivo de rechazo es obligatorio.",
        icon: "warning",
        background: "#1A1A1A",
        color: "#fff",
      });
    }

    setBusyId(req._id);
    try {
      await axios.patch(
        `${serverUrl}/api/admin/referral/requests/${req._id}`,
        { action: "reject", reason },
        { headers: await authHeaders() },
      );
      Swal.fire({
        toast: true,
        position: "top-end",
        title: "Solicitud rechazada",
        icon: "success",
        showConfirmButton: false,
        timer: 1800,
        background: "#1A1A1A",
        color: "#fff",
      });
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({
        title: "Error",
        text: msg,
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
    } finally {
      setBusyId(null);
    }
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#F26722]/10 text-[#F26722]">
          <UserCheck size={20} />
        </div>
        <div>
          <h2 className="font-black text-sm uppercase tracking-wider text-gray-800 dark:text-white">
            Solicitudes de Referidor
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Aprobá manualmente quién puede compartir enlaces y ganar comisiones.
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
          title="Recargar"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs + buscador */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count =
            t.key === "all"
              ? counts.pending + counts.approved + counts.rejected
              : counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                active
                  ? "bg-[#F26722] text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {t.label}
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  active ? "bg-white/25" : "bg-black/5 dark:bg-white/10"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        <div className="relative ml-auto">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#F26722] dark:text-white w-64"
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <InlineLoadingSpinner size="lg" text="Cargando solicitudes..." />
        </div>
      ) : requests.length === 0 ? (
        <div className="py-14 text-center text-gray-400 text-sm font-bold border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[24px]">
          No hay solicitudes {tab !== "all" ? `en estado "${tab}"` : ""}.
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
          {requests.map((r) => (
            <div
              key={r._id}
              className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              {/* Datos */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm dark:text-white truncate">
                    {r.fullName || r.username || r.email || "—"}
                  </span>
                  {r.referralStatus === "approved" && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-green-500/10 text-green-500">
                      <BadgeCheck size={11} /> Aprobado
                    </span>
                  )}
                  {r.referralStatus === "pending" && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-500">
                      <Clock size={11} /> Pendiente
                    </span>
                  )}
                  {r.referralStatus === "rejected" && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/10 text-rose-500">
                      <ShieldX size={11} /> Rechazado
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {r.email} · Solicitó: {fmtDate(r.requestedAt)}
                </p>
                {r.referralStatus === "rejected" && r.reason && (
                  <p className="text-[10px] text-rose-500 mt-0.5">
                    Motivo: {r.reason}
                  </p>
                )}
                {r.referralStatus === "approved" && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Ganado: US$ {(r.earned ?? 0).toFixed(2)} · Saldo: US${" "}
                    {(r.balance ?? 0).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {r.referralStatus === "pending" && (
                  <>
                    <button
                      onClick={() => handleApprove(r)}
                      disabled={busyId === r._id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 text-green-600 font-bold text-[11px] hover:bg-green-500/20 disabled:opacity-50"
                    >
                      {busyId === r._id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={13} />
                      )}
                      Aprobar
                    </button>
                    <button
                      onClick={() => handleReject(r)}
                      disabled={busyId === r._id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-600 font-bold text-[11px] hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <ShieldX size={13} /> Rechazar
                    </button>
                  </>
                )}
                {r.referralStatus === "approved" && (
                  <button
                    onClick={() => handleReject(r)}
                    disabled={busyId === r._id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-600 font-bold text-[11px] hover:bg-rose-500/20 disabled:opacity-50"
                    title="Revocar acceso como referidor"
                  >
                    <ShieldX size={13} /> Revocar
                  </button>
                )}
                {r.referralStatus === "rejected" && (
                  <button
                    onClick={() => handleApprove(r)}
                    disabled={busyId === r._id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 text-green-600 font-bold text-[11px] hover:bg-green-500/20 disabled:opacity-50"
                  >
                    <ShieldCheck size={13} /> Aprobar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 leading-relaxed">
        Solo los referidores aprobados pueden ver el catálogo de productos
        habilitados y generar enlaces con su código. Revocar el acceso no borra
        las comisiones ya acreditadas.
      </p>
    </div>
  );
}
