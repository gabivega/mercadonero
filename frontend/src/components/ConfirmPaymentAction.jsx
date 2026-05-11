import React, { useState } from 'react';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';

const ConfirmPaymentAction = ({ orderId, onUpdate }) => {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const result = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿Confirmar Recepción?</span>',
      text: "Al confirmar, declaras que has recibido el dinero. Esto habilitará el despacho del producto.",
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
    <div className="bg-emerald-500/5 border-2 border-emerald-500/30 p-6 rounded-[2.5rem] shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-emerald-500 p-2 rounded-xl text-white shadow-lg shadow-emerald-500/20">
          <ShieldCheck size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight dark:text-white italic text-lg">Verificación de Pago</h3>
      </div>
      
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium leading-relaxed">
        El comprador indica que ya realizó el pago. **Verifica tu cuenta** antes de confirmar para evitar inconvenientes.
      </p>

      <button
        onClick={handleConfirm}
        disabled={loading}
        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <span className="animate-pulse">Actualizando...</span>
        ) : (
          <><CheckCircle2 size={18} /> Confirmar Recepción</>
        )}
      </button>
    </div>
  );
}

export default ConfirmPaymentAction;