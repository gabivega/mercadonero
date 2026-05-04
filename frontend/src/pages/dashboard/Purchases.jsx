import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function Purchases() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getAccessToken } = usePrivy();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const token = await getAccessToken();
        const response = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/order/my-orders?role=buyer`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setOrders(response.data.orders);
      } catch (error) {
        console.error("Error al traer órdenes:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  // Helper para los colores y etiquetas del estado
  const getStatusDetails = (status) => {
    const states = {
      pending_payment: { label: 'Pendiente de pago', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/10', icon: <Clock size={14}/> },
      verifying_payment: { label: 'Verificando pago', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/10', icon: <AlertCircle size={14}/> },
      paid: { label: 'Pagado', color: 'text-green-500 bg-green-50 dark:bg-green-900/10', icon: <CheckCircle size={14}/> },
      completed: { label: 'Entregado', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800', icon: <Package size={14}/> },
      cancelled: { label: 'Cancelado', color: 'text-red-500 bg-red-50 dark:bg-red-900/10', icon: <AlertCircle size={14}/> },
    };
    return states[status] || { label: status, color: 'text-gray-500 bg-gray-50', icon: null };
  };

  if (loading) return <div className="p-10 text-center">Cargando tus compras...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Mis Compras</h2>
        <p className="text-gray-500 dark:text-gray-400">Gestiona tus pedidos y revisa el estado de tus transferencias.</p>
      </div>

      {orders.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center text-gray-500">
          Aún no has realizado ninguna compra.
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => {
            const status = getStatusDetails(order.status);
            const firstItem = order.itemsSnapshot[0];

            return (
              <div 
                key={order._id}
                onClick={() => navigate(`/order/${order._id}`)}
                className="group bg-white dark:bg-[#121212] border border-gray-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-[#3483fa] transition-all cursor-pointer"
              >
                {/* Miniatura */}
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex-shrink-0">
                  <img 
                    src={firstItem?.images[0]} 
                    alt={firstItem?.title} 
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info Principal */}
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${status.color}`}>
                      {status.icon} {status.label}
                    </span>
                    <span className="text-xs text-gray-400 italic">
                      #{order._id.slice(-6)}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-1">
                    {firstItem?.title} {order.itemsSnapshot.length > 1 && `+ ${order.itemsSnapshot.length - 1} más`}
                  </h3>
                  
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Vendedor: <span className="text-gray-700 dark:text-gray-200">{order.seller?.username || 'Usuario Nero'}</span>
                  </p>
                </div>

                {/* Precio y Fecha */}
                <div className="text-right hidden sm:block">
                  <p className="text-lg font-black text-gray-900 dark:text-gray-100">
                    ${order.totalAmount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString('es-AR')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}