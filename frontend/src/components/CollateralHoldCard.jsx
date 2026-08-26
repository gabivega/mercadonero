import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import Swal from "sweetalert2";
import { Hourglass, AlertTriangle, ShieldCheck, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";

/**
 * CollateralHoldCard
 * ------------------
 * Tarjeta de estado para órdenes en "awaiting_collateral" (el vendedor aún no
 * tiene colateral suficiente y debe depositarlo para activar la orden).
 *
 * - VENDEDOR: ve un countdown y puede (a) ir a depositar su garantía y
 *   (b) pulsar "Deposité, activar orden" cuando ya depositó.
 * - COMPRADOR: ve que el vendedor está depositando y puede cancelar la espera
 *   para buscar este producto en otro vendedor.
 *
 * Props:
 *   order  : la orden (debe tener status "awaiting_collateral")
 *   role   : "seller" | "buyer"
 *   onUpdate: callback para refrescar la orden tras una acción.
 */
export default function CollateralHoldCard({ order, role = "buyer", onUpdate }) {
  const { getAccessToken } = usePrivy();
  const navigate = useNavigate();

  const expiresAt = order.collateralHold?.expiresAt;
  const reserveUsd = order.collateralHold?.reserveUsd || 0;

  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  // Countdown en tiempo real
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const msLeft = expiresAt ? new Date(expiresAt).getTime() - now : 0;
  const expired = msLeft <= 0;
  const minutes = Math.max(0, Math.floor(msLeft / 60000));
  const seconds = Math.max(0, Math.floor((msLeft % 60000) / 1000));
  const display = expired
    ? "00:00"
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const handleRetry = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}/retry-collateral`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      Swal.fire({
        icon: "success",
        title: "¡Orden activada!",
        text: "Tu colateral fue congelado y el comprador ya puede pagar.",
        confirmButtonColor: "#3483fa",
      });
      onUpdate?.();
    } catch (error) {
      const msg = error.response?.data?.message || "No se pudo activar la orden.";
      Swal.fire({
        icon: "error",
        title: "No se pudo activar",
        text: msg,
        confirmButtonColor: "#3483fa",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelHold = async () => {
    const confirm = await Swal.fire({
      icon: "warning",
      title:
        role === "seller"
          ? "¿Rechazar esta venta?"
          : "¿Buscar en otro vendedor?",
      text:
        role === "seller"
          ? "Si no podés cubrir esta garantía, rechazá la venta para que el comprador pueda buscar este producto en otro vendedor de inmediato, en vez de esperar a que expire la orden."
          : "Cancelarás esta espera y podrás buscar este producto en otro vendedor. No se te descontará nada.",
      showCancelButton: true,
      confirmButtonText:
        role === "seller" ? "Sí, rechazar venta" : "Sí, buscar otro",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#F26722",
      cancelButtonColor: isDark ? "#27272a" : "#6b7280",
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}/cancel-collateral-hold`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      Swal.fire({
        icon: "success",
        title: "Espera liberada",
        text:
          role === "seller"
            ? "Rechazaste la venta. El comprador fue notificado y podrá buscar este producto en otro vendedor."
            : "Podés buscar este producto en otro vendedor.",
        confirmButtonColor: "#3483fa",
      });
      if (role === "buyer") {
        // Volver a la lista de compras / carrito
        navigate("/compras");
      } else {
        onUpdate?.();
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.response?.data?.message || "No se pudo liberar la espera.",
        confirmButtonColor: "#3483fa",
      });
    } finally {
      setLoading(false);
    }
  };

  const goToWallet = () => navigate("/billetera");

  return (
    <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800 overflow-hidden">
      {/* Resaltado superior */}
      <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-[#F26722] -mt-6 mb-6" />

      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-2xl shrink-0 ${expired ? "bg-red-50 dark:bg-red-900/20 text-red-500" : "bg-amber-50 dark:bg-amber-900/20 text-amber-500"}`}>
          {expired ? <AlertTriangle size={26} /> : <Hourglass size={26} />}
        </div>

        <div className="flex-1">
          <h3 className="font-black uppercase tracking-tight dark:text-white text-sm flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#F26722]" />
            {role === "seller" ? "Venta en espera por garantía" : "Esperando que el vendedor deposite su garantía"}
          </h3>

          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-2">
            {role === "seller" ? (
              <>
                El comprador quiere comprarte por{" "}
                <b className="text-[#F26722]">US$ {reserveUsd.toFixed(2)}</b> de garantía, pero no tenés saldo libre
                suficiente. Depositá esa garantía antes de que venza el plazo para no perder la venta.
              </>
            ) : (
              <>
                El vendedor necesita depositar su fondo de garantía para activar tu compra. Por si elegís esperar,
                no se descontará nada hasta que el vendedor confirme. 
              </>
            )}
          </p>

          {/* Countdown */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className={`px-4 py-2 rounded-xl font-mono text-xl font-black tracking-widest ${expired ? "bg-red-50 dark:bg-red-900/20 text-red-500" : "bg-amber-50 dark:bg-amber-900/20 text-amber-600"} `}>
              {display}
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {expired ? "Plazo vencido" : `para depositar la garantía de protección de compra.`}
            </span>
          </div>

          {/* Acciones */}
          <div className="mt-5 flex flex-wrap gap-3">
            {role === "seller" ? (
              <>
                <button
                  onClick={goToWallet}
                  className="flex items-center gap-2 bg-[#F26722] hover:bg-[#d95514] text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                >
                  <ExternalLink size={16} /> Ir a depositar garantía
                </button>
                <button
                  onClick={handleRetry}
                  disabled={loading || expired}
                  className="flex items-center gap-2 bg-[#3483fa] hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <LoadingSpinner size="sm" /> : <RefreshCw size={16} />}
                  Deposité, activar orden
                </button>
                <button
                  onClick={handleCancelHold}
                  disabled={loading || expired}
                  className="flex items-center gap-2 border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? <LoadingSpinner size="sm" /> : <XCircle size={16} />}
                  Rechazar esta venta
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-2 rounded-lg">
                  <Hourglass size={14} /> Sin cargo hasta que el vendedor confirme la garantía.
                </span>
                <button
                  onClick={handleCancelHold}
                  disabled={loading}
                  className="flex items-center gap-2 border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  Buscar en otro vendedor
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nota inferior para el comprador */}
      {role === "buyer" && !expired && (
        <p className="mt-4 text-[11px] text-zinc-400 dark:text-zinc-500 border-t dark:border-zinc-800 pt-3">
          Si preferís esperar, esta orden se activará automáticamente apenas el vendedor confirme su garantía.
          Si no lo hace antes del plazo, se cancelará sin costo para vos.
        </p>
      )}
    </section>
  );
}
