import React from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Store, Truck, Users } from "lucide-react";
import { formatMoney } from "../Utils/currencyFormatter";

// mapa de estados -> estilos visuales
const STATUS_STYLES = {
  activo: {
    label: "Activo",
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    bar: "bg-[#3483fa]",
  },
  completado: {
    label: "Completado",
    dot: "bg-green-500",
    badge:
      "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400",
    bar: "bg-green-500",
  },
  expirado: {
    label: "Expirado",
    dot: "bg-gray-400",
    badge:
      "bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400",
    bar: "bg-gray-400",
  },
  cancelado: {
    label: "Cancelado",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    bar: "bg-red-500",
  },
};

// Sólo se puede sumar mientras el pool esté activo
const JOINABLE = ["activo"];

export default function PoolCard({ pool }) {
  const navigate = useNavigate();
  const {
    id,
    _raw,
    title,
    brand,
    seller,
    location,
    price,
    image,
    current,
    goal,
    status,
    freeShipping,
  } = pool;

  const style = STATUS_STYLES[status] || STATUS_STYLES.activo;
  const percent = Math.min(100, Math.round((current / goal) * 100));
  const canJoin = JOINABLE.includes(status);

  const poolId = id || _raw?._id;

  const handleJoin = (e) => {
    e.stopPropagation();
    // Va al detalle del grupo para unirse (requiere sesión allí).
    if (poolId) navigate(`/pool/${poolId}`);
  };

  const handleCardClick = () => {
    if (poolId) navigate(`/pool/${poolId}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className="group bg-white dark:bg-zinc-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-zinc-700 hover:shadow-xl hover:border-[#3483fa]/30 transition-all flex flex-col cursor-pointer"
    >
      {/* Imagen */}
      <div className="relative bg-white  h-44 overflow-hidden flex-shrink-0">
        <img
          src={image}
          alt={title}
          loading="lazy"
          className="w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-300"
        />

        {/* Estado del pool */}
        <div
          className={`absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${style.badge}`}
        >
          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          {style.label}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">
          {title}
        </h3>

        {/* Marca */}
        <div className="mt-1">
          <span className="text-[0.7rem] font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
            {brand}
          </span>
        </div>

        {/* Vendedor + Localidad */}
        <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Store size={13} className="text-gray-400 dark:text-zinc-500" />
            <span className="truncate">{seller}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="text-gray-400 dark:text-zinc-500" />
            <span className="truncate">{location}</span>
          </span>
        </div>

        {/* Precio + Envío */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            {formatMoney(price)}
          </span>
          {freeShipping && (
            <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-green-600 dark:text-green-400">
              <Truck size={13} /> Envío gratis
            </span>
          )}
        </div>

        {/* Progreso */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-medium mb-1">
            <span className="flex items-center gap-1 text-gray-500 dark:text-zinc-400">
              <Users size={13} /> {current}/{goal} personas
            </span>
            <span className="font-bold text-gray-700 dark:text-zinc-300">
              {percent}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Acción */}
        <div className="mt-4 mt-auto pt-4">
          <button
            onClick={handleJoin}
            disabled={!canJoin}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${
              canJoin
                ? "bg-[#3483fa] text-white hover:bg-[#2968c8]"
                : "bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            {canJoin ? "Sumarme al pool" : "No disponible"}
          </button>
        </div>
      </div>
    </div>
  );
}
