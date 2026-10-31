import {
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  CreditCard,
  ShieldCheck,
  Gift,
  AlertTriangle,
  User,
  Gavel,
} from 'lucide-react';

// Etiqueta legible para cada estado de la orden.
const STATUS_MAP = {
  awaiting_collateral: 'Esperando Garantía',
  pending_payment: 'Pago Pendiente',
  verifying_payment: 'Verificando Pago',
  paid: 'Pagado',
  shipped: 'Enviado',
  reception_confirmed: 'Recepción Confirmada',
  completed: 'Completado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};

// Etiqueta legible + icono para cada tipo de acción de `orderActions`.
const ACTION_MAP = {
  cancel_request: { label: 'Solicitud de cancelación', icon: XCircle },
  cancel_executed: { label: 'Cancelación ejecutada', icon: XCircle },
  refund_request: { label: 'Reembolso solicitado', icon: CreditCard },
  refund_confirmed: { label: 'Reembolso confirmado', icon: CreditCard },
  refund_declined: { label: 'Reembolso rechazado', icon: AlertTriangle },
  claim: { label: 'Reclamo del comprador', icon: AlertTriangle },
  return_request: { label: 'Devolución solicitada', icon: Gift },
  admin_intervention: { label: 'Intervención del admin', icon: Gavel },
  admin_cancel: { label: 'Cancelación por admin', icon: XCircle },
  dispute_opened: { label: 'Disputa abierta', icon: AlertTriangle },
};

const INITIATOR_MAP = {
  buyer: 'Comprador',
  seller: 'Vendedor',
  admin: 'Admin',
  system: 'Sistema',
};

// Icono según el estado (para los hitos del `statusHistory`).
const statusIcon = (status) => {
  switch (status) {
    case 'completed':
      return CheckCircle2;
    case 'cancelled':
    case 'expired':
      return XCircle;
    case 'shipped':
      return Truck;
    case 'paid':
    case 'verifying_payment':
    case 'pending_payment':
    case 'awaiting_collateral':
      return CreditCard;
    case 'reception_confirmed':
      return ShieldCheck;
    default:
      return Clock;
  }
};

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '---';

/**
 * Timeline de trazabilidad de la orden.
 * Combina `statusHistory` (hitos de estado) + `orderActions` (acciones
 * registradas: cancelaciones, reembolsos, intervenciones del admin, etc.)
 * en un único feed cronológico ascendente.
 */
const OrderTimeline = ({ order }) => {
  if (!order) return null;

  // 1) Normalizamos los hitos de estado.
  const statusEvents = (order.statusHistory || []).map((h) => ({
    kind: 'status',
    at: h.changedAt,
    status: h.status,
    title: STATUS_MAP[h.status] || h.status,
    comment: h.comment,
  }));

  // 2) Normalizamos las acciones.
  const actionEvents = (order.orderActions || []).map((a) => {
    const meta = ACTION_MAP[a.type] || { label: a.type, icon: Clock };
    return {
      kind: 'action',
      at: a.createdAt,
      icon: meta.icon,
      title: meta.label,
      initiator: INITIATOR_MAP[a.initiator] || a.initiator,
      comment: a.reason,
      actionStatus: a.status,
    };
  });

  // 3) Fallback: si no hay historial pero hay createdAt, lo mostramos igual.
  if (!statusEvents.length && !actionEvents.length && order.createdAt) {
    statusEvents.push({
      kind: 'status',
      at: order.createdAt,
      status: order.status,
      title: 'Orden creada',
      comment: undefined,
    });
  }

  // 4) Orden ascendente por fecha.
  const events = [...statusEvents, ...actionEvents].sort(
    (a, b) => new Date(a.at) - new Date(b.at),
  );

  if (!events.length) return null;

  return (
    <div className="mt-8">
      <h4 className="text-[11px] font-black text-[#F26722] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <Clock size={14} /> Historial de la Orden
      </h4>

      <ol className="relative border-l-2 border-zinc-100 dark:border-zinc-800 ml-2">
        {events.map((ev, idx) => {
          const isStatus = ev.kind === 'status';
          const Icon = isStatus ? statusIcon(ev.status) : ev.icon;
          const isLast = idx === events.length - 1;
          // Colores: cerrado/neutral vs. alerta.
          const isNegative =
            ev.status === 'cancelled' ||
            ev.status === 'expired' ||
            ev.actionStatus === 'declined' ||
            ev.actionStatus === 'rejected' ||
            ev.status === 'rejected';
          const dotColor = isNegative
            ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
            : isLast
              ? 'bg-[#F26722] text-white'
              : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400';

          return (
            <li key={idx} className="mb-5 ml-6 last:mb-0">
              {/* Punto del timeline */}
              <span
                className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white dark:ring-zinc-900 ${dotColor}`}
              >
                <Icon size={13} />
              </span>

              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  {ev.title}
                </p>
                {ev.initiator && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    <User size={10} /> {ev.initiator}
                  </span>
                )}
              </div>

              <p className="text-[11px] font-medium text-zinc-400 mt-0.5">
                {formatDate(ev.at)}
              </p>

              {ev.comment && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {ev.comment}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default OrderTimeline;
