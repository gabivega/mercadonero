import React, { useState } from "react";
import { UserPlus, Search, ShieldCheck, ArrowRight, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function HowToBuy() {
  const navigate = useNavigate();
  // 🔥 Arranca en true para que esté expandido por defecto en el Home
  const [isOpen, setIsOpen] = useState(true); 

  // JSON compacto enfocado en el Comprador
  const steps = [
    {
      id: 1,
      title: "Crear tu cuenta con email",
      detail: "Registrate en segundos para poder hacer el seguimiento de tus pedidos, guardar tus favoritos y chatear con vendedores.",
      icon: UserPlus,
      iconColor: "text-blue-500 bg-blue-50 dark:bg-blue-950/30",
    },
    {
      id: 2,
      title: "Buscar y elegir tu producto",
      detail: "Explorá el catálogo usando los filtros avanzados. Revisá las fotos de alta definición, especificaciones y reputación del vendedor.",
      icon: Search,
      iconColor: "text-orange-500 bg-orange-50 dark:bg-orange-950/30",
    },
    {
      id: 3,
      title: "Pagar con Compra Protegida",
      detail: "Transferís directamente al vendedor. La plataforma mantiene un depósito en garantia del vendedor custodiado por un contrato inteligente. Si tenés algun problema, se te reintegra el dinero.",
      icon: ShieldCheck,
      iconColor: "text-green-500 bg-green-50 dark:bg-green-950/30",
    },
  ];

  return (
    <section className="w-full py-10 px-4 bg-white dark:bg-zinc-950 border-b border-gray-100 dark:border-zinc-900 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        
        {/* --- ENCABEZADO CLICKEABLE (TOGGLE) --- */}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="text-center max-w-3xl mx-auto mb-6 cursor-pointer select-none group/title flex flex-col items-center"
        >
          <h2 className="text-xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-2 flex items-center gap-2 justify-center">
            Cómo comprar en Mercado Nero
            <ChevronDown 
              className={`w-5 h-5 text-gray-400 group-hover/title:text-[#F26722] transition-transform duration-300 ${
                isOpen ? "rotate-180 text-[#F26722]" : ""
              }`} 
            />
          </h2>
          <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 font-medium max-w-2xl">
            Cada transacción en el marketplace cuenta con nuestro sistema de custodia. Para publicaciones de vehículos, inmuebles o servicios, coordinás directo con el anunciante.
          </p>
        </div>

        {/* --- CONTENEDOR DESPLEGABLE ANIMADO --- */}
        <div 
          className={`transition-all duration-500 ease-in-out overflow-hidden ${
            isOpen 
              ? "max-h-[1000px] opacity-100 mt-6 visible" 
              : "max-h-0 opacity-0 invisible"
          }`}
        >
          {/* --- GRID DE 3 COLUMNAS MÁS COMPACTO --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {steps.map((step) => {
              const IconComponent = step.icon;
              return (
                <div 
                  key={step.id}
                  className="relative flex flex-col items-center md:items-start p-5 bg-gray-50/50 dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/40 shadow-sm hover:shadow-md transition-all duration-300 group"
                >
                  {/* Número de fondo sutil */}
                  <span className="absolute top-3 right-5 text-4xl font-black text-gray-200/50 dark:text-zinc-800/30 select-none group-hover:scale-110 transition-transform">
                    0{step.id}
                  </span>

                  {/* Icono más chico para compactar */}
                  <div className={`p-3 rounded-lg ${step.iconColor} mb-3 flex items-center justify-center`}>
                    <IconComponent className="w-5 h-5 stroke-[2]" />
                  </div>

                  {/* Título */}
                  <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100 mb-1.5 text-center md:text-left">
                    {step.title}
                  </h3>

                  {/* Detalle */}
                  <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed text-center md:text-left">
                    {step.detail}
                  </p>
                </div>
              );
            })}
          </div>

          {/* --- ENLACE INFERIOR --- */}
          <div className="text-center">
            <button
              onClick={() => navigate("/ayuda/comprar")}
              className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#F26722] hover:opacity-80 transition-opacity cursor-pointer"
            >
              Guía completa de compra protegida
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}