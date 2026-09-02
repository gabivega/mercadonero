import React, { useState } from 'react';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';

const ConfirmPaymentAction = ({ orderId, onUpdate, order }) => {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  // Distinguimos dos situaciones:
  //  - 'verifying_payment': el COMPRADOR notificó el pago manualmente.
  //  - 'pending_payment'  : el comprador NO notificó el pago. El vendedor lo
  //    confirma por su cuenta (petición del usuario). Requiere una confirmación
  //    extra de seguridad, avisando que el comprador no marcó el pago.
  const requiresExtraConfirm = order?.status === "pending_payment";

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
    <div className={`border-2 p-6 rounded-[2.5rem] shadow-sm ${requiresExtraConfirm ? 'bg-amber-500/5 border-amber-500/40' : 'bg-emerald-500/5 border-emerald-500/30'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl text-white shadow-lg ${requiresExtraConfirm ? 'bg-amber-500 shadow-amber-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>
          <ShieldCheck size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight dark:text-white italic text-lg">Verificación de Pago</h3>
      </div>
      
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium leading-relaxed">
        {requiresExtraConfirm ? (
          <>
            El comprador aún <b>no notificó el pago</b> en la plataforma. Si vos
            ya verificaste que el dinero te llegó, podés marcar la orden como
            pagada por tu cuenta para continuar con el despacho.
          </>
        ) : (
          <>El comprador indica que ya realizó el pago. Verifica tu cuenta antes de confirmar para evitar inconvenientes.</>
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