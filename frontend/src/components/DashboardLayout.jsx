// DashboardLayout.jsx
import { Outlet, Navigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import Sidebar from './Sidebar.jsx';

const DashboardLayout = ({ children }) => { // <--- Agregamos children
  const { authenticated, ready, logout } = usePrivy();

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#1A1A1A]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // IMPORTANTE: Quitamos el <Navigate /> de aquí si queremos 
  // que CreateProduct controle su propia lógica de login.
  // Si no, CreateProduct nunca se verá si no hay login.
  if (!authenticated && !children) { 
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#1A1A1A]">
      <Sidebar handleLogout={logout} />
      <main className="flex-1 p-8 transition-all">
        <div className="max-w-6xl mx-auto">
          {/* Si pasamos hijos manualmente (CreateProduct), los muestra. 
              Si no, muestra lo que venga por el Router (Perfil, etc) */}
          {children ? children : <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;