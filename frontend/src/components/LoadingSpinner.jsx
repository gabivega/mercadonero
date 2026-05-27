import React from "react";

export default function LoadingSpinner({ size = "md", text = "Cargando...", fullScreen = false }) {
  const sizeClasses = {
    sm: "w-5 h-5 border-2",
    md: "w-10 h-10 border-3",
    lg: "w-16 h-16 border-4",
    xl: "w-24 h-24 border-4",
  };

  const spinnerSize = sizeClasses[size] || sizeClasses.md;

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
      <div className={`${spinnerSize.split(' ')[0]} ${spinnerSize.split(' ')[1]} ${spinnerSize.split(' ')[2]} border-gray-200/60 dark:border-gray-800/60 rounded-full absolute`} />
      
      {/* Círculo giratorio de color (Glow) */}
      <div 
        style={spinAnimationStyle}
        className={`${spinnerSize} border-transparent border-t-[#3483fa] border-r-[#3483fa]/30 rounded-full`} 
      />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 dark:bg-black/70 backdrop-blur-md transition-all duration-300">
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
    <div className="flex flex-col items-center justify-center gap-2 py-4">
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