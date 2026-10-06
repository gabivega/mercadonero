import React, { useEffect, useState } from "react";
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  Gauge,
  DollarSign,
  Coins,
  TrendingUp,
  Eye,
  Users,
  RefreshCw,
} from "lucide-react";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import { formatMoney } from "../Utils/currencyFormatter";
import LoadingSpinner from "./LoadingSpinner";

/**
 * Panel de estadísticas del admin (una sola pantalla, lo más simple posible).
 * Trae TODO desde GET /api/admin/stats y muestra:
 *  - Fila de KPIs (órdenes, disputas, GMV, ganancia, publicaciones, vistas).
 *  - Ganancias (bruta / reintegros / neta).
 *  - Marketing (usuarios, vendedores, conversión, ticket promedio).
 *  - Tops: vendedores, categorías, productos más vistos, métodos de pago.
 *  - Alertas (disputas abiertas, sin stock, usuarios restringidos).
 */
const AdminStats = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { getAccessToken } = usePrivy();

  const fetchStats = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/stats`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(res.data?.stats || null);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las estadísticas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-12">
        <LoadingSpinner size="lg" text="Calculando estadísticas..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-12 text-center">
        <p className="text-sm text-rose-500 mb-4">{error || "Sin datos."}</p>
        <button
          onClick={fetchStats}
          className="px-5 py-2 bg-[#F26722] text-white rounded-xl text-sm font-bold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { orders, gmv, revenue, products, users, averages, paymentMethods, topSellers, topCategories, topProducts } = data;

  const usd = (v) => `$ ${Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Tarjeta de KPI reutilizable.
  const Kpi = ({ icon: Icon, label, value, sub, accent = "text-zinc-900 dark:text-zinc-100" }) => (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-zinc-400 mb-3">
        <Icon size={16} />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-2xl font-black italic tracking-tight ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </div>
  );

  // Bloque genérico de lista con título.
  const Card = ({ title, children }) => (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
      <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">{title}</h3>
      {children}
    </div>
  );

  const methodLabel = (m) =>
    m === "crypto" ? "Cripto (USDT)" : m === "bank_transfer" ? "Transferencia" : m;

  return (
    <div className="space-y-6">
      {/* Botón refresh */}
      <div className="flex justify-end">
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-500 hover:text-[#F26722] transition-colors"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {/* ── KPI PRINCIPALES ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={ShoppingCart} label="Órdenes completadas" value={orders.completed} accent="text-emerald-500" sub={`${orders.total} totales`} />
        <Kpi icon={Package} label="Órdenes abiertas" value={orders.open} accent="text-amber-500" sub="en curso" />
        <Kpi icon={AlertTriangle} label="Disputas abiertas" value={orders.disputesOpen} accent={orders.disputesOpen > 0 ? "text-rose-500" : "text-zinc-900 dark:text-zinc-100"} sub={`${orders.cancelled} canceladas · ${orders.expired} expiradas`} />
        <Kpi icon={Gauge} label="Ticket promedio" value={usd(averages.avgTicketUsd)} sub="USD por orden" />
      </div>

      {/* ── GMV ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={DollarSign} label="GMV ARS" value={`$ ${formatMoney(gmv.ars)}`} sub="mercado local (completado)" />
        <Kpi icon={Coins} label="GMV total USD" value={usd(gmv.usd)} accent="text-[#F26722]" sub="productos, sin envío" />
        <Kpi icon={Coins} label="GMV crypto" value={usd(gmv.usdCrypto)} sub="pago en USDT" />
        <Kpi icon={Coins} label="GMV transferencia" value={usd(gmv.usdTransfer)} sub="pago bancario" />
      </div>

      {/* ── GANANCIAS + MÉTRICAS DE MARKETING ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Ganancia de la plataforma (USDT)">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">Comisión bruta (3%)</span>
              <span className="text-sm font-black">{usd(revenue.feeGrossUsd)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">− Reintegro cashback (2.5%)</span>
              <span className="text-sm font-bold text-rose-500">− {usd(revenue.cashbackUsd)}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-sm font-black uppercase tracking-wide">Ganancia neta</span>
              <span className="text-lg font-black italic text-emerald-500">{usd(revenue.feeNetUsd)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px] text-zinc-400">
                Reward de referidos pagado a referidos (lo cubre el vendedor, no es costo propio)
              </span>
              <span className="text-[11px] text-zinc-400 whitespace-nowrap ml-2">{usd(revenue.referralFeeUsd)}</span>
            </div>
            <p className="text-[11px] text-zinc-400 pt-1">
              Cashback acumulado pendiente de uso en wallets de compradores: {usd(users.cashbackBalanceUsd)}
            </p>
          </div>
        </Card>

        <Card title="Usuarios y actividad">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-black italic">{users.total}</p>
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">Usuarios totales</p>
            </div>
            <div>
              <p className="text-2xl font-black italic">{users.sellers}</p>
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">Vendedores activos</p>
            </div>
            <div>
              <p className="text-2xl font-black italic text-[#F26722]">{users.newLast30d}</p>
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">Nuevos (30 días)</p>
            </div>
            <div>
              <p className="text-2xl font-black italic">{averages.completionRate}%</p>
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">Tasa de conversión</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── PUBLICACIONES Y VISITAS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Package} label="Publicaciones" value={products.total} sub={`${products.active} activas · ${products.outOfStock} sin stock`} />
        <Kpi icon={Eye} label="Visualizaciones" value={formatMoney(products.views)} sub="vistas totales de productos" />
        <Kpi icon={TrendingUp} label="Unidades vendidas" value={formatMoney(products.sold)} sub="acumulado histórico" />
        <Kpi icon={Users} label="Usuarios restringidos" value={users.restricted} accent={users.restricted > 0 ? "text-rose-500" : "text-zinc-900 dark:text-zinc-100"} sub="flag anti-abuso" />
      </div>

      {/* ── TOPS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top vendedores (por GMV)">
          {topSellers.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin datos aún.</p>
          ) : (
            <ul className="space-y-3">
              {topSellers.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black text-zinc-300 w-4">{i + 1}</span>
                    <span className="truncate font-bold">{s.name}</span>
                  </span>
                  <span className="text-right whitespace-nowrap">
                    <span className="font-black">{usd(s.gmvUsd)}</span>
                    <span className="text-xs text-zinc-400 ml-2">{s.orders} órdenes</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top categorías (por unidades)">
          {topCategories.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin datos aún.</p>
          ) : (
            <ul className="space-y-3">
              {topCategories.map((c, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black text-zinc-300 w-4">{i + 1}</span>
                    <span className="truncate font-bold">{c.category}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="font-black">{c.units} u.</span>
                    <span className="text-xs text-zinc-400 ml-2">{usd(c.gmvUsd)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Productos más vistos">
          {topProducts.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin datos aún.</p>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black text-zinc-300 w-4">{i + 1}</span>
                    <span className="truncate font-bold">{p.name}</span>
                  </span>
                  <span className="whitespace-nowrap text-zinc-500">
                    <Eye size={12} className="inline mr-1" />
                    {formatMoney(p.views)}
                    <span className="text-xs ml-2">{p.sold} vendidos</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Órdenes por método de pago">
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin datos aún.</p>
          ) : (
            <ul className="space-y-3">
              {paymentMethods.map((m, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="font-bold">{methodLabel(m.method)}</span>
                  <span className="whitespace-nowrap">
                    <span className="font-black">{usd(m.gmvUsd)}</span>
                    <span className="text-xs text-zinc-400 ml-2">{m.count} órdenes</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminStats;
