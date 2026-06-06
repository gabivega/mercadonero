import React, { useState, useEffect } from "react";
import { CreditCard, CheckCircle, ExternalLink } from "lucide-react";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import Swal from "sweetalert2";
import LoadingSpinner from "./LoadingSpinner";

export default function PaymentAction({ orderId, onUpdate, sellerId }) {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [sellerBankingAccount, setSellerBankingAccount] = useState(null);

  useEffect(() => {
    const fetchSellerBankingAccount = async () => {
      getSellerBankingAccount(sellerId);
    };
    fetchSellerBankingAccount();
  }, [orderId]);

  const getSellerBankingAccount = async (sellerId) => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const response = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/user/bank-accounts/${sellerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // console.log(response.data)
      setSellerBankingAccount(response.data.bankAccount);
      return response.data.bankAccount;
    } catch (error) {
      console.error("Error al obtener datos bancarios del vendedor:", error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    // Podrías agregar una confirmación nativa o un modal propio 
    // 1. Confirmación con estética Nero
    const result = await Swal.fire({
      title: '<span className="font-black uppercase italic">¿Confirmar Pago?</span>',
      text: "Asegúrate de haber realizado la transferencia antes de notificar al vendedor.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#F26722', // Color corporativo
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, YA PAGUÉ',
      cancelButtonText: 'CANCELAR',
      background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
      customClass: {
        popup: 'rounded-[2.5rem] border-2 border-[#F26722]/20',
        confirmButton: 'rounded-2xl font-bold uppercase tracking-widest px-6',
        cancelButton: 'rounded-2xl font-bold uppercase tracking-widest px-6'
      }
    });
    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      // Actualizamos la orden a "verifying_payment"
      const {data} = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${orderId}`,
        { status: "verifying_payment" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
          await Swal.fire({
              title: 'ÉXITO',
              text: 'Notificación de pago enviada correctamente.',
              icon: 'success',
              confirmButtonColor: '#F26722',
              background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
              color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
              customClass: { popup: 'rounded-[2.5rem]' }
            });
        }
        onUpdate(data.order); // Refresca la vista principal
    } catch (error) {
      Swal.fire({
          title: 'ERROR',
          text: error.response?.data?.message || 'No se pudo procesar la notificación.',
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
    <div className="bg-[#F26722]/5 border-2 border-[#F26722] p-6 rounded-[2.5rem] shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-[#F26722] p-2 rounded-xl text-white shadow-lg shadow-[#F26722]/20">
          <CreditCard size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight dark:text-white italic">
          Acción Requerida
        </h3>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium leading-relaxed">
        Para avanzar con tu compra, realiza el pago y luego presiona el botón
        inferior para que el vendedor sea notificado.
      </p>

      <div className="bg-white dark:bg-[#252525] rounded-2xl p-5 border border-gray-100 dark:border-gray-800 mb-6">
        <h4 className="text-xs font-black uppercase text-center tracking-widest text-[#F26722] mb-4">
          Datos Bancarios del Vendedor
        </h4>
        <div className="space-y-3 md:px-[25%]">
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Titular</span>
            <span className="text-sm font-medium dark:text-white">{sellerBankingAccount?.holderName || 'No disponible'}</span>
          </div>
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CBU</span>
            <span className="text-sm font-mono dark:text-white">{sellerBankingAccount?.cbuCvu || 'No disponible'}</span>
          </div>
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Banco</span>
            <span className="text-sm font-medium dark:text-white">{sellerBankingAccount?.bankName || 'No disponible'}</span>
          </div>
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alias</span>
            <span className="text-sm font-medium dark:text-white">{sellerBankingAccount?.alias || 'No disponible'}</span>
          </div>
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CUIT/CUIL</span>
            <span className="text-sm font-medium dark:text-white">{sellerBankingAccount?.cuitCuil || 'No disponible'}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleMarkAsPaid}
        disabled={loading}
        className="w-full group relative overflow-hidden py-4 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
      >
        <div className="flex items-center justify-center gap-2 relative z-10">
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              Procesando...
            </>
          ) : (
            <>
              <CheckCircle
                size={18}
                className="group-hover:rotate-12 transition-transform"
              />
              Notificar Pago Realizado
            </>
          )}
        </div>
      </button>

      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
        <ExternalLink size={12} />
        Tu dinero está protegido por Nero
      </div>
    </div>
  );
}
