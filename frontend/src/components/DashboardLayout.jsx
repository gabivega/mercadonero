import { Outlet, Navigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import Sidebar from './Sidebar.jsx';

const DashboardLayout = () => {
  const { authenticated, ready, logout } = usePrivy();

  // 1. Mientras Privy está verificando la sesión, mostramos un estado de carga
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#1A1A1A]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 2. Si no está autenticado, lo mandamos al inicio (Protección de Ruta)
  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#1A1A1A]">
      {/* Sidebar fijo a la izquierda */}
      <Sidebar handleLogout={logout} />

      {/* Contenido dinámico a la derecha */}
      <main className="flex-1 p-8 transition-all">
        {/* El componente Outlet es donde React Router inyectará las páginas del dashboard */}
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;