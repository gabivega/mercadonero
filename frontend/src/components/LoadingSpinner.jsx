import React from "react";

export default function LoadingSpinner({ size = "md", text = "Cargando...", fullScreen = false }) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const spinnerSize = sizeClasses[size] || sizeClasses.md;

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 dark:bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className={`${spinnerSize} border-4 border-gray-200 dark:border-gray-700 border-t-[#3483fa] rounded-full animate-spin`} />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <div className={`${spinnerSize} border-4 border-gray-200 dark:border-gray-700 border-t-[#3483fa] rounded-full animate-spin`} />
    </div>
  );
}

export function InlineLoadingSpinner({ size = "sm", text = "" }) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const spinnerSize = sizeClasses[size] || sizeClasses.sm;

  return (
    <div className="flex items-center gap-2">
      <div className={`${spinnerSize} border-2 border-gray-200 dark:border-gray-700 border-t-[#3483fa] rounded-full animate-spin`} />
      {text && <span className="text-sm text-gray-600 dark:text-gray-400">{text}</span>}
    </div>
  );
}
