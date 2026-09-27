import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, CheckCircle, AlertCircle, Truck, Ban, Users } from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import SellerPoolCard from '../../components/SellerPoolCard';
import { usePools } from '../../Utils/usePools';
import { useUserStore } from '../../store/useUserStore';

export default function Purchases() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("orders"); // "orders" | "pools"
  const [pools, setPools] = useState([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const { getAccessToken } = usePrivy();
  const navigate = useNavigate();
  const { fetchMyPools } = usePools();
  const currentUserId = useUserStore((s) => s.dbUser?._id);

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

  // Grupos de compra en los que participa el comprador (creador o miembro).
  useEffect(() => {
    const fetchPools = async () => {
      setPoolsLoading(true);
      const list = await fetchMyPools({ status: "open", silent: true });
      setPools(list);
      setPoolsLoading(false);
    };
    fetchPools();
  }, [fetchMyPools]);

  // Helper para los colores y etiquetas del estado
    const getStatusDetails = (status) => {
    const states = {
      awaiting_collateral: { label: 'En espera de garantía', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/10', icon: <Clock size={14}/> },
      pending_payment: { label: 'Pendiente de pago', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/10', icon: <Clock size={14}/> },
      verifying_payment: { label: 'Verificando pago', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/10', icon: <AlertCircle size={14}/> },
      paid: { label: 'Pagado', color: 'text-green-500 bg-green-50 dark:bg-green-900/10', icon: <CheckCircle size={14}/> },
      completed: { label: 'Entregado', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800', icon: <Package size={14}/> },
      shipped: { label: 'Despachado', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800', icon: <Truck size={14}/> },
      expired: { label: 'Expirado', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800', icon: <Ban size={14}/> },
      cancelled: { label: 'Cancelado', color: 'text-red-500 bg-red-50 dark:bg-red-900/10', icon: <AlertCircle size={14}/> },
    };
    return states[status] || { label: status, color: 'text-gray-500 bg-gray-50', icon: null };
  };

  if (loading) return  <LoadingSpinner size="lg" text="Cargando Compras..." />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Mis Compras</h2>
        <p className="text-gray-500 dark:text-gray-400">Gestiona tus pedidos y revisa el estado de tus transferencias.</p>
      </div>

            {/* Solapas: Órdenes | Mis grupos */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("orders")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
            tab === "orders"
              ? "bg-[#F26722] text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Package size={14} /> Mis compras
          {orders.length > 0 && (
            <span className={`text-[10px] px-1.5 rounded-full ${tab === "orders" ? "bg-white/25" : "bg-zinc-200 dark:bg-zinc-700"}`}>
              {orders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("pools")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
            tab === "pools"
              ? "bg-[#F26722] text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Users size={14} /> Mis grupos
          {pools.length > 0 && (
            <span className={`text-[10px] px-1.5 rounded-full ${tab === "pools" ? "bg-white/25" : "bg-zinc-200 dark:bg-zinc-700"}`}>
              {pools.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Solapa: ÓRDENES ── */}
      {tab === "orders" && (
        orders.length === 0 ? (
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
        )
      )}

      {/* ── Solapa: MIS GRUPOS ── */}
      {tab === "pools" && (
        poolsLoading ? (
          <div className="p-8 text-center">
            <LoadingSpinner size="lg" text="Cargando grupos..." />
          </div>
        ) : pools.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center">
            <Users className="mx-auto text-zinc-300 mb-4" size={48} />
            <p className="text-zinc-500 font-medium">
              Todavía no participás en ningún grupo de compra.
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Sumate a un grupo para comprar a mejor precio. Cuando el grupo
              cierre, tu compra aparecerá en "Mis compras".
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pools.map((pool) => (
              <SellerPoolCard
                key={pool._id}
                pool={pool}
                role="buyer"
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}