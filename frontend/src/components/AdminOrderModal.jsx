import React from 'react';
import {
  X, Package, User, ExternalLink, 
  MapPin, Calendar, ShieldCheck, AlertCircle, FileText,
  Undo2, Wrench,
} from 'lucide-react';
import { isOrderTotalInUsd } from '../Utils/orderAmount';

// ─────────────────────────────────────────────────────────────────────────
// Botón de acción reutilizable: garantiza tamaños y estilos HOMOGÉNEOS para
// que el footer no quede con botones de distinto alto/ancho ni texto
// desbordado. Todas las acciones pasan por acá.
//   size    : "md" (principal) | "sm" (herramientas de admin)
//   variant : colores sólidos y de contorno
//   full    : ocupa todo el ancho disponible
// ─────────────────────────────────────────────────────────────────────────
const ActionButton = ({ children, onClick, variant = 'emerald', size = 'md', full = false, icon: Icon, className = '' }) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-wide ' +
    'text-center leading-tight select-none w-full ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-offset-zinc-900';

  const sizes = {
    md: 'min-h-[48px] px-4 py-3 text-[11px]',
    sm: 'min-h-[40px] px-3.5 py-2 text-[10px]',
  };

  const variants = {
    emerald: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    indigo: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    amber: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
    rose: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    dark: 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-sm',
    outline: 'bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700',
    'outline-amber': 'bg-transparent border border-amber-300 dark:border-amber-700/70 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20',
    'outline-blue': 'bg-transparent border border-blue-300 dark:border-blue-700/70 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20',
    'outline-rose': 'bg-transparent border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${sizes[size]} ${variants[variant] || variants.emerald} ${full ? '' : 'w-auto'} ${className}`}
    >
      {Icon ? <Icon size={size === 'sm' ? 13 : 15} className="shrink-0" /> : null}
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
};

const AdminOrderModal = ({ order, isOpen, onClose, onAction }) => {
  if (!isOpen || !order) return null;

  // Helper para armar links de BscScan (Configurado para BSC Testnet)
  const getBscScanUrl = (hash) => `https://testnet.bscscan.com/tx/${hash}`;

  // Helper para renderizar badges de estado estéticos
  const getStatusBadge = (status) => {
    const styles = {
      pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      verifying_payment: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
            paid: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
      shipped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      reception_confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      cancelled: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400",
      expired: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
    };
    return styles[status] || "bg-zinc-100 text-zinc-800";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
        
        {/* HEADER FIXED */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black italic uppercase tracking-tighter">Panel de Control de Orden</h2>
              <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full ${getStatusBadge(order.status)}`}>
                {order.status}
              </span>
            </div>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-1">ID: {order._id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500 dark:text-zinc-400">
            <X size={20} />
          </button>
        </div>

                {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
          
                    {/* ALERTA: SOLICITUD DE CANCELACIÓN PENDIENTE */}
          {(() => {
            const pendingRelease =
              order.releaseRequest?.exists && order.releaseRequest.status === 'pending';
            const pendingRefund =
              order.pendingRequest?.exists && order.pendingRequest.status === 'pending';
            if (!pendingRelease && !pendingRefund) return null;

            // ¿Orden con escrow CRIPTO fondeado? En ese caso los fondos NO
            // están en el colateral bancario: hay que reembolsar el ESCROW
            // on-chain al comprador (cancel-escrow), no "liberar la garantía".
            const isCryptoFunded =
              order.payment?.method === 'crypto' && order.payment?.status === 'funded';
            const initiatedBySeller = order.pendingRequest?.initiator === 'seller';

            const title = pendingRelease
              ? 'Solicitud de cancelación del vendedor'
              : isCryptoFunded
                ? initiatedBySeller
                  ? 'El vendedor pidió cancelar (escrow cripto)'
                  : 'El comprador pidió cancelar (escrow cripto)'
                : 'Reembolso en proceso';

            const body = pendingRelease
              ? 'El vendedor pidió cancelar la orden. Resolución manual: primero cancelá la orden y, tras verificar con el comprador que no abonó (o que recibió su reintegro), liberá la garantía.'
              : isCryptoFunded
                ? 'Los USDT están retenidos en el escrow. Usá "Reembolsar Comprador (Escrow)" para devolverle el 100% on-chain: la orden quedará cancelada y la garantía del vendedor se libera en el proceso.'
                : 'El comprador pidió cancelar habiendo pagado. El vendedor debe reembolsarle; cuando confirme, liberá la garantía manualmente.';

            return (
              <div className="p-5 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-300 dark:border-rose-800/60 rounded-3xl flex items-start gap-3">
                <AlertCircle className="text-rose-500 mt-0.5 flex-shrink-0" size={20} />
                <div>
                  <p className="font-black uppercase tracking-wide text-sm text-rose-700 dark:text-rose-300">
                    {title}
                  </p>
                  <p className="text-sm text-rose-600 dark:text-rose-400 mt-1">
                    {body}
                    {order.pendingRequest?.reason && (
                      <span className="block mt-1 font-medium">Motivo: {order.pendingRequest.reason}</span>
                    )}
                    {order.releaseRequest?.reason && (
                      <span className="block mt-1 font-medium">Motivo: {order.releaseRequest.reason}</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* METADATA & CRYPTO TRACKING */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-3xl border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1 mb-1">
                <Calendar size={12} /> Tiempos de la Orden
              </span>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Creada: {new Date(order.createdAt).toLocaleDateString('es-AR')} {new Date(order.createdAt).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}</p>
            {order.status !== 'expired' && order.status !== 'completed' && order.status !== 'cancelled' && <p className="text-xs text-rose-500 mt-1 font-mono">Expira: {new Date(order.expiresAt).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}</p>}
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-3xl border border-zinc-100 dark:border-zinc-800 col-span-2 flex flex-col justify-center space-y-2">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} /> Auditoría Blockchain (EVM)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-zinc-400">Collateral Lock: </span>
                  {order.collateralTxHash ? (
                    <a href={getBscScanUrl(order.collateralTxHash)} target="_blank" rel="noreferrer" className="text-[#F26722] hover:underline inline-flex items-center gap-0.5">
                      {order.collateralTxHash.slice(0, 6)}...{order.collateralTxHash.slice(-4)} <ExternalLink size={10} />
                    </a>
                  ) : <span className="text-zinc-500 italic">No ejecutado</span>}
                </div>
                <div>
                  <span className="text-zinc-400">Release Escrow: </span>
                  {order.releaseTxHash ? (
                    <a href={getBscScanUrl(order.releaseTxHash)} target="_blank" rel="noreferrer" className="text-[#F26722] hover:underline inline-flex items-center gap-0.5">
                      {order.releaseTxHash.slice(0, 6)}...{order.releaseTxHash.slice(-4)} <ExternalLink size={10} />
                    </a>
                  ) : <span className="text-zinc-500 italic">No ejecutado</span>}
                </div>
              </div>
            </div>
          </div>

          {/* PARTICIPANTS & WALLETS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-50 dark:bg-zinc-800/20 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/60">
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-black italic uppercase text-zinc-400 tracking-wider">
                <User size={14} className="text-zinc-400" /> Datos del Comprador
              </h3>
              <div className="text-sm">
                <p className="font-black text-zinc-800 dark:text-zinc-100 text-base">{order.buyer?.firstName} {order.buyer?.lastName}</p>
                <p className="text-zinc-500 font-medium">{order.buyer?.email}</p>
                {/* <p className="text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded mt-1 text-zinc-600 dark:text-zinc-400 break-all">
                  Wallet: {order.buyer?.walletAddress || "Sin Vincular"}
                </p> */}
              </div>
            </section>
            
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-black italic uppercase text-zinc-400 tracking-wider">
                <Package size={14} className="text-[#F26722]" /> Datos del Vendedor
              </h3>
              <div className="text-sm">
                <p className="font-black text-zinc-800 dark:text-zinc-100 text-base">
                  {order.seller?.username || `${order.seller?.firstName} ${order.seller?.lastName}`}
                </p>
                <p className="text-zinc-500 font-medium">{order.seller?.email}</p>
                {/* <p className="text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded mt-1 text-zinc-600 dark:text-zinc-400 break-all">
                  Wallet: {order.seller?.walletAddress || "Sin Vincular"}
                </p> */}
              </div>
            </section>
          </div>

          {/* SHIPPING LOGISTICS */}
          {order.shippingAddress?.street && (
            <section className="p-5 border border-zinc-100 dark:border-zinc-800 rounded-[2rem] space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-black italic uppercase text-zinc-400 tracking-wider">
                <MapPin size={14} className="text-zinc-500" /> Destino y Despacho de Logística
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1 text-zinc-700 dark:text-zinc-300">
                  <p className="font-bold">{order.shippingAddress.street} {order.shippingAddress.streetNumber}</p>
                  <p className="text-xs text-zinc-500">{order.shippingAddress.city}, {order.shippingAddress.province} (CP {order.shippingAddress.zipCode})</p>
                  <p className="text-xs italic text-zinc-400">Tipo: {order.shippingAddress.addressType || 'Domicilio'}</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/30 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Información de Envío</span>
                  <p className="text-xs font-bold">Courier: <span className="font-mono text-zinc-600 dark:text-zinc-400">{order.shippingDetails?.provider || 'Pendiente'}</span></p>
                  <p className="text-xs font-bold">Guía: <span className="font-mono text-zinc-600 dark:text-zinc-400">{order.shippingDetails?.trackingNumber || 'No asignada'}</span></p>
                </div>
              </div>
            </section>
          )}

          {/* COMPROBANTE DE PAGO */}
          {order.paymentProof && (
            <section className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="text-amber-500" size={20} />
                <div>
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Comprobante de Pago Subido</p>
                  <p className="text-[11px] text-zinc-500">Revisá la transferencia bancaria/fiat antes de actuar.</p>
                </div>
              </div>
              <a href={order.paymentProof} target="_blank" rel="noreferrer" className="bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-1 hover:bg-amber-600 transition-colors">
                Ver Recibo <ExternalLink size={12} />
              </a>
            </section>
          )}

          {/* PRODUCTS LIST FROM SNAPSHOT */}
          <section>
            <h3 className="text-xs font-black italic uppercase mb-3 text-zinc-400 tracking-widest">Items Preservados (Snapshot)</h3>
            <div className="space-y-3">
              {order.itemsSnapshot?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 shadow-sm">
                  <div className="flex gap-4 items-center">
                    {item.images && item.images[0] ? (
                      <img src={item.images[0]} alt={item.title} className="w-12 h-12 object-cover rounded-xl border border-zinc-100 dark:border-zinc-800" />
                    ) : (
                      <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900 rounded-xl flex items-center justify-center font-black italic text-[#F26722]">N</div>
                    )}
                    <div>
                      <p className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{item.title}</p>
                      <p className="text-xs text-zinc-400">Cant: {item.quantity} · Condición: {item.condition || 'Nuevo'} · Envío: {item.shipping?.free ? 'Gratis' : `$${item.shipping?.cost}`}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm">$ {item.price * item.quantity}</p>
                    <p className="text-[10px] text-zinc-400 font-mono">u.p. $ {item.price}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

                    {/* FINANCIAL SUMMARY DUAL */}
          <section className="bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black p-6 rounded-[2rem] grid grid-cols-1 sm:grid-cols-2 gap-6 border border-zinc-800 dark:border-zinc-200">
            <div className="space-y-2 border-b sm:border-b-0 sm:border-r border-white/10 dark:border-black/10 pb-4 sm:pb-0 sm:pr-6">
              {/* ⚠️ Cuando el comprador pagó con saldo de recompensas, el backend
                  guarda en `totalAmount`/`productsAmount` el EFECTIVO en USD, no
                  los pesos. Antes el bloque decía "Valores en Pesos (Base ARS)" y
                  mostraba "US$3" como "$3": usamos la moneda real.
                  OJO: `shippingAmount` SÍ queda siempre en ARS (el envío nunca se
                  paga con recompensas). */}
              <span className="text-[10px] font-black text-[#F26722] uppercase tracking-widest block">
                {isOrderTotalInUsd(order) ? 'Valores (USD — efectivo con recompensas)' : 'Valores en Pesos (Base ARS)'}
              </span>
              <div className="flex justify-between text-xs opacity-70">
                <span>Monto Productos</span>
                <span>
                  {isOrderTotalInUsd(order) ? `US$ ${Number(order.productsAmount || 0).toFixed(2)}` : `$ ${order.productsAmount}`}
                </span>
              </div>
              <div className="flex justify-between text-xs opacity-70">
                <span>Costo de Envío</span>
                <span>$ {order.shippingAmount}</span>
              </div>
              <div className="flex justify-between text-base font-black italic pt-2 border-t border-white/10 dark:border-black/10">
                <span>Total Bruto</span>
                <span>
                  {isOrderTotalInUsd(order) ? `US$ ${Number(order.totalAmount || 0).toFixed(2)}` : `$ ${order.totalAmount}`}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black text-blue-400 dark:text-blue-600 uppercase tracking-widest block">Liquidación Crypto (Etherscan Ref)</span>
              <div className="flex justify-between text-xs opacity-70">
                <span>Cotización USD/ARS</span>
                <span>$ {order.financials?.usdRate}</span>
              </div>
              <div className="flex justify-between text-xs text-rose-400 dark:text-rose-600 font-medium">
                <span>Comisión Pool (3%)</span>
                <span>- $ {order.financials?.platformFeeUsd} USDT</span>
              </div>
              <div className="flex justify-between text-base font-black italic pt-2 border-t border-white/10 dark:border-black/10 text-emerald-400 dark:text-emerald-600">
                <span>Neto a Vendedor</span>
                <span>$ {order.financials?.sellerNetReleaseUsd} USDT</span>
              </div>
            </div>
          </section>

        </div>

                        {/* FOOTER ACTION BUTTONS DYNAMIC */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30">
          <div className="p-5 md:p-6 space-y-5">

            {/* ── BANNERS DE CONTEXTO ───────────────────────────────────── */}

            {/* RECEPTION_CONFIRMED: aviso del período de seguridad */}
            {order.status === 'reception_confirmed' && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                  <ShieldCheck size={13} /> El comprador confirmó la recepción
                </p>
                <p className="text-[11px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">
                  {order.releaseEligibleAt
                    ? `Período de seguridad hasta: ${new Date(order.releaseEligibleAt).toLocaleString('es-AR')}. `
                    : ''}
                  Completá la orden para liberar la garantía/escrow al vendedor.
                </p>
              </div>
            )}

            {/* DISPUTA ABIERTA (general): muestra el motivo y a favor de quién se puede resolver */}
            {order.dispute?.exists && order.dispute.status === "open" && (
              <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1.5">
                  <AlertCircle size={13} /> Orden en disputa
                </p>
                {order.dispute.description && (
                  <p className="text-[11px] leading-relaxed text-rose-700/90 dark:text-rose-300/90 mb-1">
                    <b>Motivo:</b> {order.dispute.description}
                  </p>
                )}
                <p className="text-[11px] leading-relaxed text-rose-700/80 dark:text-rose-300/80">
                  Resolvé la disputa con los botones de abajo (a favor del comprador o del vendedor).
                  Cerrar la disputa NO mueve fondos: después usá "Reembolsar" o "Completar/Liberar".
                </p>
              </div>
            )}

            {/* DISPUTA DE PAGO NO RECIBIDO */}
            {order.dispute?.exists &&
              order.dispute.status === "open" &&
              String(order.dispute.raisedBy) === String(order.seller?._id) &&
              order.status === "verifying_payment" &&
              order.payment?.method !== "crypto" && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-1">
                  El vendedor reportó "pago no recibido" — Resolver disputa
                </p>
                <p className={`text-[11px] leading-relaxed ${order.paymentProof ? 'text-amber-700/80 dark:text-amber-300/80' : 'text-rose-600 dark:text-rose-400'}`}>
                  {order.paymentProof
                    ? 'El comprador adjuntó un comprobante. Revisalo antes de decidir.'
                    : 'El comprador aún NO adjuntó comprobante.'}
                </p>
              </div>
            )}

            {/* ── ACCIONES PRINCIPALES (según estado) ─────────────────────
              Grilla de 2 columnas en desktop, 1 en mobile. Todas las
              acciones principales comparten tamaño y estilo vía ActionButton. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* DISPUTA ABIERTA (cualquier origen): resolver a favor de una parte */}
            {order.dispute?.exists && order.dispute.status === "open" && (
              <>
                <ActionButton full variant="indigo" onClick={() => onAction(order._id, 'close_dispute_buyer')}>
                  Cerrar Disputa · a favor del COMPRADOR
                </ActionButton>
                <ActionButton full variant="emerald" onClick={() => onAction(order._id, 'close_dispute_seller')}>
                  Cerrar Disputa · a favor del VENDEDOR
                </ActionButton>
              </>
            )}
              {/* PENDING PAYMENT */}
              {order.status === 'pending_payment' && (
                <ActionButton full variant="rose" onClick={() => onAction(order._id, 'force_expire')}>
                  Forzar Expiración (Liberar Pool)
                </ActionButton>
              )}

              {/* VERIFYING PAYMENT */}
              {order.status === 'verifying_payment' && (
                <>
                  <ActionButton variant="emerald" onClick={() => onAction(order._id, 'approve_payment')}>
                    Aprobar Pago Manual (→ Paid)
                  </ActionButton>
                  <ActionButton variant="outline" onClick={() => onAction(order._id, 'reject_payment')}>
                    Rechazar Comprobante
                  </ActionButton>
                </>
              )}

              {/* PAID: vendedor colgado con el envío */}
              {order.status === 'paid' && (
                <ActionButton full variant="indigo" onClick={() => onAction(order._id, 'force_ship')}>
                  Cargar Tracking / Forzar Despacho
                </ActionButton>
              )}

              {/* RECEPTION_CONFIRMED: cerrar venta y liberar */}
              {order.status === 'reception_confirmed' && (
                <ActionButton full variant="emerald" onClick={() => onAction(order._id, 'admin_complete')}>
                  Completar Orden y Liberar Garantía
                </ActionButton>
              )}

              {/* SHIPPED: arbitraje */}
              {order.status === 'shipped' && (
                <ActionButton full variant="dark" onClick={() => onAction(order._id, 'force_release_escrow')}>
                  Liberar Escrow Manual (Arbitraje 0% Fee)
                </ActionButton>
              )}

              {/* LIBERACIÓN SOLICITADA POR EL VENDEDOR */}
              {!['completed', 'cancelled', 'expired', 'reception_confirmed'].includes(order.status) &&
                order.releaseRequest?.exists && (
                  <ActionButton
                    full
                    variant="amber"
                    onClick={() => onAction(order._id, 'release_guarantee')}
                  >
                    Liberar Garantía Solicitada por Vendedor
                  </ActionButton>
                )}

              {/* REEMBOLSAR AL COMPRADOR */}
              {!['completed', 'cancelled', 'expired'].includes(order.status) && (
                <ActionButton
                  variant="rose"
                  icon={Undo2}
                  onClick={() => onAction(order._id, 'refund_buyer')}
                >
                  {order.payment?.method === 'crypto' && order.payment?.status === 'funded'
                    ? 'Reembolsar Comprador (Escrow)'
                    : 'Reembolsar / Cancelar Comprador'}
                </ActionButton>
              )}

              {/* RESOLUCIÓN DE DISPUTA */}
              {order.dispute?.exists &&
                order.dispute.status === "open" &&
                String(order.dispute.raisedBy) === String(order.seller?._id) &&
                order.status === "verifying_payment" &&
                order.payment?.method !== "crypto" && (
                  <>
                    <ActionButton variant="emerald" onClick={() => onAction(order._id, 'resolve_payment_received')}>
                      Pago SÍ acreditado (→ Verificación)
                    </ActionButton>
                    <ActionButton variant="rose" onClick={() => onAction(order._id, 'resolve_payment_no')}>
                      No se acreditó — Cancelar y liberar
                    </ActionButton>
                  </>
                )}
            </div>

            {/* ── HERRAMIENTAS DE ADMIN (secundarias) ──────────────────────
                Agrupadas aparte y más discretas para no competir con las
                acciones principales. Tamaño uniforme y wrap limpio. */}
            {(
              (!['completed', 'expired', 'reception_confirmed'].includes(order.status) && order.status !== 'pending_payment') ||
              order.status !== 'expired'
            ) && (
              <div className="pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-700/70">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2.5 flex items-center gap-1.5">
                  <Wrench size={11} /> Herramientas de administración
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* LIBERAR GARANTÍA (Admin) */}
                  {!['completed', 'expired', 'reception_confirmed'].includes(order.status) &&
                    order.status !== 'pending_payment' && (
                      <ActionButton
                        size="sm"
                        variant="outline-amber"
                        className="!w-auto"
                        onClick={() => onAction(order._id, 'release_guarantee')}
                      >
                        Liberar Garantía (Admin)
                      </ActionButton>
                    )}

                                    {/* ABRIR DISPUTA (cataloga el caso como en disputa) */}
                  {!['completed', 'cancelled', 'expired'].includes(order.status) &&
                    !(order.dispute?.exists && order.dispute.status === 'open') && (
                      <ActionButton
                        size="sm"
                        variant="outline-rose"
                        className="!w-auto"
                        onClick={() => onAction(order._id, 'open_dispute')}
                      >
                        Abrir Disputa
                      </ActionButton>
                    )}

                  {/* VERIFICAR COLATERAL ON-CHAIN */}
                  {order.status !== 'expired' && (
                    <ActionButton
                      size="sm"
                      variant="outline-blue"
                      className="!w-auto"
                      onClick={() => onAction(order._id, 'check_collateral')}
                    >
                      Verificar Colateral (on-chain)
                    </ActionButton>
                  )}

                  {/* CANCELAR ORDEN (sin liberar garantía) */}
                  {!['completed', 'cancelled', 'expired'].includes(order.status) && (
                    <ActionButton
                      size="sm"
                      variant="outline-rose"
                      className="!w-auto"
                      onClick={() => onAction(order._id, 'cancel_order')}
                    >
                      Cancelar Orden (sin liberar garantía)
                    </ActionButton>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOrderModal;