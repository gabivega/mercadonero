import React, { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  RefreshCw,
  ExternalLink,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { usePrivy } from "../Utils/authClient";
import { formatMoney } from "../Utils/currencyFormatter";
import LoadingSpinner from "./LoadingSpinner";

// Etiquetas legibles para cada estado que devuelve el backend
// (collateralAuditService.COLLATERAL_AUDIT_STATES).
const STATE_META = {
  locked_cancelled: {
    label: "Lock en orden cancelada",
    short: "Congelado / cancelada",
    tone: "rose",
    action: "Liberar garantía",
  },
  locked_completed: {
    label: "Lock en orden completada",
    short: "Congelado / completada",
    tone: "rose",
    action: "Liberar garantía",
  },
  release_tx_still_locked: {
    label: "Release registrado pero lock activo",
    short: "Release fallido",
    tone: "amber",
    action: "Re-liberar garantía",
  },
  undeclared_lock: {
    label: "Lock on-chain no declarado en DB",
    short: "Lock no declarado",
    tone: "amber",
    action: "Liberar garantía",
  },
  missing_lock: {
    label: "Lock declarado ya no existe",
    short: "Lock ausente",
    tone: "sky",
    action: "Reconciliar DB",
  },
  unreadable: {
    label: "No se pudo leer on-chain",
    short: "Ilegible",
    tone: "zinc",
    action: "Reintentar lectura",
  },
  clean: {
    label: "Sin observaciones",
    short: "OK",
    tone: "emerald",
    action: "—",
  },
};

const TONE_CLASSES = {
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const AdminCollateralAudit = () => {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [days, setDays] = useState(60);
  const [busyOrderId, setBusyOrderId] = useState(null);

  const isDark = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const swalTheme = () => ({
    background: isDark() ? "#18181b" : "#fff",
    color: isDark() ? "#fff" : "#000",
    customClass: { popup: "rounded-[2.5rem]" },
  });

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      params.set("since", String(days));
      if (onlyAttention) params.set("attention", "true");
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/collateral/audit?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRows(res.data?.orders || []);
      setSummary(res.data?.summary || null);
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "ERROR",
        text:
          err?.response?.data?.message ||
          "No se pudo cargar la auditoría de colateral.",
        icon: "error",
        confirmButtonColor: "#ef4444",
        ...swalTheme(),
      });
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial y cuando cambian filtros.
  useEffect(() => {
    fetchAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, onlyAttention]);

  const doAction = async (order, fn) => {
    setBusyOrderId(order.orderId);
    try {
      const token = await getAccessToken();
      await fn(token);
      await Swal.fire({
        title: "LISTO",
        text: `Acción ejecutada sobre la orden #${order.code}.`,
        icon: "success",
        confirmButtonColor: "#F26722",
        ...swalTheme(),
      });
      await fetchAudit();
    } catch (err) {
      Swal.fire({
        title: "ERROR",
        text:
          err?.response?.data?.message || "No se pudo ejecutar la acción.",
        icon: "error",
        confirmButtonColor: "#ef4444",
        ...swalTheme(),
      });
    } finally {
      setBusyOrderId(null);
    }
  };

  // Acción sugerida por el backend → endpoint real.
  const runRecommendedAction = async (order) => {
    const suggested = order.recommendedAction;
    const meta = STATE_META[order.state] || {};

    if (suggested === "release_guarantee") {
      const c = await Swal.fire({
        title:
          "<span class='font-black uppercase italic'>¿Liberar garantía?</span>",
        html: `Esta acción libera el colateral on-chain de la orden <b>#${order.code}</b> y la marca como CANCELADA.<br/>Lock: <b>${order.onChain?.lockUsd ?? 0} USDT</b>.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#F26722",
        cancelButtonColor: "#18181b",
        confirmButtonText: "SÍ, LIBERAR",
        cancelButtonText: "CANCELAR",
        ...swalTheme(),
      });
      if (!c.isConfirmed) return;
      await doAction(order, async (token) => {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${order.orderId}/release-guarantee`,
          { approve: true, note: "Liberación desde auditoría de colateral" },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      });
      return;
    }

    if (suggested === "complete_order") {
      const c = await Swal.fire({
        title:
          "<span class='font-black uppercase italic'>¿Completar orden?</span>",
        html: `Se cierra la venta <b>#${order.code}</b> como COMPLETADA y se libera la garantía/escrow al vendedor tras cumplirse el buffer.`,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#F26722",
        cancelButtonColor: "#18181b",
        confirmButtonText: "SÍ, COMPLETAR",
        cancelButtonText: "CANCELAR",
        ...swalTheme(),
      });
      if (!c.isConfirmed) return;
      await doAction(order, async (token) => {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${order.orderId}/complete`,
          { note: "Completada desde auditoría de colateral", force: false },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      });
      return;
    }

    if (suggested === "retry_read" || suggested === "reconcile_db") {
      // No hay endpoint que mueva dinero: sólo informamos y recargamos.
      await Swal.fire({
        title: meta.label || "Acción",
        text:
          suggested === "reconcile_db"
            ? "La DB cree que hay un lock que ya no existe on-chain. Revisá la orden desde 'Gestión de Órdenes' para reconciliar el estado."
            : "No se pudo leer el estado on-chain (RPC caído o wallet sin ligar). Volvé a ejecutar la auditoría en unos segundos.",
        icon: "info",
        confirmButtonColor: "#F26722",
        ...swalTheme(),
      });
      await fetchAudit();
      return;
    }

    await Swal.fire({
      title: "Sin acción requerida",
      text: "Esta orden no requiere una acción automática desde la auditoría.",
      icon: "success",
      confirmButtonColor: "#F26722",
      ...swalTheme(),
    });
  };

  const KpiCard = ({ icon: Icon, label, value, tone = "zinc" }) => (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-2xl flex items-center justify-center ${TONE_CLASSES[tone]}`}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-black leading-none">{value ?? 0}</p>
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mt-1">
          {label}
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-12">
        <LoadingSpinner size="lg" text="Auditando colateral on-chain..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={ShieldAlert}
          label="Requieren atención"
          value={summary?.needsAttention}
          tone="rose"
        />
        <KpiCard
          icon={Clock}
          label="Listas para completar"
          value={summary?.bufferReady}
          tone="amber"
        />
        <KpiCard
          icon={Lock}
          label="Locks huérfanos"
          value={
            (summary?.lockedCancelled || 0) +
            (summary?.lockedCompleted || 0) +
            (summary?.undeclaredLock || 0) +
            (summary?.releaseTxStillLocked || 0)
          }
          tone="rose"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Sin observaciones"
          value={summary?.clean}
          tone="emerald"
        />
      </div>

      {/* Controles + Tabla */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 flex flex-wrap items-center gap-4 border-b border-zinc-100 dark:border-zinc-800">
          <label className="flex items-center gap-2 text-sm font-bold text-zinc-500">
            Ventana:
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-sm font-bold"
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={180}>180 días</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-bold text-zinc-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAttention}
              onChange={(e) => setOnlyAttention(e.target.checked)}
              className="accent-[#F26722] w-4 h-4"
            />
            Solo con atención
          </label>

          <button
            onClick={fetchAudit}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F26722] text-white text-sm font-black uppercase tracking-wider hover:brightness-110 transition"
          >
            <RefreshCw size={16} /> Re-auditar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                {[
                  "Orden",
                  "Estado",
                  "Lock on-chain",
                  "DB",
                  "Recepción",
                  "Detalle",
                  "Acción",
                ].map((h) => (
                  <th
                    key={h}
                    className="p-5 text-[11px] font-black uppercase tracking-widest text-zinc-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-12 text-center text-zinc-400 font-medium italic"
                  >
                    No hay órdenes que auditar en esta ventana.
                  </td>
                </tr>
              )}
              {rows.map((order) => {
                const meta = STATE_META[order.state] || STATE_META.clean;
                const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.zinc;
                const busy = busyOrderId === order.orderId;
                const canAct =
                  order.recommendedAction && order.recommendedAction !== "none";
                return (
                  <tr
                    key={order.orderId}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors align-top"
                  >
                    <td className="p-5">
                      <div className="font-mono text-xs text-zinc-500">
                        #{order.code}
                      </div>
                      <div className="mt-1 text-sm font-bold">
                        {order.seller?.name || "—"}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {order.seller?.walletAddress
                          ? `${order.seller.walletAddress.slice(0, 6)}…${order.seller.walletAddress.slice(-4)}`
                          : "sin wallet"}
                      </div>
                    </td>

                    <td className="p-5">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${tone}`}
                      >
                        {meta.short}
                      </span>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        {order.status}
                        {order.totalAmount
                          ? ` · $${formatMoney(order.totalAmount)}`
                          : ""}
                      </div>
                    </td>

                    <td className="p-5">
                      {order.onChain?.locked ? (
                        <span className="flex items-center gap-1.5 text-rose-500 font-black text-sm">
                          <Lock size={14} /> {order.onChain.lockUsd} USDT
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-500 font-bold text-sm">
                          <Unlock size={14} /> liberado
                        </span>
                      )}
                      {order.onChain?.lockedChainId != null && (
                        <div className="text-[11px] text-zinc-400 mt-1">
                          chain {order.onChain.lockedChainId}
                        </div>
                      )}
                    </td>

                    <td className="p-5 text-[11px] text-zinc-500">
                      {order.db?.believesLocked ? "cree lockeado" : "—"}
                      {order.db?.believesReleased ? "cree liberado" : ""}
                      {order.db?.releaseRequested && (
                        <span className="block mt-1 text-[10px] font-black uppercase text-amber-500">
                          release pendiente
                        </span>
                      )}
                    </td>

                    <td className="p-5 text-[11px] text-zinc-500">
                      {order.reception?.bufferReached ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          buffer OK
                        </span>
                      ) : order.reception?.releaseEligibleAt ? (
                        <span>
                          faltan {Math.ceil(order.reception.hoursLeft || 0)} h
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="p-5 text-[11px] text-zinc-500 max-w-[220px]">
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                        {meta.label}
                      </span>
                      {order.onChain?.readableChains?.length === 0 && (
                        <span className="mt-1 text-rose-400 flex items-center gap-1">
                          <AlertTriangle size={12} /> sin lectura RPC
                        </span>
                      )}
                    </td>

                    <td className="p-5">
                      {canAct ? (
                        <button
                          onClick={() => runRecommendedAction(order)}
                          disabled={busy}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black text-[11px] font-black uppercase tracking-wider hover:bg-[#F26722] dark:hover:bg-[#F26722] dark:hover:text-white transition disabled:opacity-50"
                        >
                          {busy ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <ExternalLink size={13} />
                          )}
                          {meta.action}
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCollateralAudit;
