import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, ExternalLink } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

const AdminOrdersTable = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
const { user, authenticated, ready } = usePrivy();
  const ADMIN_ID = import.meta.env.VITE_ADMIN_PRIVY_ID;


  
  
  // Simulación de fetch a tu controlador de admin
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        // const res = await axios.get('/api/admin/orders');
        // setOrders(res.data);
        setLoading(false);
      } catch (err) {
        console.error(err);
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

    if (!ready) return <p>Cargando...</p>;

    if (!authenticated || user?.id !== ADMIN_ID) {
    return (
      <div className="h-screen flex items-center justify-center">
        <h1 className="text-xl font-black uppercase italic">403 | Acceso Denegado</h1>
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
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Comprador / Vendedor</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Monto</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Estado</th>
              <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {/* Aquí harás el map de orders */}
            <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <td className="p-6 font-mono text-xs text-zinc-500">#65f2...a12c</td>
              <td className="p-6">
                <div className="text-sm font-bold">Gabi Vega</div>
                <div className="text-[10px] text-zinc-400 uppercase">A: Juan Marketing</div>
              </td>
              <td className="p-6 font-black text-sm">$ 150.00</td>
              <td className="p-6"><StatusBadge status="shipped" /></td>
              <td className="p-6">
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors">
                    <Eye size={18} />
                  </button>
                  <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-500 transition-colors">
                    <RefreshCw size={18} />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminOrdersTable;