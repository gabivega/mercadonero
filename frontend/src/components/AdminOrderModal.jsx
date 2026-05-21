import React from 'react';
import { 
  X, Package, Truck, User, CreditCard, ExternalLink, 
  MapPin, Calendar, Clock, ShieldCheck, AlertCircle, FileText 
} from 'lucide-react';

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
              <span className="text-[10px] font-black text-[#F26722] uppercase tracking-widest block">Valores en Pesos (Base ARS)</span>
              <div className="flex justify-between text-xs opacity-70">
                <span>Monto Productos</span>
                <span>$ {order.productsAmount}</span>
              </div>
              <div className="flex justify-between text-xs opacity-70">
                <span>Costo de Envío</span>
                <span>$ {order.shippingAmount}</span>
              </div>
              <div className="flex justify-between text-base font-black italic pt-2 border-t border-white/10 dark:border-black/10">
                <span>Total Bruto</span>
                <span>$ {order.totalAmount}</span>
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
        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-3">
          
          {/* ACCIÓN: PENDING PAYMENT */}
          {order.status === 'pending_payment' && (
            <button 
              onClick={() => onAction(order._id, 'force_expire')}
              className="flex-1 bg-rose-600 text-white py-3 rounded-2xl font-black italic uppercase text-xs hover:bg-rose-700 transition-colors"
            >
              Forzar Expiración (Liberar Pool)
            </button>
          )}

          {/* ACCIÓN: VERIFYING PAYMENT */}
          {order.status === 'verifying_payment' && (
            <>
              <button 
                onClick={() => onAction(order._id, 'approve_payment')}
                className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black italic uppercase text-xs hover:bg-emerald-700 transition-colors"
              >
                Aprobar Pago Manual (Pasar a Paid)
              </button>
              <button 
                onClick={() => onAction(order._id, 'reject_payment')}
                className="bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 px-4 py-3 rounded-2xl font-bold text-xs hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                Rechazar Comprobante
              </button>
            </>
          )}

          {/* ACCIÓN: PAID (Vendedor colgado con el envío) */}
          {order.status === 'paid' && (
            <button 
              onClick={() => onAction(order._id, 'force_ship')}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-black italic uppercase text-xs hover:bg-indigo-700 transition-colors"
            >
              Cargar Tracking / Forzar Despacho
            </button>
          )}

          {/* ACCIÓN: SHIPPED (Arbitraje / El comprador no confirma) */}
          {order.status === 'shipped' && (
            <button 
              onClick={() => onAction(order._id, 'force_release_escrow')}
              className="flex-1 bg-zinc-950 dark:bg-white text-white dark:text-black py-3 rounded-2xl font-black italic uppercase text-xs hover:scale-[1.01] transition-transform shadow-md"
            >
              Liberar Escrow Manual (Arbitraje 0% Fee)
            </button>
          )}

          {/* ACCIÓN COMPARTIDA: CANCELAR SIEMPRE QUE NO ESTÉ COMPLETADO */}
          {!['completed', 'cancelled', 'expired'].includes(order.status) && (
            <button 
              onClick={() => onAction(order._id, 'cancel_order')}
              className="px-5 py-3 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-2xl font-bold text-xs hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
            >
              Cancelar Orden
            </button>
          )}

          <button onClick={onClose} className="px-5 py-3 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-auto">
            Cerrar Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminOrderModal;