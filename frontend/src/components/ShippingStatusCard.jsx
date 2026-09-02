import React, { useState } from 'react';
import { Truck, ExternalLink, Package, Clock, ShieldCheck, CheckCircle, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';

export default function ShippingStatusCard({ order, role, onUpdate }) {
    const { status, shippingDetails } = order;
  const [loading, setLoading] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const { getAccessToken } = usePrivy();

  // Opciones predeterminadas de problema que puede reportar el comprador.
  const ISSUE_OPTIONS = [
    { value: 'producto_equivocado', label: 'Llegó un producto equivocado' },
    { value: 'producto_danado', label: 'Llegó dañado o en mal estado' },
    { value: 'incompleto', label: 'Llegó incompleto (faltan productos)' },
    { value: 'no_recibido', label: 'Nunca recibí el paquete' },
    { value: 'otro', label: 'Otro problema' },
  ];

  // console.log("status", status)
  // console.log("shippingDetail", shippingDetails)
  // console.log("trackingNumber", shippingDetails?.trackingNumber)
  // console.log("provider", shippingDetails?.provider)

  // Diccionario de enlaces de seguimiento (Deep Linking)
  const trackingLinks = {
    'Andreani': `https://www.andreani.com/sustituto/${shippingDetails?.trackingNumber}`,
    'Correo Argentino': `https://www.correoargentino.com.ar/formularios/e-commerce?id=${shippingDetails?.trackingNumber}`,
    'OCA': `https://www.oca.com.ar/Busqueda/Ot/?numeroOT=${shippingDetails?.trackingNumber}`,
  };

  const externalUrl = trackingLinks[shippingDetails?.provider] || null;

  // Lógica de contenido según el estado
  const getStatusContent = () => {
    if (status === 'shipped' || status === 'completed') {
      return {
        title: "Producto en camino",
        description: `El producto ya fue despachado a través de ${shippingDetails?.provider || 'el correo seleccionado'}.`,
        icon: <Truck className="text-emerald-500" />,
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/20"
      };
    }
    
    if (status === 'paid') {
      return {
        title: "Preparando envío",
        description: "El pago fue confirmado. El vendedor está preparando el paquete para despacharlo. Cuando actualice el Numero de seguimiento lo verás acá.",
        icon: <Package className="text-[#3483fa]" />,
        bgColor: "bg-[#3483fa]/10",
        borderColor: "border-[#3483fa]/20"
      };
    }

    if (status === 'verifying_payment') {
      return {
        title: "Esperando confirmación",
        description: "Una vez que el vendedor verifique el pago, procederá con el envío del producto.",
        icon: <Clock className="text-amber-500" />,
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/20"
      };
    }

    // Por defecto: pending_payment
    return {
      title: "Pendiente de pago",
      description: "Cuando se confirme el pago, el vendedor ingresará el número de seguimiento aquí.",
      icon: <ShieldCheck className="text-zinc-400" />,
      bgColor: "bg-zinc-100 dark:bg-zinc-800/50",
      borderColor: "border-zinc-200 dark:border-zinc-700"
    };
  };

  const content = getStatusContent();

  const handleConfirmArrival = async () => {
    const result = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿Recibiste tu pedido?</span>',
      text: "Confirma solo si el producto está en tus manos y en las condiciones acordadas. Esta acción liberará los fondos al vendedor.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981', // Verde éxito
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, RECIBÍ TODO BIEN',
      cancelButtonText: 'CANCELAR',
      background: document.documentElement.classList.contains('dark') ? '#18181b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-emerald-500/20' }
    });

    if (result.isConfirmed) {
      setLoading(true);
      const token = await getAccessToken();
      try {
        const { data } = await axios.patch(`${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}`, { status: 'completed' },
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
                if (data.success) {
          await Swal.fire({
            title: '¡ORDEN FINALIZADA!',
            text: 'Gracias por confirmar. Mercado Nero ha procesado el cierre de la transacción.',
            icon: 'success',
            confirmButtonColor: '#F26722',
            customClass: { popup: 'rounded-[2.5rem]' }
          });
                    // Refresca la orden en el OrderDetail (oculta este botón) y
          // dispara el incentivo + scroll a las calificaciones.
          onUpdate?.();
        }
            } catch (error) {
        // Swal.fire('Error', 'No se pudo completar la orden.', 'error');
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  };

  // El comprador reporta un problema con el pedido recibido. Se abre una
  // disputa: el colateral del vendedor queda retenido y el admin decide.
  const handleReportIssue = async () => {
    const isDark = document.documentElement.classList.contains('dark');
    const optionsHtml = ISSUE_OPTIONS.map(
      (o, i) =>
        `<button type="button" data-value="${o.value}" class="swal-issue-opt" style="display:block;width:100%;text-align:left;padding:12px 14px;margin:4px 0;border:1px solid ${isDark ? '#3f3f46' : '#e5e7eb'};border-radius:12px;background:${isDark ? '#18181b' : '#fff'};color:${isDark ? '#f3f4f6' : '#1f2937'};font-weight:600;font-size:14px;cursor:pointer;">${o.label}</button>`,
    ).join('');

    const { value: issueType } = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿Qué pasó con tu pedido?</span>',
      html: `<p style="text-align:left;font-size:13px;color:${isDark ? '#a1a1aa' : '#52525b'};margin-bottom:8px;">Seleccioná el problema. Al abrir una disputa, la garantía del vendedor queda retenida y el admin lo resolverá.</p>${optionsHtml}`,
      focusConfirm: false,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'CANCELAR',
      background: isDark ? '#18181b' : '#fff',
      color: isDark ? '#fff' : '#000',
      customClass: {
        popup: 'rounded-[2.5rem] border-2 border-red-500/20',
        cancelButton: 'rounded-2xl font-bold uppercase tracking-widest px-6',
      },
      didOpen: () => {
        document.querySelectorAll('.swal-issue-opt').forEach((btn) => {
          btn.addEventListener('click', () => {
            Swal.close();
            const value = btn.getAttribute('data-value');
            const label =
              ISSUE_OPTIONS.find((o) => o.value === value)?.label || value;
            continueDispute(value, label, isDark);
          });
        });
      },
    });
    if (issueType) {
      continueDispute(issueType, issueType, isDark);
    }
  };

  const continueDispute = async (issueType, label, isDark) => {
    // Confirmación de seguridad antes de abrir la disputa.
    const confirm = await Swal.fire({
      title: '<span class="font-black uppercase italic">Abilitar disputa</span>',
      text: `Confirmá que querés abrir una disputa por: "${label}". Esto retiene la garantía del vendedor hasta que el admin resuelva.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, ABRIR DISPUTA',
      cancelButtonText: 'CANCELAR',
      background: isDark ? '#18181b' : '#fff',
      color: isDark ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-red-500/20' },
    });
    if (!confirm.isConfirmed) return;

    setDisputing(true);
    const token = await getAccessToken();
    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}/dispute`,
        { issueType: label },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
        await Swal.fire({
          title: '¡DISPUTA ABIERTA!',
          text: 'Tu problema quedó registrado. El admin revisará el caso y la garantía del vendedor queda retenida hasta la resolución.',
          icon: 'success',
          confirmButtonColor: '#F26722',
          customClass: { popup: 'rounded-[2.5rem]' },
        });
        onUpdate?.();
      }
    } catch (error) {
      console.error(error);
      Swal.fire(
        'Error',
        error?.response?.data?.message || 'No se pudo abrir la disputa.',
        'error',
      );
    } finally {
      setDisputing(false);
    }
  };

  return (
    <div className={`p-6 rounded-[2.5rem] border-2 ${content.borderColor} ${content.bgColor} transition-all duration-500`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm">
          {content.icon}
        </div>
        
        <div className="flex-1">
          <h3 className="font-black uppercase tracking-tight dark:text-white text-lg italic">
            {content.title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-medium">
            {content.description}
          </p>

          {shippingDetails?.trackingNumber && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Enviado mediante:</span>
                  <code className="text-sm font-mono font-bold dark:text-zinc-200">{shippingDetails?.provider}</code>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Número de seguimiento</span>
                  <code className="text-sm font-mono font-bold dark:text-zinc-200">{shippingDetails.trackingNumber}</code>
                </div>

                <button
                  onClick={() => externalUrl && window.open(externalUrl, '_blank')}
                  disabled={!externalUrl}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold uppercase text-xs transition-all ${
                    externalUrl 
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95' 
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  <ExternalLink size={14} />
                  Rastrear Paquete
                </button>
              </div>
            </div>
          )}
                    {/* SECCIÓN DE ACCIÓN PARA EL COMPRADOR */}
          {order.dispute?.exists && (
            <div className="mt-6 p-4 bg-red-50/60 dark:bg-red-950/30 rounded-3xl border-2 border-red-300/50 dark:border-red-500/40">
              <p className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">
                ⚖️ Disputa en curso
              </p>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Registraste: <span className="font-bold text-red-600 dark:text-red-400">{order.dispute.issueType}</span>.
                La garantía del vendedor quedó retenida. El admin revisará el caso y te contactará con la resolución.
              </p>
            </div>
          )}
          {status === 'shipped' && role === "buyer" && !order.dispute?.exists && (
            <div className="mt-6 p-4 bg-white/50 dark:bg-black/20 rounded-3xl border border-black/5">
              <p className="text-xs font-bold uppercase text-zinc-500 mb-3 text-center">
                ¿Ya tienes el paquete contigo?
              </p>
                            <button
                onClick={handleConfirmArrival}
                disabled={loading}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                {loading ? 'Procesando...' : <><CheckCircle size={20} /> Confirmar Recepción</>}
              </button>
              <p className="mt-2 text-[9px] text-center text-zinc-400 font-medium">
                Al confirmar que recibiste todo en orden, se termina la proteccion de la compra.
              </p>

              <div className="my-4 flex items-center gap-3">
                <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">¿Tuviste un problema?</span>
                <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
              </div>

              <button
                onClick={handleReportIssue}
                disabled={disputing}
                className="w-full py-3.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 border-2 border-red-300/60 dark:border-red-500/40 rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
              >
                {disputing
                  ? 'Abriendo disputa...'
                  : <><AlertTriangle size={18} /> Tuve un problema</>}
              </button>
              <p className="mt-2 text-[9px] text-center text-zinc-400 font-medium">
                No confirmes la recepción si el pedido llegó mal. Abrí una disputa y el admin lo resolverá.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}