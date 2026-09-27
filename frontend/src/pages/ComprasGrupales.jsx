import React, { useEffect, useMemo, useState } from "react";
import { Users, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import PoolCard from "../components/PoolCard";
import { usePools } from "../Utils/usePools";
import { adaptPools } from "../Utils/poolAdapter";

// Helpers locales (antes venían de data/pools)
const getPoolPercent = (pool) =>
  Math.min(100, Math.round((pool.current / pool.goal) * 100));

const getDaysLeft = (pool) => {
  if (!pool.expiresAt) return null;
  const now = new Date();
  const end = new Date(pool.expiresAt);
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

// Estados posibles para el filtro
const STATUS_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "completado", label: "Completados" },
  { value: "expirado", label: "Expirados" },
  { value: "cancelado", label: "Cancelados" },
];

// Criterios de ordenamiento
const SORT_OPTIONS = [
  { value: "mas-lleno", label: "Más lleno primero" },
  { value: "mas-vacio", label: "Más vacío primero" },
  { value: "menor-precio", label: "Menor precio" },
  { value: "mayor-precio", label: "Mayor precio" },
  { value: "expira-pronto", label: "Expiran pronto" },
  { value: "recientes", label: "Más recientes" },
];

export default function ComprasGrupales() {
  const { fetchActivePools } = usePools();
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortBy, setSortBy] = useState("mas-lleno");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchActivePools({ status: "all", limit: 100 }).then((list) => {
      if (alive) {
        setPools(adaptPools(list));
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [fetchActivePools]);

  const poolsFiltrados = useMemo(() => {
    let list = pools.filter(
      (p) => statusFilter === "todos" || p.status === statusFilter,
    );

    const sorted = [...list];
    switch (sortBy) {
      case "mas-lleno":
        sorted.sort((a, b) => getPoolPercent(b) - getPoolPercent(a));
        break;
      case "mas-vacio":
        sorted.sort((a, b) => getPoolPercent(a) - getPoolPercent(b));
        break;
      case "menor-precio":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "mayor-precio":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "expira-pronto": {
        // Los activos primero, luego los que expiran antes; los vencidos al final
        sorted.sort((a, b) => {
          const da = getDaysLeft(a) ?? 9999;
          const db = getDaysLeft(b) ?? 9999;
          const aVencido = da < 0 ? 1 : 0;
          const bVencido = db < 0 ? 1 : 0;
          if (aVencido !== bVencido) return aVencido - bVencido;
          return da - db;
        });
        break;
      }
      case "recientes":
        // Ordenar por createdAt descendente si está disponible; si no, deja.
        sorted.sort(
          (a, b) =>
            new Date(b._raw?.createdAt || 0) - new Date(a._raw?.createdAt || 0),
        );
        break;
      default:
        break;
    }
    return sorted;
  }, [pools, statusFilter, sortBy]);

  const activos = pools.filter((p) => p.status === "activo").length;

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6 bg-white dark:bg-[#121212] transition-colors min-h-screen">
      {/* Encabezado */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-r from-[#3483fa] to-[#5fa0ff] p-3 rounded-2xl shadow-lg shadow-[#3483fa]/30">
            <Users size={24} className="text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black dark:text-white uppercase tracking-tighter">
            Compras Grupales
          </h1>
        </div>
        <p className="text-gray-500 dark:text-zinc-500 text-sm font-medium">
          Sumate a un pool, alcancen el objetivo entre todos y compren a mejor
          precio. {activos} pools activos.
        </p>
      </div>

      {/* Banner explicativo */}
      <div className="bg-gradient-to-r from-[#3483fa] to-[#5fa0ff] rounded-3xl p-6 md:p-8 mb-8 shadow-lg shadow-[#3483fa]/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-white">
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mb-2">
              Precios directo de fábrica
            </h2>
            <p className="text-sm md:text-base font-medium opacity-90">
              Cuantas más personas se suman al pool, mejor el precio final.
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-6 py-3">
            <span className="text-white font-black text-lg md:text-xl">
              {pools.length} pools disponibles
            </span>
          </div>
        </div>
      </div>

      {/* Filtros y ordenamiento */}
      <div className="mb-6 flex flex-col gap-4">
        {/* Filtro por estado */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
            <SlidersHorizontal size={14} /> Estado
          </span>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  statusFilter === f.value
                    ? "bg-[#3483fa] text-white"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ordenamiento */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
            <ArrowUpDown size={14} /> Ordenar por
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 border border-transparent focus:outline-none focus:border-[#3483fa] cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">
            {poolsFiltrados.length}{" "}
            {poolsFiltrados.length === 1 ? "resultado" : "resultados"}
          </span>
        </div>
      </div>

      {/* Grid de pools */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500 dark:text-zinc-500 text-sm font-medium">
            Cargando pools...
          </p>
        </div>
      ) : poolsFiltrados.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {poolsFiltrados.map((pool) => (
            <PoolCard key={pool.id || pool._raw?._id} pool={pool} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="bg-gray-100 dark:bg-zinc-800 rounded-full p-6 mb-4">
            <Users size={40} className="text-gray-400 dark:text-zinc-600" />
          </div>
          <h3 className="text-xl font-bold dark:text-white mb-2">
            No hay pools con ese estado
          </h3>
          <p className="text-gray-500 dark:text-zinc-500 text-sm font-medium">
            Probá con otro filtro de estado.
          </p>
        </div>
      )}
    </div>
  );
}
