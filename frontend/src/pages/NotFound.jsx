import React from 'react';
import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
      <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-full mb-6">
        <AlertTriangle size={64} className="text-red-600" />
      </div>
      <h1 className="text-6xl font-black text-gray-900 dark:text-white mb-4">404</h1>
      <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-8">
        ¡Ups! La página que buscas no existe.
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
        Parece que el enlace está roto o la página ha sido movida. 
        Vuelve al inicio para seguir explorando el marketplace.
      </p>
      <Link 
        to="/" 
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105"
      >
        <Home size={20} />
        Volver al Inicio
      </Link>
    </div>
  );
}