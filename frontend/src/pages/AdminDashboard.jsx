import React, { useState } from "react";
import {
  LayoutDashboard,
  Package,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import AdminOrdersTable from "../components/AdminOrdersTable";
import { usePrivy } from "@privy-io/react-auth";
import { useUserStore } from "../store/useUserStore";

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("orders");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user, authenticated, ready } = usePrivy();
  const { isAdmin, dbUser } = useUserStore(); // Usamos el estado de Zustand
  const ADMIN_ID = import.meta.env.VITE_ADMIN_PRIVY_ID;

  // LOGS DE DEPURACIÓN
  // console.log(
  //   "PRIVY -> Ready:",
  //   ready,
  //   "Auth:",
  //   authenticated,
  //   "UserID:",
  //   user?.id,
  // );
  // console.log("ZUSTAND -> isAdmin:", isAdmin, "dbUser:", !!dbUser);
  // console.log("isAdmin", isAdmin);

  const menuItems = [
    { id: "stats", label: "Estadísticas", icon: LayoutDashboard },
    { id: "orders", label: "Gestión de Órdenes", icon: Package },
    { id: "sellers", label: "Vendedores", icon: Users },
    { id: "escrow", label: "Smart Contract", icon: ShieldCheck },
    { id: "settings", label: "Configuración", icon: Settings },
  ];

  // 1. MIENTRAS CARGA: No renderices nada que tome decisiones
  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#F26722]"></div>
      </div>
    );
  }

  // 2. LA CLAVE: Si Privy dice que estás autenticado y el ID coincide, 
  // entrás, independientemente de lo que diga Zustand en ese microsegundo.
  const isActuallyAdmin = authenticated && user?.id === ADMIN_ID;

  // 3. VALIDACIÓN FINAL
  // Si ya está ready y NO es el admin por ID de Privy, fuera.
  if (!isActuallyAdmin) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <h1 className="text-xl font-black uppercase italic text-white">
          403 | Acceso Denegado
        </h1>
      </div>
    );
  }
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
      {/* SIDEBAR */}
      <aside
        className={`${isSidebarOpen ? "w-64" : "w-20"} bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 flex flex-col`}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#F26722] rounded-lg flex-shrink-0" />
          {isSidebarOpen && (
            <span className="font-black italic tracking-tighter text-xl">
              NERO <span className="text-[#F26722]">ADMIN</span>
            </span>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                activeTab === item.id
                  ? "bg-[#F26722] text-white shadow-lg shadow-[#F26722]/20"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
              }`}
            >
              <item.icon size={20} />
              {isSidebarOpen && (
                <span className="font-bold text-sm">{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
          <button className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all">
            <LogOut size={20} />
            {isSidebarOpen && <span className="font-bold text-sm">Salir</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black uppercase italic tracking-tight">
              {menuItems.find((i) => i.id === activeTab)?.label}
            </h1>
            <p className="text-zinc-500 text-sm">
              Panel de control de Mercado Nero
            </p>
          </div>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === "orders" && <AdminOrdersTable />}
          {activeTab !== "orders" && (
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2.5rem]">
              <p className="text-zinc-400 font-medium italic">
                Sección en desarrollo...
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminDashboard;
