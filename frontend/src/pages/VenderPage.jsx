import { usePrivy } from '@privy-io/react-auth';
import { useNavigate, useEffect } from 'react-router-dom';
import { Package, ArrowRight } from 'lucide-react';

export default function VenderPage() {
  const { authenticated, ready, login } = usePrivy();
  const navigate = useNavigate();

  // 1. Mientras Privy está verificando la sesión, mostramos un estado de carga
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#1A1A1A]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 2. Si está autenticado, redirigimos inmediatamente
  useEffect(() => {
    if (authenticated) {
      navigate('/vender', { replace: true });
    }
  }, [authenticated, navigate]);

  // 3. Si está autenticado, mostramos loading mientras redirige
  if (authenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#1A1A1A]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 4. Si no está autenticado, mostramos llamada a la acción
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
      <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
        <Package className="w-10 h-10 text-blue-600" />
      </div>
      
      <h2 className="text-3xl font-black uppercase tracking-tighter dark:text-white mb-4">
        ¿Quieres empezar a vender?
      </h2>
      
      <p className="text-zinc-500 dark:text-zinc-400 max-w-md mb-8 text-lg">
        Publica tus productos en Mercado Nero y llega a miles de compradores. 
        Primero debes iniciar sesión para comenzar.
      </p>

      <div className="space-y-4">
        <button
          onClick={login}
          className="group flex items-center gap-3 px-8 py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#F26722]/20"
        >
          Iniciar Sesión
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
        
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          ¿No tienes cuenta? Se crea automáticamente al iniciar sesión
        </p>
      </div>
    </div>
  );
}
