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

    // Acciones de admin desde el modal de órdenes
  const handleAdminAction = async (orderId, action) => {
    const token = await getAccessToken();

    if (action === 'cancel_order') {
      // Solo marca la orden como cancelada. La garantía NO se libera acá:
      // se resuelve aparte, manualmente, después de verificar con el comprador.
      if (!window.confirm('¿Cancelar esta orden manualmente? Esto NO libera la garantía automáticamente. La garantía se libera en un paso aparte (manual) tras verificar con el comprador.')) return;
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
        window.alert('Orden cancelada. La garantía sigue retenida hasta que la liberes manualmente.');
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        window.alert(err?.response?.data?.message || 'No se pudo cancelar la orden.');
      }
      return;
    }

        if (action === 'release_guarantee') {
      if (!window.confirm('¿Liberar la garantía de esta orden manualmente? Confirmá que ya verificaste con el comprador que no abonó o que recibió su reintegro.')) return;
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/release-guarantee`,
          { approve: true, note: 'Liberación manual desde panel admin' },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        window.alert('Garantía liberada y orden cancelada.');
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        window.alert(err?.response?.data?.message || 'No se pudo liberar la garantía.');
      }
      return;
    }

    if (action === 'check_collateral') {
      // Consulta el estado real del colateral on-chain para discernir entre:
      //  - lock activo (está congelado de verdad) → toca liberar
      //  - lock en 0 (ya se liberó, hash falso positivo) → solo reconciliar DB
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/collateral-status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const r = res.data;
        const onChain = r.onChain || {};
        const detalle = [
          `Estado orden (DB): ${r.orderStatus}`,
          `Lock on-chain: ${onChain.orderLockActive ? '⚠️ ACTIVO (congelado)' : 'Liberado (0)'}`,
          `Lock amount: ${onChain.orderLockUsd ?? 'N/D'} USDT`,
          `Vendedor bloqueado: ${onChain.vendorLockedCollateral ?? 'N/D'} USDT`,
          `Vendedor disponible: ${onChain.vendorAvailable ?? 'N/D'} USDT`,
          '',
          r.resolucion_requerida || '',
        ].join('\n');
        window.alert(detalle);
      } catch (err) {
        window.alert(err?.response?.data?.message || 'No se pudo verificar el colateral.');
      }
      return;
    }
  };

  // Recarga la lista de órdenes desde el servidor
  const refreshOrders = async (token) => {
    setLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(res.data?.orders || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
        setOrders(res.data?.orders || res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);
  
        // Devuelve un texto si la orden tiene una solicitud de cancelación
    // pendiente que requiere intervención del admin (para detectarla fácil).
        const detectPendingCancellation = (order) => {
      const pendingRelease =
        order.releaseRequest?.exists && order.releaseRequest.status === 'pending';
      const pendingRefund =
        order.pendingRequest?.exists && order.pendingRequest.status === 'pending';
      const dispute = order.dispute?.exists && order.dispute.status === 'open';
      if (dispute) return `⚖️ Disputa: ${order.dispute.issueType || 'problema'}`;
      if (pendingRelease) return 'Cancelación solicitada (admin)';
      if (pendingRefund) return 'Reembolso en proceso';
      return null;
    };

    const StatusBadge = ({ status, label }) => {
    const styles = {
      pending_payment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      verifying_payment: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      shipped: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
      expired: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-zinc-100 text-zinc-600'}`}>
        {label || status}
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
            {orders.map((order) => {
              // Normalizar código de orden corto por si el backend no lo manda
              const code = order.code || String(order._id || '').slice(-6).toUpperCase();
              const statusLabels = {
                pending_payment: 'Pago Pendiente',
                verifying_payment: 'Verificando',
                paid: 'Pagado',
                shipped: 'En camino',
                completed: 'Completado',
                cancelled: 'Cancelado',
                expired: 'Expirado',
              };
              const buyerName =
                order.buyer?.firstName || order.buyer?.username || order.buyer?.email || 'Comprador';
              const sellerName =
                order.seller?.username || order.seller?.firstName || order.seller?.email || 'Vendedor';
              return (
                <tr key={order._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="p-6 font-mono text-xs text-zinc-500">#{code}</td>
                  <td className="p-6">
                    <div className="text-sm font-bold">{buyerName}</div>
                  </td>
                  <td className="p-6">
                    <div className="text-sm font-bold">{sellerName}</div>
                  </td>
                  <td className="p-6 font-black text-sm">${formatMoney(order.totalAmount)}</td>
                  <td className="p-6">
                    <div className="text-sm text-zinc-500 flex flex-col">
                      <p>{new Date(order.createdAt).toLocaleDateString()}</p>
                      <p>{new Date(order.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col gap-1 items-start">
                      <StatusBadge status={order.status} label={statusLabels[order.status] || order.status} />
                      {detectPendingCancellation(order) && (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 animate-pulse">
                          {detectPendingCancellation(order)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenModal(order)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors">
                        <Eye size={18} />
                      </button>
                                            <button
                        onClick={async () => {
                          try {
                            const token = await getAccessToken();
                            setLoading(true);
                            const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/orders`, {
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            setOrders(res.data?.orders || res.data || []);
                          } catch (e) {
                            console.error(e);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-500 transition-colors"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <AdminOrderModal order={selectedOrder} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAction={handleAdminAction} />
      </div>
    </div>
  );
};

export default AdminOrdersTable;