import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  MoreVertical,
  AlertTriangle,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';

const ConfirmPaymentAction = ({ orderId, onUpdate, order }) => {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
    // Marca de tiempo que se refresca para mostrar el conteo de la ventana de
  // espera (solo mientras el menú está abierto). Sin cronjobs: se calcula del
  // lado del cliente contra el timestamp de la notificación del comprador.
  const [now, setNow] = useState(() => Date.now());
  const menuRef = useRef(null);

  // Distinguimos dos situaciones:
  //  - 'verifying_payment': el COMPRADOR notificó el pago manualmente.
  //  - 'pending_payment'  : el comprador NO notificó el pago. El vendedor lo
  //    confirma por su cuenta (petición del usuario). Requiere una confirmación
  //    extra de seguridad, avisando que el comprador no marcó el pago.
  const requiresExtraConfirm = order?.status === "pending_payment";

    // ── Configuración de la ventana de espera para reportar pago no recibido ──
  // Cuántos minutos esperamos desde que el comprador notificó el pago antes de
  // habilitar al vendedor a reportar "el pago no ingresó".
  const WAIT_MINUTES = 30;
  const WAIT_MS = WAIT_MINUTES * 60 * 1000;

  // La disputa por "pago no recibido" solo aplica si el comprador notificó el
  // pago (verifying_payment), la orden no es crypto y NO hay una disputa abierta.
  const notifiable =
    order?.status === "verifying_payment" &&
    order?.payment?.method !== "crypto" &&
    !order?.dispute?.exists;

  // Momento en que el comprador notificó el pago ('verifying_payment').
  // Preferimos la marca dedicada `verifyingPaymentNotifiedAt` (el backend la
  // setea al notificar). Para órdenes antiguas (creadas antes de ese campo)
  // caemos al historial o a `updatedAt`, que en `verifying_payment` queda
  // congelado en la notificación mientras el vendedor no la confirme/la anule.
  const notifiedAtStr = [
    order?.verifyingPaymentNotifiedAt,
    order?.statusHistory?.find?.((s) => s.status === "verifying_payment")
      ?.changedAt,
    order?.updatedAt,
  ].find(Boolean);
  const notifiedAt = notifiedAtStr ? new Date(notifiedAtStr).getTime() : null;

  const elapseMs = notifiedAt ? now - notifiedAt : null;
  const canReportMissingPayment =
    !requiresExtraConfirm &&
    notifiable &&
    elapseMs !== null &&
    elapseMs >= WAIT_MS;
  const remainingMs =
    elapseMs !== null ? Math.max(0, WAIT_MS - elapseMs) : 0;

  // Refrescar el "ahora" mientras se muestre el conteo de espera de la disputa
  // (menú abierto). Sin cronjobs globales: solo un intervalo local al abrir.
  useEffect(() => {
    if (!menuOpen) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [menuOpen]);

  // Cerrar el menú al hacer clic fuera.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const formatRemaining = (ms) => {
    if (!ms || ms <= 0) return "";
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m <= 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  // ── El vendedor abre la disputa de "pago no recibido". ──
  const handleReportMissingPayment = async () => {
    setMenuOpen(false);
    if (canReportMissingPayment) {
      // Usuario tardío; pasó el plazo → proseguir directo a la confirmación.
      await doReportMissingPayment();
      return;
    }
    const remaining = elapseMs !== null ? WAIT_MS - elapseMs : 0;
    const minutesLeft = Math.ceil(remaining / 60000);
    await Swal.fire({
      title: '<span class="font-black uppercase italic">Todavía no</span>',
      html:
        `Aún <b>no podés reportar</b> que el pago no ingresó.<br/><br/>` +
        `El comprador notificó el pago hace poco. Esperá unos <b>${minutesLeft} min</b> ` +
        `(total: ${WAIT_MINUTES} min desde la notificación) para poder marcarlo como no pagado.`,
      icon: 'info',
      confirmButtonColor: '#6366f1',
      background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem]' },
    });
  };

  const doReportMissingPayment = async () => {
    const confirm = await Swal.fire({
      title: '<span class="font-black uppercase italic">No recibí el pago</span>',
      html:
        `Pasaron más de <b>${WAIT_MINUTES} min</b> desde que el comprador notificó el pago, ` +
        `y <b>declarás que el dinero no te llegó</b>.<br/><br/>` +
        `Esta acción abre una <b>disputa</b> que resolverá un admin manualmente. ` +
        `Tu garantía queda retenida y se revisará el caso.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, ABRIR DISPUTA',
      cancelButtonText: 'CANCELAR',
      background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-red-500/20' },
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}/dispute`,
        { issueType: "El pago del comprador no ingresó." },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
        await Swal.fire({
          title: 'DISPUTA INICIADA',
          html: `Se registró tu reporte de pago no recibido para la orden. Un <b>admin</b> revisará el caso y te contactará.`,
          icon: 'success',
          confirmButtonColor: '#6366f1',
          background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
          color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
          customClass: { popup: 'rounded-[2.5rem]' },
        });
        onUpdate(); // fetchOrder() en el padre
      }
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'No se pudo registrar el reporte. Intentá de nuevo.';
      Swal.fire({
        title: 'NO SE PUDO REPORTAR',
        html: msg,
        icon: 'error',
        confirmButtonColor: '#ef4444',
        background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
        customClass: { popup: 'rounded-[2.5rem]' },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    let result = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿Confirmar Recepción?</span>',
      text: requiresExtraConfirm
        ? "El comprador NO notificó el pago en la plataforma. Al confirmar, declarás que igualmente recibiste el dinero y que asumís la responsabilidad si esto no fuera correcto. Esto habilitará el despacho del producto."
        : "Al confirmar, declaras que has recibido el dinero. Esto habilitará el despacho del producto.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981', // Verde éxito
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, RECIBÍ EL PAGO',
      cancelButtonText: 'VOLVER',
      background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-emerald-500/20' }
    });

    // Para el caso 'pending_payment', además mostramos una segunda confirmación
    // reforzada (medida de seguridad ante una confirmación sin notificación).
    if (result.isConfirmed && requiresExtraConfirm) {
      result = await Swal.fire({
        title: '<span class="font-black uppercase italic">Confirmación final</span>',
        text: "¿Seguro que querés marcar esta orden como pagada sin que el comprador lo haya notificado? Es una acción con registro de auditoría. No podés deshacerla.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#18181b',
        confirmButtonText: 'SÍ, MARCO COMO PAGADA',
        cancelButtonText: 'CANCELAR',
        background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
        customClass: { popup: 'rounded-[2.5rem] border-2 border-red-500/20' }
      });
    }

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const { data } = await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}`,
          { status: 'paid' },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (data.success) {
          await Swal.fire({
            title: '¡PAGO CONFIRMADO!',
            text: 'La orden ahora está lista para ser enviada.',
            icon: 'success',
            confirmButtonColor: '#10b981',
            background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
            color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
            customClass: { popup: 'rounded-[2.5rem]' }
          });
          onUpdate(); // fetchOrder() en el padre
        }
      } catch (error) {
        Swal.fire({
          title: 'ERROR',
          text: error.response?.data?.message || 'No se pudo confirmar el pago.',
          icon: 'error',
          confirmButtonColor: '#ef4444',
          background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
          color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
          customClass: { popup: 'rounded-[2.5rem]' }
        });
      } finally {
        setLoading(false);
      }
    }
  };

      return (
    <div className={`relative border-2 p-6 rounded-[2.5rem] shadow-sm ${requiresExtraConfirm ? 'bg-amber-500/5 border-amber-500/40' : 'bg-emerald-500/5 border-emerald-500/30'}`}>
      {/* Header con el menú de acciones (3 puntitos) para el vendedor */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-xl text-white shadow-lg shrink-0 ${requiresExtraConfirm ? 'bg-amber-500 shadow-amber-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>
          <ShieldCheck size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight dark:text-white italic text-lg pt-1">Verificación de Pago</h3>

        {/* 3 puntitos: solo cuando el vendedor puede reportar "el pago no
            ingresó" (comprador notificó el pago = verifying_payment). */}
        {notifiable && !loading && (
          <div className="ml-auto relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`p-2 rounded-xl transition-colors text-white shadow-lg hover:brightness-110 focus:outline-none ${
                requiresExtraConfirm
                  ? 'bg-amber-500 shadow-amber-500/20'
                  : 'bg-zinc-500/70 dark:bg-zinc-700 shadow-zinc-500/20 hover:bg-zinc-600'
              }`}
              aria-label="Más acciones"
            >
              <MoreVertical size={18} />
            </button>

            {menuOpen && (
              <div className={`absolute right-0 top-12 z-20 w-64 rounded-2xl border shadow-xl overflow-hidden ${
                requiresExtraConfirm
                  ? 'bg-amber-50 dark:bg-[#242424] border-amber-200 dark:border-zinc-700'
                  : 'bg-white dark:bg-[#1c1c1c] border-zinc-200 dark:border-zinc-700'
              }`}>
                <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
                  <p className="text-[11px] uppercase tracking-widest font-black text-zinc-400">Acciones del vendedor</p>
                </div>

                <button
                  type="button"
                  onClick={handleReportMissingPayment}
                  disabled={loading}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left transition-colors hover:bg-red-500/5 disabled:opacity-50"
                >
                  {canReportMissingPayment ? (
                    <AlertTriangle size={18} className="mt-0.5 text-red-500 shrink-0" />
                  ) : (
                    <span className="mt-0.5 w-[18px] text-center text-zinc-400 text-xs font-black">⏳</span>
                  )}
                  <span>
                    <span className={`block font-bold text-sm ${canReportMissingPayment ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      El pago no ingresó
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                      {canReportMissingPayment
                        ? 'Ya pasó la espera (30 min). Reportá que el dinero no te llegó para que el admin intervenga.'
                        : `Habilitado en ${formatRemaining(remainingMs)} (min 30 desde la notificación).`}
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium leading-relaxed">
        {requiresExtraConfirm ? (
          <>
            El comprador aún <b>no notificó el pago</b> en la plataforma. Si vos
            ya verificaste que el dinero te llegó, podés marcar la orden como
            pagada por tu cuenta para continuar con el despacho.
          </>
        ) : (
          <>El comprador indica que ya realizó el pago. {canReportMissingPayment ? (
            <>Verifica tu cuenta. Si el dinero <b>no te llegó</b>, podés reportarlo con el menú <b>(⋯)</b> de arriba a la derecha.</>
          ) : (
            <>Verifica tu cuenta antes de confirmar para evitar inconvenientes.</>
          )}</>
        )}
      </p>

      <button
        onClick={handleConfirm}
        disabled={loading}
        className={`w-full py-4 text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${requiresExtraConfirm ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" />
            Actualizando...
          </>
        ) : (
          <><CheckCircle2 size={18} /> {requiresExtraConfirm ? 'Marcar como PAGADA' : 'Confirmar Recepción'}</>
        )}
      </button>
    </div>
  );
}

export default ConfirmPaymentAction;