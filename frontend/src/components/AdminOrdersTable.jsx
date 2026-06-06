import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import { formatMoney } from '../Utils/currencyFormatter';
import AdminOrderModal from './AdminOrderModal';
import LoadingSpinner from './LoadingSpinner';

const AdminOrdersTable = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const {getAccessToken} = usePrivy();
  const [selectedOrder, setSelectedOrder] = useState(null);
const [isModalOpen, setIsModalOpen] = useState(false);

const handleOpenModal = (order) => {
  setSelectedOrder(order);
  setIsModalOpen(true);
};
  
  // Simulación de fetch a tu controlador de admin
  useEffect(() => {
    const fetchOrders = async () => {
      const token = await getAccessToken();
      try {
        const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/orders`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        // console.log(res.data);
        setOrders(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);
  
  const StatusBadge = ({ status }) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      paid: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      shipped: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-zinc-100 text-zinc-600'}`}>
        {status}
      </span>
    );
  };
  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-12">
        <LoadingSpinner size="lg" text="Cargando órdenes..." />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">ID Orden</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Comprador</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Vendedor</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Monto</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Fecha</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Estado</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {/* Aquí harás el map de orders */}
            {orders.map((order) => (
            <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <td className="p-6 font-mono text-xs text-zinc-500">{order._id}</td>
              <td className="p-6">
                <div className="text-sm font-bold">{order.buyer.firstName + ' ' + order.buyer.lastName}</div>
              </td>
              <td className="p-6">
                <div className="text-sm font-bold">{order.seller.username}</div>
              </td>
              <td className="p-6 font-black text-sm">${formatMoney(order.totalAmount)}</td>
              <td className="p-6"><div className="text-sm text-zinc-500 flex flex-col">
                <p>{new Date(order.createdAt).toLocaleDateString()}</p>
                <p>{new Date(order.createdAt).toLocaleTimeString()}</p>
              </div></td>
              <td className="p-6"><StatusBadge status={order.status} /></td>
              <td className="p-6">
                <div className="flex items-center gap-2">
                  <button 
                  onClick={() => handleOpenModal(order)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors">
                    <Eye size={18} />
                  </button>
                  <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-500 transition-colors">
                    <RefreshCw size={18} />
                  </button>
                </div>
              </td>
            </tr>
            ))}
          </tbody>
        </table>
        <AdminOrderModal order={selectedOrder} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </div>
    </div>
  );
};

export default AdminOrdersTable;