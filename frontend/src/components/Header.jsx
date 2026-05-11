import React, { useState, useEffect } from "react";
import {
  ShoppingCart,
  Menu,
  X,
  Wallet,
  Heart,
  Bell,
  Moon,
  Sun,
  User,
  Plus,
  Clock,
  List,
  MessageSquare,
  LogOut,
  ShoppingBag,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSelector, useDispatch } from "react-redux";
import { toggleTheme } from "../store/themeSlice";
import SearchSuggestions from "./SearchSuggestions";
import { Link, useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useCartStore } from "../store/useCartStore";
import { useUserStore } from "../store/useUserStore";
import { useSyncUser } from "../Utils/userSync";

// Asset Imports
import darkLogo from "../assets/img/mercado-nero-logo-white.png";
import mobileLogo from "../assets/img/monero-logo-mobile.png";
import whiteLogo from "../assets/img/mercado-nero-logo-full-white-tr.png";
import whiteLogoGray from "../assets/img/mercado-nero-logo-full-white-gray.png";
import blackLogo from "../assets/img/mn-logo-black.png";
import { categories } from "../data/categories";
import NeroLogin from "./NeroLogin";

const NavLink = ({ href, children, mobile = false }) => {
  // Check if it's an internal link (starts with /)
  const isInternal = href.startsWith("/");

  if (isInternal) {
    return (
      <Link
        to={href}
        className={`
          font-medium transition-colors duration-200
          ${
            mobile
              ? "block w-full py-3 text-lg border-b border-gray-100 dark:border-zinc-800 text-gray-900 dark:text-white"
              : "text-sm hover:text-white/80 dark:hover:text-white/80 text-white dark:text-gray-300"
          }
        `}
      >
        {children}
      </Link>
    );
  }

  // External link (fallback)
  return (
    <a
      href={href}
      className={`
        font-medium transition-colors duration-200
        ${
          mobile
            ? "block w-full py-3 text-lg border-b border-gray-100 dark:border-zinc-800 text-gray-900 dark:text-white"
            : "text-sm hover:text-white/80 dark:hover:text-white/80 text-white dark:text-gray-300"
        }
      `}
    >
      {children}
    </a>
  );
};

const IconButton = ({ icon: Icon, onClick, badge = 0, mobile = false }) => (
  <button
    onClick={onClick}
    className={`
      relative p-2 rounded-full hover:bg-white/20 transition-colors
      ${mobile ? "p-3" : ""}
    `}
  >
    <Icon
      className={`w-5 h-5 ${mobile ? "w-6 h-6" : ""} text-white dark:text-gray-300`}
    />
    {badge > 0 && (
      <span className="absolute top-0 right-0 inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-[#FB6002] rounded-full">
        {badge}
      </span>
    )}
  </button>
);

export default function Header() {
  const { dbUser, setDbUser } = useUserStore();
  const theme = useSelector((s) => s.theme.mode);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const totalItems = useCartStore((state) => state.getTotalItems());
  const { login, logout, ready, authenticated, user, getAccessToken } =
    usePrivy();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [areCategoriesExpanded, setAreCategoriesExpanded] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  
  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const { syncUser } = useSyncUser(setDbUser);

  useEffect(() => {
    if (ready && authenticated && user) {
    syncUser();
  }
  }, [ready, authenticated, user, setDbUser, user?.wallet?.address]);


  const handleToggleTheme = () => {
    dispatch(toggleTheme());
  };

  const handleLogin = () => {
    setIsLoginOpen(true);
    // try {
    //   await login();
    // } catch (error) {
    //   console.error("Error al autenticar:", error);
    // }
  };

  const handleLogout = async () => {
    useCartStore.getState().clearCart();
    try {
      await logout();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const handleProfileClick = () => {
    navigate("/perfil");
  };

  const handleMenuClick = (path) => {
    navigate(path);
    setIsUserMenuOpen(false);
  };

  const menuItems = ["Categorias", "Ofertas", "Comunidad", "Vender", "Ayuda"];

if (isLoginOpen) {
  return (    
    <NeroLogin 
      isOpen={isLoginOpen} 
      onClose={() => setIsLoginOpen(false)}
      onLoginSuccess={(user) => {
        // Opcional: Aquí podrías navegar a otra página si quieres
        // navigate('/dashboard');
      }}
    />
  );
}

  return (
    <header className="sticky top-0 z-50 w-full bg-[#FB6002] dark:bg-[#1a1a1a] shadow-sm transition-colors duration-300 dark:border-b border-gray-200 dark:border-zinc-800">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Left: Logo */}
          {/* Mobile Logo (Square) - Visible only on mobile */}
          <Link
            to="/"
            className="flex-shrink-0 flex items-center cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img
              src={mobileLogo}
              alt="Mercado Nero"
              className="h-10 w-auto lg:hidden"
            />

            {/* Desktop Logos */}
            {/* Light Theme Logo - Hidden on mobile, Hidden in dark mode */}
            <img
              src={whiteLogo}
              alt="Mercado Nero"
              className="hidden lg:block dark:hidden h-8 w-auto object-contain"
            />

            {/* Dark Theme Logo - Hidden on mobile, Visible only in dark mode */}
            <img
              src={darkLogo}
              alt="Mercado Nero"
              className="hidden dark:lg:block h-8 w-auto object-contain"
            />
          </Link>

          {/* Center: Search + Nav (Always Visible) */}
          <div className="flex flex-col items-center flex-1 mx-4 md:mx-8 max-w-2xl">
            {/* Search Bar */}
            <SearchSuggestions
              onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
            />

            {/* Navigation Links */}
            <nav className="hidden lg:flex items-center gap-8 mt-3 w-full justify-center">
              <div className="relative group">
                <p className="cursor-pointer" href="#categorias">
                  Categorias
                </p>
                <div className="absolute left-0 top-full w-56 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-gray-100 dark:border-zinc-800 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50">
                  <ul className="py-2">
                    {categories.map((cat) => (
                      <li key={cat.name}>
                        <a
                          href={cat.url}
                          className="block px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          {cat.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {menuItems
                .filter((i) => i !== "Categorias")
                .map((item) => (
                  <Link key={item} to={`${item.toLowerCase()}`}>
                    {item}
                  </Link>
                ))}
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 lg:gap-3">
            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-2">
              {ready && authenticated ? (
                <>
                  <IconButton icon={Heart} onClick={() => {}} />
                  <div
                    className="relative"
                    onMouseEnter={() => setIsUserMenuOpen(true)}
                    onMouseLeave={() => setIsUserMenuOpen(false)}
                  >
                    <button className="relative p-2 rounded-full hover:bg-white/20 transition-colors">
                      {user?.image ? (
                        <img
                          src={user.image}
                          alt="Profile"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {isUserMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-gray-100 dark:border-zinc-800 overflow-hidden"
                        >
                          <div className="py-2">
                            <button
                              onClick={() => handleMenuClick("/perfil")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <User className="w-4 h-4" />
                              Mi perfil
                            </button>
                            <button
                              onClick={() => handleMenuClick("/billetera")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <Wallet className="w-4 h-4" />
                              Billetera
                            </button>
                            <button
                              onClick={() => handleMenuClick("/notificaciones")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <Bell className="w-4 h-4" />
                              Notificaciones
                            </button>
                            <button
                              onClick={() => handleMenuClick("/compras")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              Compras
                            </button>
                            <button
                              onClick={() => handleMenuClick("/historial")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <Clock className="w-4 h-4" />
                              Historial
                            </button>
                            <button
                              onClick={() => handleMenuClick("/posts")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <MessageSquare className="w-4 h-4" />
                              Posts
                            </button>
                            <button
                              onClick={() => handleMenuClick("/vender")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <Plus className="w-4 h-4" />
                              Vender
                            </button>
                            <button
                              onClick={() => handleMenuClick("/publicaciones")}
                              className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <List className="w-4 h-4" />
                              Publicaciones
                            </button>
                            <hr className="my-2 border-gray-100 dark:border-zinc-800" />
                            <button
                              onClick={handleLogout}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-3"
                            >
                              <LogOut className="w-4 h-4" />
                              Salir
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <IconButton
                    icon={ShoppingCart}
                    onClick={() => navigate("/cart")}
                    badge={totalItems}
                  />
                </>
              ) : (
                <>
                  <IconButton
                    icon={ShoppingCart}
                    onClick={() => navigate("/cart")}
                    badge={totalItems}
                  />
                  <button
                    onClick={handleLogin}
                    className="px-4 py-2 text-sm font-medium text-[#FB6002] dark:text-white bg-white dark:bg-[#FB6002] hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Ingresar
                  </button>
                </>
              )}
              {mounted && (
                <IconButton
                  icon={theme === "dark" ? Sun : Moon}
                  onClick={handleToggleTheme}
                />
              )}
            </div>

            {/* Mobile Actions: Cart + Hamburger */}
            <div className="lg:hidden flex items-center gap-2">
              <IconButton
                icon={ShoppingCart}
                onClick={() => navigate("/cart")}
                badge={totalItems}
              />
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 z-[60] lg:hidden backdrop-blur-sm"
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-[85%] max-w-sm bg-white dark:bg-[#1a1a1a] shadow-xl z-[70] lg:hidden flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800">
                <span className="font-bold text-lg text-gray-900 dark:text-white">
                  Menú
                </span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                {/* Mobile Search */}
                <SearchSuggestions
                  onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
                />

                {/* Mobile Nav Links */}
                <nav className="flex flex-col">
                  <div className="relative group">
                    <NavLink href="#categorias" mobile>
                      Categorias
                    </NavLink>
                    <div className="mt-1 ml-2 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-gray-100 dark:border-zinc-800">
                      <ul className="py-2">
                        {/* First 6 categories always visible */}
                        {categories.slice(0, 6).map((cat) => (
                          <li key={cat.name}>
                            <Link
                              to={cat.url}
                              className="block px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {cat.name}
                            </Link>
                          </li>
                        ))}

                        {/* Expand/Collapse button */}
                        {categories.length > 6 && (
                          <li>
                            <button
                              onClick={() =>
                                setAreCategoriesExpanded(!areCategoriesExpanded)
                              }
                              className="w-full px-4 py-2 text-sm text-[#F26722] hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                            >
                              <span>
                                {areCategoriesExpanded
                                  ? "Ver menos"
                                  : "Ver más categorías"}
                              </span>
                              <svg
                                className={`w-4 h-4 transition-transform duration-300 ${areCategoriesExpanded ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                          </li>
                        )}

                        {/* Remaining categories with animation */}
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{
                            height: areCategoriesExpanded ? "auto" : 0,
                            opacity: areCategoriesExpanded ? 1 : 0,
                          }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          {categories.slice(6).map((cat) => (
                            <li key={cat.name}>
                              <Link
                                to={cat.url}
                                className="block px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                {cat.name}
                              </Link>
                            </li>
                          ))}
                        </motion.div>
                      </ul>
                    </div>
                  </div>
                  {menuItems
                    .filter((i) => i !== "Categorias")
                    .map((item) => (
                      <NavLink
                        key={item}
                        href={`#${item.toLowerCase()}`}
                        mobile
                      >
                        {item}
                      </NavLink>
                    ))}
                </nav>

                {/* Mobile Quick Actions */}
                <div className="grid grid-cols-3 gap-4 py-4 border-t border-gray-100 dark:border-zinc-800">
                  {ready && authenticated ? (
                    <>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/perfil")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-blue-600">
                          <User className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Perfil
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/billetera")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                          <Wallet className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Billetera
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/notificaciones")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                          <Bell className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Notif.
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/vender")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-green-600">
                          <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Vender
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/compras")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Compras
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/historial")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                          <Clock className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Historial
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/posts")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                          <FileText className="w-6 h-6" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Posts
                        </span>
                      </div>
                      <div
                        className="flex flex-col items-center gap-2 cursor-pointer"
                        onClick={() => handleMenuClick("/publicaciones")}
                      >
                        <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-green-600">
                          <List className="w-6 h-6" />
                        </div>
                        {/* <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                          <LayoutDashboard className="w-6 h-6" />
                          </div> */}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Publicaciones
                        </span>
                      </div>
                          <div
                            className="flex flex-col items-center gap-2 cursor-pointer"
                            onClick={handleLogout}
                          >
                            <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-green-600">
                              <LogOut className="w-6 h-6" />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Cerrar Sesion
                            </span>
                          </div>
                    </>
                  ) : (
                    <div className="col-span-4 flex justify-center">
                      <button
                        onClick={handleLogin}
                        className="px-6 py-3 text-sm font-medium  bg-nero-500 dark:text-white hover:bg-nero-500 rounded-lg transition-colors w-full max-w-xs"
                      >
                        Ingresar
                      </button>
                    </div>
                  )}
                  <div
                    className="flex flex-col items-center gap-2 cursor-pointer"
                    onClick={handleToggleTheme}
                  >
                    <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-full text-[#FB6002]">
                      {mounted &&
                        (theme === "dark" ? (
                          <Sun className="w-6 h-6" />
                        ) : (
                          <Moon className="w-6 h-6" />
                        ))}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Tema
                    </span>
                  </div>
                </div>

                {/* User Profile Section */}
                {ready && authenticated && (
                  <div className="mt-auto pt-6 border-t border-gray-100 dark:border-zinc-800">
                    <div
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-zinc-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                      onClick={handleProfileClick}
                    >
                      {user?.image ? (
                        <img
                          src={user.image}
                          alt="Profile"
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-[#F26722]/10 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-[#F26722]" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          Mi Perfil
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {user?.email?.address || "Usuario"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
