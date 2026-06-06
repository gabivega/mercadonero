import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  User, 
  CreditCard, 
  MapPin, 
  Truck, 
  Calendar, 
  Hash,
  Tag
} from 'lucide-react';

const OrderInfoAccordion = ({ order, role }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isSeller = role === 'seller';

  // Helper para formatear fechas
  const formatDate = (date) => date ? new Date(date).toLocaleString() : '---';
  // console.log("order desde accordion", order);

if (!order) {
  return null;
}

  // Helper para las filas de datos
  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="mt-1 text-zinc-400">
        <Icon size={16} />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">
          {label}
        </p>
        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 break-all">
          {value || 'No especificado'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border-2 border-zinc-100 dark:border-zinc-800 overflow-hidden transition-all shadow-sm">
      {/* HEADER CLICKEABLE */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-[#F26722]/10 p-2 rounded-xl text-[#F26722]">
            <Tag size={18} />
          </div>
          <span className="font-black uppercase italic tracking-tight dark:text-white">
            Detalles de la Orden
          </span>
        </div>
        {isOpen ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
      </button>

      {/* CONTENIDO DESPLEGABLE */}
      {isOpen && (
        <div className="p-6 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            
            {/* COLUMNA 1: DATOS GENERALES */}
            <div className="flex flex-col">
              <InfoRow icon={Hash} label="ID de Orden" value={order._id} />
              <InfoRow icon={Tag} label="Estado Actual" value={order.status.toUpperCase()} />
              <InfoRow 
                icon={User} 
                label={isSeller ? "Comprador" : "Vendedor"} 
                value={isSeller ? order.buyer?.firstName + " " + order.buyer?.lastName : order.seller?.username} 
              />
             { isSeller && <InfoRow 
                icon={User} 
                label={"DNI del comprador"} 
                value={order.buyer?.dni} 
              />}
              <InfoRow icon={CreditCard} label="Precio Total" value={`$ ${order.totalAmount}`} />
              <InfoRow icon={Calendar} label="Fecha de Compra" value={formatDate(order.createdAt)} />
              {isSeller && (
                <>
              <h4 className="text-[11px] font-black text-[#F26722] uppercase tracking-[0.2em] mb-2 mt-4">
                Información Financiera
              </h4>
                  <InfoRow icon={CreditCard} label="Precio total en USD (con envio)" value={`$ ${order.financials?.totalUsd + order.financials?.shippingCostUsd}`} />
                  <InfoRow icon={CreditCard} label="Tipo de cambio" value={`$ ${order.financials?.usdRate}`} />
                  <InfoRow icon={CreditCard} label="Comision descontada" value={`$ ${order.financials?.platformFeeUsd}`} />
                </>
              )}
            </div>

            {/* COLUMNA 2: LOGÍSTICA Y TIEMPOS */}
            <div className="flex flex-col">
              <h4 className="text-[11px] font-black text-[#F26722] uppercase tracking-[0.2em] mb-2 mt-4">
                Logística y Tiempos
              </h4>
              <InfoRow 
                icon={MapPin} 
                label="Dirección de Entrega" 
                value={order.shippingAddress?.street || "Retiro en persona"} 
              />
              <InfoRow 
                icon={MapPin} 
                label="Altura" 
                value={order.shippingAddress?.streetNumber || "-"} 
              />
              <InfoRow 
                icon={MapPin} 
                label="Ciudad" 
                value={order.shippingAddress?.city || "-"} 
              />
              <InfoRow 
                icon={MapPin} 
                label="Código Postal" 
                value={order.shippingAddress?.zipCode || "-"} 
              />
              <InfoRow 
                icon={MapPin} 
                label="Provincia" 
                value={order.shippingAddress?.province || "-"} 
              />
              <InfoRow 
                icon={Truck} 
                label="Servicio de Entrega" 
                value={order.shippingDetails?.provider || "A convenir"} 
              />
              <InfoRow 
                icon={Hash} 
                label="Tracking Number" 
                value={order.shippingDetails?.trackingNumber} 
              />
              <InfoRow 
                icon={Calendar} 
                label="Enviado el" 
                value={formatDate(order.shippingDetails?.shippedAt)} 
              />
              <InfoRow 
                icon={Calendar} 
                label="Completado el" 
                value={formatDate(order.completedAt)} 
              />
            </div>
          </div>

          {/* NOTA PARA EL VENDEDOR */}
          {isSeller && (
            <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
              <p className="text-[10px] text-zinc-500 font-medium">
                * Los fondos y el colateral se liquidarán una vez que el estado pase a "COMPLETED".
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderInfoAccordion;