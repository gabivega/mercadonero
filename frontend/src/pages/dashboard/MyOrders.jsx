import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShoppingBag, Tag, Clock, ChevronRight, AlertCircle } from 'lucide-react';
import { usePrivy } from "@privy-io/react-auth";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const {getAccessToken} = usePrivy();

  useEffect(() => {
    const fetchOrders = async () => {
        const token = await getAccessToken();
      try {
        // Asumiendo que verifyPrivyToken maneja el header de Authorization
        const { data } = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/order/my-orders?role=seller`, 
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )
        setOrders(data.orders || []);
      } catch (error) {
        console.error("Error al traer órdenes:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'payment_submitted': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'payment_confirmed': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'shipped': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'expired': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const translateStatus = (status) => {
    const map = {
      pending: 'Pendiente Pago',
      payment_submitted: 'Pago Enviado',
      verifying_payment: 'Pago por verificar',
      payment_confirmed: 'Pago Recibido',
      shipped: 'Enviado',
      completed: 'Finalizada',
      expired: 'Expirada'
    };
    return map[status] || status;
  };

  if (loading) return <div className="p-8 text-center"><LoadingSpinner size="lg" text="Cargando órdenes..." /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">Actividad Comercial</h2>
      </div>

      {orders.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] text-center">
          <ShoppingBag className="mx-auto text-zinc-300 mb-4" size={48} />
          <p className="text-zinc-500 font-medium">Aún no hay movimientos registrados.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => (
            <div 
              key={order._id}
              onClick={() => navigate(`/order/${order._id}`)}
              className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-[2rem] hover:border-[#F26722] transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${getStatusStyle(order.status)}`}>
                    {order.status === 'payment_submitted' ? <AlertCircle size={24} /> : <Clock size={24} />}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        ID: {order._id.slice(-6)}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getStatusStyle(order.status)}`}>
                        {translateStatus(order.status)}
                      </span>
                    </div>
                    <h3 className="font-bold text-zinc-900 dark:text-white leading-none">
                      {order.products.length} {order.products.length === 1 ? 'Producto' : 'Productos'}
                    </h3>
                    <p className="text-sm text-zinc-500 mt-1 font-medium">
                      Total: <span className="text-[#F26722]">${order.totalAmount.toLocaleString()}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block mr-4">
                    <p className="text-[10px] text-zinc-400 uppercase font-black tracking-tighter">Comprador</p>
                    <p className="text-xs font-bold dark:text-zinc-300">
                      {order.buyer.username}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block mr-4">
                    <p className="text-[10px] text-zinc-400 uppercase font-black tracking-tighter">Fecha</p>
                    <p className="text-xs font-bold dark:text-zinc-300">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="text-zinc-300 group-hover:text-[#F26722] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              
              {/* Indicador visual para el vendedor si hay un pago pendiente de revisar */}
              {order.status === 'payment_submitted' && (
                <div className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F26722] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-[#F26722]"></span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}