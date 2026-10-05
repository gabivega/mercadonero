import React from "react";

export default function LoadingSpinner({ size = "md", text = "Cargando...", fullScreen = false }) {
  // ⚠️ Tailwind NO tiene `border-3` por defecto (solo border, 2, 4, 8).
  // Usamos `border-[3px]` (arbitrary value) para el tamaño md, que sí compila.
  const sizeClasses = {
    sm: "w-5 h-5 border-2",
    md: "w-10 h-10 border-[3px]",
    lg: "w-16 h-16 border-4",
    xl: "w-24 h-24 border-4",
  };

  const spinnerSize = sizeClasses[size] || sizeClasses.md;

  // Tamaño (ancho/alto) separado del grosor de borde, para dibujar el "track"
  // de fondo con las mismas dimensiones sin repetir el grosor de borde.
  const sizeOnly = {
    sm: "w-5 h-5",
    md: "w-10 h-10",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
  };
  const trackSize = sizeOnly[size] || sizeOnly.md;

  // Estilo inline de respaldo para asegurar el giro al 100% si falla la clase de Tailwind
  const spinAnimationStyle = {
    animation: "nero-spin 0.8s linear infinite",
  };

  const spinnerElement = (
    <div className="relative flex items-center justify-center">
      {/* Estilo CSS inyectado dinámicamente para que no dependa de archivos externos */}
      <style>{`
        @keyframes nero-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      {/* Círculo de fondo sutil (Track) */}
      <div className={`${trackSize} border-2 border-gray-200/60 dark:border-gray-800/60 rounded-full absolute`} />

      {/* Círculo giratorio de color (Glow) */}
      <div 
        style={spinAnimationStyle}
        className={`${spinnerSize} border-transparent border-t-[#3483fa] border-r-[#3483fa]/30 rounded-full`} 
      />
    </div>
  );

  if (fullScreen) {
    // z-index por debajo del container de SweetAlert2 (1060) para que el modal
    // de Swal SIEMPRE quede por encima del overlay de carga y no quede tapado.
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/70 dark:bg-black/70 backdrop-blur-md transition-all duration-300">
        <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-800/50">
          {spinnerElement}
          {text && (
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide animate-pulse">
              {text}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 ">
      {spinnerElement}
      {text && size !== "sm" && (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{text}</p>
      )}
    </div>
  );
}

export function InlineLoadingSpinner({ size = "sm", text = "" }) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-5 h-5 border-2",
    lg: "w-6 h-6 border-2",
  };

  const spinnerSize = sizeClasses[size] || sizeClasses.sm;

  return (
    <div className="inline-flex items-center gap-2 vertical-align-middle">
      <style>{`
        @keyframes nero-spin-inline {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div 
        style={{ animation: "nero-spin-inline 0.7s linear infinite" }}
        className={`${spinnerSize} border-gray-200 dark:border-gray-700 border-t-[#3483fa] rounded-full`} 
      />
      {text && <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{text}</span>}
    </div>
  );
}
