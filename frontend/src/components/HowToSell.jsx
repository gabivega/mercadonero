import { useState } from "react";
import { UserPlus, FileText, ShieldCheck, ArrowRight, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function HowToSell({isExpanded = true}) {
const [isOpen, setIsOpen] = useState(isExpanded);
  const navigate = useNavigate();

  // JSON de pasos para modificar fácilmente en el futuro
  const steps = [
    {
      id: 1,
      title: "Registrarse con una cuenta de email",
      detail: "Creá tu cuenta de forma rápida y segura utilizando tu correo electrónico institucional o personal para comenzar a operar.",
      icon: UserPlus,
      iconColor: "text-blue-500 bg-blue-50 dark:bg-blue-950/30",
    },
    {
      id: 2,
      title: "Crear la publicación",
      detail: "Completá el formulario con todos los datos requeridos, imágenes de alta calidad y elegí el método de envío de tu preferencia.",
      icon: FileText,
      iconColor: "text-orange-500 bg-orange-50 dark:bg-orange-950/30",
    },
    {
      id: 3,
      title: "Colocar activo en garantía",
      detail: "Activá el sistema de custodia segura Web3. Tus fondos y productos quedan protegidos bajo contratos inteligentes descentralizados.",
      icon: ShieldCheck,
      iconColor: "text-green-500 bg-green-50 dark:bg-green-950/30",
    },
  ];

  return (
    <section className="w-full py-16 px-4 bg-transparent transition-colors duration-300 border border-gray-200 dark:border-zinc-800 rounded-lg mt-4">
      <div className="max-w-6xl mx-auto">
        
     <div 
  onClick={() => setIsOpen(!isOpen)}
  className="text-center max-w-3xl mx-auto mb-8 cursor-pointer select-none group/title flex flex-col items-center"
>
  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-4 flex items-center gap-3 justify-center">
    Cómo Vender en Mercado Nero
    {/* 🔥 Chevron animado que rota 180 grados si está abierto */}
    <ChevronDown 
      className={`w-6 h-6 text-gray-400 group-hover/title:text-[#F26722] transition-transform duration-300 ${
        isOpen ? "rotate-180 text-[#F26722]" : ""
      }`} 
    />
  </h2>
  <p className="text-sm md:text-base text-gray-600 dark:text-zinc-400 font-medium leading-relaxed">
    Los productos publicados en Mercado Nero cuentan con protección para el comprador. 
    Para servicios, inmuebles y vehículos podés crear un aviso clasificado.
  </p>
</div>

        {/* --- REJILLA DE PASOS (Horizontales en Desktop, Verticales en Mobile) --- */}
        <div 
  className={`transition-all duration-500 ease-in-out overflow-hidden ${
    isOpen 
      ? "max-h-[1000px] opacity-100 mt-4 visible " 
      : "max-h-0 opacity-0 invisible"
  }`}
><div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {steps.map((step) => {
            const IconComponent = step.icon;
            return (
              <div 
                key={step.id}
                className="relative flex flex-col items-center md:items-start p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800/60 shadow-sm hover:shadow-md transition-all duration-300 group"
              >
                {/* Número flotante sutil de fondo */}
                <span className="absolute top-4 right-6 text-5xl font-black text-gray-100 dark:text-zinc-800/40 select-none group-hover:scale-110 transition-transform">
                  0{step.id}
                </span>

                {/* Ícono contenedor */}
                <div className={`p-4 rounded-xl ${step.iconColor} mb-4 flex items-center justify-center`}>
                  <IconComponent className="w-6 h-6 stroke-[2]" />
                </div>

                {/* Título del Paso */}
                <h3 className="text-base font-bold text-gray-800 dark:text-zinc-100 mb-2 text-center md:text-left">
                  {step.title}
                </h3>

                {/* Detalle explicativo */}
                <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed text-center md:text-left">
                  {step.detail}
                </p>
              </div>
            );
          })}
          </div>
        </div>

        {/* --- ENLACE A MÁS INFORMACIÓN --- */}
        <div className="text-center">
          <button
            onClick={() => navigate("/ayuda/vender")}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#F26722] hover:opacity-80 transition-opacity cursor-pointer"
          >
            Más información sobre el proceso
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

      </div>
    </section>
  );
}