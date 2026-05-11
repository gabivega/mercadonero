import React from 'react';
import { Truck, ExternalLink, Package, Clock, ShieldCheck } from 'lucide-react';

export default function ShippingStatusCard({ order }) {
  const { status, shippingDetails } = order;

  console.log("status", status)
  console.log("shippingDetail", shippingDetails)
  console.log("trackingNumber", shippingDetails?.trackingNumber)
  console.log("provider", shippingDetails?.provider)

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
        description: `El producto ya fue despachado a través de ${shippingDetails.provider || 'el correo seleccionado'}.`,
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

          {shippingDetails.trackingNumber && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">Enviado mediante:</span>
                  <code className="text-sm font-mono font-bold dark:text-zinc-200">{shippingDetails.provider}</code>
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
        </div>
      </div>
    </div>
  );
}