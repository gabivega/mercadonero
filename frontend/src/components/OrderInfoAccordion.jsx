import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  User,
  CreditCard,
  MapPin,
  Truck,
  Calendar,
  Hash,
  Tag,
  Store,
  ExternalLink,
} from 'lucide-react';

const OrderInfoAccordion = ({ order, role }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isSeller = role === 'seller';
  const navigate = useNavigate();

  // Helper para formatear fechas
  const formatDate = (date) => (date ? new Date(date).toLocaleString() : '---');

  if (!order) {
    return null;
  }

  // PAGO: metodo y token elegido por el comprador
  const isCrypto = order.payment?.method === 'crypto';
  const payToken = order.payment?.token || 'USDT';
  const PAYMENT_METHOD_LABEL = isCrypto
    ? `Cripto (${payToken})`
    : 'Transferencia bancaria';

  // ENTREGA: envio a domicilio vs. retiro en sucursal
  const isPickup = order.deliveryMethod === 'pickup';
  const pickup = order.pickupLocation || {};
  const pickupAddressLine = [
    pickup.street && `${pickup.street} ${pickup.streetNumber || ''}`.trim(),
    pickup.city,
    pickup.state,
  ]
    .filter(Boolean)
    .join(', ');

  // PUNTO DE ENTREGA (Zipnova: Correo Argentino / OCA, etc.)
  // Sucursal donde el comprador retira su compra cuando el servicio elegido
  // no es entrega a domicilio. Se guarda en shippingDetails.pickupPoint.
  const shippingPoint = order.shippingDetails?.pickupPoint;
  const shippingPointLine = shippingPoint
    ? [
        [shippingPoint.street, shippingPoint.streetNumber]
          .filter(Boolean)
          .join(' '),
        shippingPoint.city,
        shippingPoint.state,
        shippingPoint.zipcode ? `CP ${shippingPoint.zipcode}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  const STATUS_MAP = {
    awaiting_collateral: 'En espera de garantia',
    pending_payment: 'Pago Pendiente',
    verifying_payment: 'Verificando Pago',
    paid: 'Pagado',
    shipped: 'Enviado',
    completed: 'Completado',
    cancelled: 'Cancelado',
    expired: 'Expirado',
  };

  // Helper para las filas de datos
  const InfoRow = ({ icon: Icon, label, value, linkId }) => (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="mt-1 text-zinc-400">
        <Icon size={16} />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">
          {label}
        </p>
        {linkId ? (
          <button
            onClick={() => navigate(`/user/${linkId}`)}
            className="group inline-flex items-center gap-1.5 text-sm font-bold text-[#3483fa] hover:underline capitalize dark:text-blue-400"
            title="Ver perfil publico de esta persona"
          >
            {value || 'No especificado'}
            <ExternalLink
              size={13}
              className="text-zinc-400 group-hover:text-[#3483fa]"
            />
          </button>
        ) : (
          <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 break-all">
            {value || 'No especificado'}
          </p>
        )}
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
        {isOpen ? (
          <ChevronUp size={20} className="text-zinc-400" />
        ) : (
          <ChevronDown size={20} className="text-zinc-400" />
        )}
      </button>

      {/* CONTENIDO DESPLEGABLE */}
      {isOpen && (
        <div className="p-6 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            {/* COLUMNA 1: DATOS GENERALES */}
            <div className="flex flex-col">
              <InfoRow icon={Hash} label="ID de Orden" value={order._id} />
              <InfoRow
                icon={Tag}
                label="Estado Actual"
                value={STATUS_MAP[order.status] || order.status}
              />
              <InfoRow
                icon={User}
                label={isSeller ? 'Comprador' : 'Vendedor'}
                value={
                  isSeller
                    ? order.buyer?.firstName + ' ' + order.buyer?.lastName
                    : order.seller?.username
                }
                linkId={
                  isSeller
                    ? order.buyer?._id || order.buyer
                    : order.seller?._id || order.seller
                }
              />
              {isSeller && (
                <InfoRow
                  icon={User}
                  label={'DNI del comprador'}
                  value={order.buyer?.dni}
                />
              )}
              <InfoRow
                icon={CreditCard}
                label="Metodo de Pago"
                value={PAYMENT_METHOD_LABEL}
              />
              <InfoRow
                icon={CreditCard}
                label="Precio de Productos"
                value={`$ ${(order.productsAmount ?? 0).toLocaleString('es-AR')}`}
              />
              {order.shippingAmount > 0 && (
                <InfoRow
                  icon={Truck}
                  label="Costo de Envio"
                  value={`$ ${(order.shippingAmount ?? 0).toLocaleString('es-AR')}`}
                />
              )}
              <InfoRow
                icon={Tag}
                label="Precio Total"
                value={`$ ${(order.totalAmount ?? 0).toLocaleString('es-AR')}`}
              />
              <InfoRow
                icon={Calendar}
                label="Fecha de Compra"
                value={formatDate(order.createdAt)}
              />
              {isSeller && (
                <>
                  <h4 className="text-[11px] font-black text-[#F26722] uppercase tracking-[0.2em] mb-2 mt-4">
                    Informacion Financiera
                  </h4>
                  <InfoRow
                    icon={CreditCard}
                    label="Precio total en USD (con envio)"
                    value={`$ ${(
                      Number(order.financials?.totalUsd || 0) +
                      Number(order.financials?.shippingCostUsd || 0)
                    ).toFixed(2)}`}
                  />
                  <InfoRow
                    icon={CreditCard}
                    label="Tipo de cambio"
                    value={`$ ${Number(order.financials?.usdRate || 0).toFixed(2)}`}
                  />
                  <InfoRow
                    icon={CreditCard}
                    label="Comision descontada"
                    value={`$ ${Number(order.financials?.platformFeeUsd || 0).toFixed(2)}`}
                  />
                </>
              )}
            </div>

            {/* COLUMNA 2: LOGISTICA Y TIEMPOS */}
            <div className="flex flex-col">
              <h4 className="text-[11px] font-black text-[#F26722] uppercase tracking-[0.2em] mb-2 mt-4">
                Logistica y Tiempos
              </h4>

              {isPickup ? (
                <>
                  <InfoRow
                    icon={Store}
                    label="Tipo de entrega"
                    value="Retiro en sucursal del vendedor"
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Sucursal de retiro"
                    value={pickup.name}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Direccion de retiro"
                    value={pickupAddressLine}
                  />
                </>
              ) : (
                <>
                  <InfoRow
                    icon={MapPin}
                    label="Direccion de Entrega"
                    value={order.shippingAddress?.street || 'No especificada'}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Altura"
                    value={order.shippingAddress?.streetNumber || '-'}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Ciudad"
                    value={order.shippingAddress?.city || '-'}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Codigo Postal"
                    value={order.shippingAddress?.zipCode || '-'}
                  />
                  <InfoRow
                    icon={MapPin}
                    label="Provincia"
                    value={order.shippingAddress?.province || '-'}
                  />
                </>
              )}

              <InfoRow
                icon={Truck}
                label="Servicio de Entrega"
                value={order.shippingDetails?.provider || 'A convenir'}
              />

              {/* PUNTO DE ENTREGA (Correo Argentino / OCA): la sucursal donde el
                  comprador retira su compra. Solo aparece si fue elegido. */}
              {shippingPoint?.name && (
                <InfoRow
                  icon={Store}
                  label="Punto de entrega"
                  value={`${shippingPoint.name}${
                    shippingPointLine ? ` - ${shippingPointLine}` : ''
                  }`}
                />
              )}

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
                * Los fondos y el colateral se liquidaran una vez que el estado
                pase a COMPLETED.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderInfoAccordion;
