import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  User, Wallet, Bell, ShoppingBag, History, 
  FileText, Tag, LogOut, LayoutDashboard,
  ChevronLeft, ChevronRight, Menu, X 
} from 'lucide-react';

const Sidebar = ({ handleLogout }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { name: 'Perfil', icon: <User size={20}/>, path: '/perfil' },
    { name: 'Billetera', icon: <Wallet size={20}/>, path: '/billetera' },
    { name: 'Notificaciones', icon: <Bell size={20}/>, path: '/notificaciones' },
    { name: 'Compras', icon: <ShoppingBag size={20}/>, path: '/compras' },
    // { name: 'Historial', icon: <History size={20}/>, path: '/historial' },
    { name: 'Posts', icon: <FileText size={20}/>, path: '/posts' },
    { name: 'Vender', icon: <Tag size={20}/>, path: '/vender' },
    { name: 'Mis Publicaciones', icon: <LayoutDashboard size={20}/>, path: '/publicaciones' },
    // { name: 'Mis Ordenes', icon: <LayoutDashboard size={20}/>, path: '/mis-ordenes' },
  ];

  return (
    <>
      {/* Mobile Menu Button - Solo visible en mobile */}
      <div className="lg:hidden fixed top-20 left-4 z-40">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-3 bg-white dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <Menu size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-50 lg:hidden ${
        isMobileMenuOpen ? 'block' : 'hidden'
      }`}>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
        
        {/* Mobile Menu Panel */}
        <div className="fixed left-0 top-0 h-full w-72 bg-white dark:bg-[#252525] shadow-xl transform transition-transform duration-300 ease-in-out">
          {/* Mobile Menu Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 mt-16">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Menú</h2>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          
          {/* Mobile Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333]'
                  }`
                }
              >
                {item.icon}
                <span className="font-medium">{item.name}</span>
              </NavLink>
            ))}
          </nav>
          
          {/* Mobile Logout Button */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-4">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 w-full px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
            >
              <LogOut size={20} />
              <span className="font-medium">Salir</span>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar - Solo visible en desktop */}
      <aside 
        className={`hidden lg:flex relative h-[calc(100vh-80px)] sticky top-20 bg-white dark:bg-[#252525] border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Botón Toggle Flotante */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 bg-blue-600 text-white rounded-full p-1 shadow-lg border-2 border-white dark:border-[#252525] hover:scale-110 transition-transform z-50"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Navegación Desktop */}
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-x-hidden overflow-hidden">
          {menuItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              title={isCollapsed ? item.name : ""} // Tooltip cuando está comprimido
              className={({ isActive }) =>
                `flex items-center rounded-xl transition-all duration-200 ${
                  isCollapsed ? 'justify-center px-0 py-3' : 'px-4 py-3 space-x-3'
                } ${
                  isActive 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333]'
                }`
              }
            >
              <div className="flex-shrink-0">
                {item.icon}
              </div>
              
              {/* El texto desaparece con una transición de opacidad */}
              <span className={`font-medium whitespace-nowrap transition-opacity duration-300 ${
                isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}>
                {item.name}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Botón Salir Desktop */}
        <button
          onClick={handleLogout}
          className={`flex items-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all border-t border-gray-200 dark:border-gray-800 ${
            isCollapsed ? 'justify-center px-0 py-8' : 'px-8 py-6 space-x-3'
          }`}
        >
          <LogOut size={20} />
          <span className={`font-medium transition-opacity duration-300 ${
            isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
          }`}>
            Salir
          </span>
        </button>
      </aside>
    </>
  );
};

export default Sidebar;