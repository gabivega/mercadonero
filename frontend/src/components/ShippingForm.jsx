import React, { useState } from 'react';
import { Truck, Send } from 'lucide-react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import LoadingSpinner from './LoadingSpinner';

const ShippingForm = ({ orderId, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [shipping, setShipping] = useState({
    provider: 'Andreani',
    trackingNumber: '',
    otherDetail: ''
  });
  const providers = ['Andreani', 'Correo Argentino', 'OCA', 'Otro'];
  const { getAccessToken } = usePrivy();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const confirmResult = await Swal.fire({
    title: '<span class="font-black uppercase italic">¿Confirmar Despacho?</span>',
    text: `Vas a registrar el envío por ${shipping.provider}. Asegúrate de que el número sea el correcto.`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#F26722',
    cancelButtonColor: '#18181b',
    confirmButtonText: 'SÍ, DESPACHADO',
    cancelButtonText: 'REVISAR',
    background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
    customClass: { popup: 'rounded-[2.5rem] border-2 border-[#F26722]/20' }
  });
    // console.log("orderId", orderId)
    const token = await getAccessToken();
    // console.log(token)
    try {
      // Llamamos al controlador que crearemos abajo
      const { data } = await axios.patch(`${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}`, 
        {shipping:shipping}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.success) {
      // 2. Éxito: El paquete ya figura como enviado
      await Swal.fire({
        title: '¡ENVÍO REGISTRADO!',
        text: 'La orden ha sido marcada como enviada y el comprador ya puede ver el seguimiento.',
        icon: 'success',
        confirmButtonColor: '#F26722',
        background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
        customClass: { popup: 'rounded-[2.5rem]' }
      });
      if (data.success) {
        onUpdate(data.order); // Callback para refrescar la UI de la orden
      }
    }
    } catch (error) {
      console.error("Error al actualizar envío:", error);
     Swal.fire({
      title: 'ERROR AL GUARDAR',
      text: error.response?.data?.message || 'No se pudo vincular el seguimiento a la orden.',
      icon: 'error',
      confirmButtonColor: '#ef4444',
      background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem]' }
    });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border-2 border-[#F26722]/20 p-6 rounded-[2.5rem] mt-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-[#F26722] p-2 rounded-xl text-white">
          <Truck size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight dark:text-white">Despachar y agregar Numero de Seguimiento</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase text-zinc-400 ml-2">Proveedor de Correo</label>
          <select 
            className="w-full mt-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl p-3 font-bold dark:text-white focus:ring-2 focus:ring-[#F26722] outline-none"
            value={shipping.provider}
            onChange={(e) => setShipping({...shipping, provider: e.target.value})}
          >
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {shipping.provider === 'Otro' && (
          <input 
            type="text"
            placeholder="Nombre del servicio (ej. Comisionista)"
            className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl p-3 font-medium dark:text-white outline-none"
            onChange={(e) => setShipping({...shipping, otherDetail: e.target.value})}
            required
          />
        )}

        <div>
          <label className="text-[10px] font-bold uppercase text-zinc-400 ml-2">Número de Seguimiento</label>
          <input 
            type="text"
            placeholder="Ej: AR123456789"
            className="w-full mt-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl p-3 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-[#F26722]"
            value={shipping.trackingNumber}
            onChange={(e) => setShipping({...shipping, trackingNumber: e.target.value})}
            required
          />
        </div>

        <button
          disabled={loading}
          className="w-full py-4 bg-zinc-900 dark:bg-white dark:text-black text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              Procesando...
            </>
          ) : (
            <><Send size={18} /> Confirmar Envío</>
          )}
        </button>
      </form>
    </div>
  );
}

export default ShippingForm;