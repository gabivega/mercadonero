import React from 'react';
import { X, Package, Truck, User, CreditCard, ExternalLink } from 'lucide-react';

const AdminOrderModal = ({ order, isOpen, onClose }) => {
  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
        
        {/* HEADER FIXED */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30">
          <div>
            <h2 className="text-xl font-black italic uppercase tracking-tighter">Detalle de Orden</h2>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{order._id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          
          {/* STATUS & DATE */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Estado Actual</span>
              <span className="font-bold uppercase italic text-[#F26722]">{order.status}</span>
            </div>
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Fecha de Creación</span>
              <span className="font-bold">{new Date(order.createdAt).toLocaleDateString('es-AR')}</span>
            </div>
          </div>

          {/* PARTICIPANTS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section>
              <h3 className="flex items-center gap-2 text-sm font-black italic uppercase mb-4 text-zinc-400">
                <User size={16} /> Comprador
              </h3>
              <div className="space-y-1">
                <p className="font-bold text-lg">{order.buyer?.firstName} {order.buyer?.lastName}</p>
                <p className="text-sm text-zinc-500">{order.buyer?.email}</p>
              </div>
            </section>
            <section>
              <h3 className="flex items-center gap-2 text-sm font-black italic uppercase mb-4 text-zinc-400">
                <Package size={16} /> Vendedor
              </h3>
              <div className="space-y-1">
                <p className="font-bold text-lg">{order.seller?.businessName || `${order.seller?.firstName} ${order.seller?.lastName}`}</p>
                <p className="text-sm text-zinc-500">{order.seller?.email}</p>
              </div>
            </section>
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* PRODUCTS LIST */}
          <section>
            <h3 className="text-sm font-black italic uppercase mb-4 text-zinc-400 tracking-widest">Items del Pedido</h3>
            <div className="space-y-4">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 bg-white dark:bg-black rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900 rounded-lg flex items-center justify-center font-black italic text-[#F26722]">N</div>
                    <div>
                      <p className="font-bold text-sm">{item.name || 'Producto Nero'}</p>
                      <p className="text-xs text-zinc-400 italic">Cantidad: {item.quantity || 1}</p>
                    </div>
                  </div>
                  <p className="font-black">$ {item.price}</p>
                </div>
              ))}
            </div>
          </section>

          {/* FINANCIAL SUMMARY */}
          <section className="bg-zinc-900 dark:bg-white text-white dark:text-black p-6 rounded-[2rem] space-y-3">
             <div className="flex justify-between text-sm opacity-70">
                <span>Subtotal</span>
                <span>$ {order.totalAmount}</span>
             </div>
             <div className="flex justify-between text-sm opacity-70">
                <span>Comisión Nero (3%)</span>
                <span>$ {(order.financials?.platformFeeUsed)}</span>
             </div>
             <div className="flex justify-between text-xl font-black italic uppercase pt-2 border-t border-white/10 dark:border-black/10">
                <span>Total Final</span>
                <span className="text-[#F26722]">$ {order.totalAmount}</span>
             </div>
          </section>

        </div>

        {/* FOOTER FIXED ACTIONS */}
        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
           <button className="flex-1 bg-zinc-900 dark:bg-white dark:text-black text-white py-3 rounded-2xl font-black italic uppercase text-sm hover:scale-[1.02] transition-transform">
             Liberar Escrow
           </button>
           <button className="px-6 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-bold text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
             Soporte
           </button>
        </div>
      </div>
    </div>
  );
};

export default AdminOrderModal;