import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import Header from "./components/Header";
import Home from "./pages/Home";
import Footer from "./components/Footer";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PostDetail from "./pages/PostDetail";
import ProductDetail from "./pages/ProductDetail";
import SearchResults from "./pages/SearchResults";
import SocialMedia from "./pages/SocialMedia";
import CategoryResults from "./pages/CategoryResults";
import Cart from "./pages/Cart";
import MyProducts from "./pages/dashboard/MyProducts";
import WalletPage from "./pages/dashboard/WalletPage";
import Notifications from "./pages/dashboard/Notifications";
import Purchases from "./pages/dashboard/Purchases";
import SellProduct from "./pages/dashboard/SellProduct";
import Profile from "./pages/dashboard/Profile";
import DashboardLayout from "./components/DashboardLayout";
import History from "./pages/dashboard/History";
import Posts from "./pages/dashboard/Posts";
import NotFound from "./pages/NotFound";
import CreateProduct from "./pages/dashboard/CreateProduct";
import SellerDashboard from "./pages/dashboard/SellerDashboard";
import ShopPage from "./pages/ShopPage";
import ScrollToTop from "./components/ScrollToTop";
import Checkout from "./pages/Checkout";
import OrderDetail from "./pages/dashboard/OrderDetail";
import TermsAndConditions from "./pages/TermsAndConditions";
import LoginPage from "./pages/LoginPage";
import MyOrders from "./pages/dashboard/MyOrders";
import AdminDashboard from "./pages/AdminDashboard";
import Referrals from "./pages/dashboard/Referrals";
import Offers from "./pages/Offers";
import { usePrivySpanish } from "./Utils/privyTranslate";
import HelpSeller from "./pages/HelpSeller";
import HelpBuyer from "./pages/HelpBuyer";
import DisclaimerBanner from "./components/DisclaimerBanner";

export default function App() {
  const theme = useSelector((s) => s.theme.mode);
  usePrivySpanish();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 dark:bg-[#1A1A1A] text-gray-900 dark:text-gray-100 transition-colors">
        <ScrollToTop />
        <Header />
        <main className="w-full min-h-screen px-2">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Home />} />
            <Route path="/post/:id" element={<PostDetail />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/social" element={<SocialMedia />} />
            <Route path="/c/:categorySlug" element={<CategoryResults />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/shop/:username" element={<ShopPage />} />
            <Route path="/checkout/:sellerId" element={<Checkout />} />
            <Route path="/ofertas" element={<Offers />} />
            <Route path="/vender" element={<CreateProduct />} />
            <Route path="/ayuda/vender" element={<HelpSeller />} />
            <Route path="/ayuda/comprar" element={<HelpBuyer />} />
            <Route element={<DashboardLayout />}>
              <Route path="perfil" element={<Profile />} />
              <Route path="billetera" element={<WalletPage />} />
              <Route path="notificaciones" element={<Notifications />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="order/:id" element={<OrderDetail />} />
              <Route path="publicaciones" element={<SellerDashboard />} />
              <Route path="historial" element={<History />} />
              <Route path="posts" element={<Posts />} />
              <Route path="mis-ordenes" element={<MyOrders />} />
              <Route path="referidos" element={<Referrals />} />
              {/* Agrega historial y posts de la misma forma */}
            </Route>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/terminos-y-condiciones" element={<TermsAndConditions />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <DisclaimerBanner />
        <Footer />
      </div>
    </BrowserRouter>
  );
}
