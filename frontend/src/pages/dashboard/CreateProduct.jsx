import { useState } from "react";

import Swal from "sweetalert2";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ImportSection } from "../../components/ImportProductsSection.jsx";
import { ListingTypeSelector } from "../../components/ListingTypeSelector.jsx";
import ProductForm from "../../components/ProductForm.jsx";
import VehicleForm from "../../components/VehicleForm.jsx";
import PropertyForm from "../../components/PropertyForm.jsx";
import ServiceForm from "../../components/ServiceForm.jsx";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import NeroLogin from "../../components/NeroLogin.jsx";
import SellerOnboarding from "../../components/SellerOnboarding.jsx";
import { useUserStore } from "../../store/useUserStore";
import { useSyncUser } from "../../Utils/userSync";


import {
  Package,
  Image as ImageIcon,
  Plus,
  X,
  ArrowRight,
    Truck,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import HowToSell from "../../components/HowToSell.jsx";

export default function CreateProduct() {
  const [formType, setFormType] = useState(null);
  const { ready, getAccessToken, user, authenticated, login } = usePrivy();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
    // console.log("User:", user);
  // console.log("isAuthenticated:", authenticated);

  // ── ONBOARDING VENDEDOR ──
  const { dbUser, setDbUser } = useUserStore();
  const { syncUser } = useSyncUser(setDbUser);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);
  // ¿El usuario ya completó el onboarding del vendedor (tienda activa)?
  const onboardingComplete = Boolean(dbUser?.shop?.active);
  // Prefilleo con datos que ya tengamos del perfil
  const onboardingPrefill = {
    firstName: dbUser?.firstName || "",
    lastName: dbUser?.lastName || "",
    dni: dbUser?.dni || "",
    phone: dbUser?.phone || "",
    shopName: dbUser?.shop?.name || "",
    taxCondition: dbUser?.shop?.taxCondition || "",
  };

  // Al terminar el onboarding, actualizamos el usuario y reintentamos publicar
    const handleOnboardingComplete = async (draft) => {
    // 1. Cerramos el modal
    setIsOnboardingOpen(false);
    // 2. Re-sincronizamos el usuario (trae shop.active = true al store)
    await syncUser();
    // 3. Reintentamos la publicación con el draft que venía.
    //    force=true: ya completó el onboarding, no re-bloquear.
    if (draft) await handleSubmit(draft, true);
  };

  // Función unificada para errores
  const showError = (msg) => {
    Swal.fire({
      title: "¡Ups!",
      text: msg,
      icon: "error",
      background: "#1A1A1A",
      color: "#ffffff",
      confirmButtonColor: "#2563eb",
      customClass: { popup: "rounded-3xl border border-gray-800" },
    });
  };

    const handleSubmit = async (productData, force = false) => {
      // ── BLOQUEO DE ONBOARDING VENDEDOR ──
      // Solo se exige onboarding vendedor completo para publicaciones de pago
      // (producto con escrow). Los clasificados (vehículos, servicios, inmuebles)
      // no intervienen en el pago y NO piden estos datos en el MVP
      // (eso será para cuentas verificadas premium).
      const isPaidListing = productData.listingType !== "classified";

      if (isPaidListing && !onboardingComplete && !force) {
        // Guardamos el draft para reintentar el submit al terminar el onboarding
        // (punto B: no se pierde el esfuerzo del vendedor).
        setPendingProduct(productData);
        setIsOnboardingOpen(true);
        return;
      }

    // 1. Validación de imágenes (Universal)
    if (!productData.images || productData.images.length === 0) {
      return Swal.fire({
        title: "¡Faltan fotos!",
        text: "Debes cargar al menos una imagen para que los compradores vean tu publicación.",
        icon: "warning",
        background: "#1A1A1A",
        color: "#ffffff",
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Entendido",
        customClass: {
          popup: "rounded-3xl border border-gray-800 shadow-2xl animate__animated animate__fadeInUp",
        },
      });
    }

    setIsSubmitting(true);

    try {
      // 2. Obtenemos el token de Privy
      const token = await getAccessToken();

      // 3. Preparamos el Body dinámico
      const body = {
        ...productData,
        // Aseguramos que 'sale' no rompa si no viene en el form (ej: vehículos)
        sale: productData.sale?.price > 0 
          ? { active: true, price: productData.sale.price }
          : { active: false, price: 0 },
        
        // Si el form de vehículos no mandó shipping, enviamos uno vacío o null
        shipping: productData.shipping || { isDigital: false, free: false }
      };

      // 4. Envío con Axios
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/product/create`,
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (data.success) {
        Swal.fire({
          title: "¡Publicación Exitosa!",
          text: "Tu artículo ya está disponible en Mercado Nero.",
          icon: "success",
          background: "#1A1A1A",
          color: "#ffffff",
          confirmButtonColor: "#2563eb",
          confirmButtonText: "Ir al Panel",
          customClass: {
            popup: "rounded-3xl border border-gray-800",
          },
        }).then((result) => {
          if (result.isConfirmed) {
            navigate("/publicaciones");
          }
        });
      } else {
        throw new Error(data.message || "Error al publicar");
      }
        } catch (error) {
      console.error("Error en la publicación:", error);
      const data = error.response?.data;
      const errorMsg = data?.message || error.message;

      // Si el backend bloquea la publicación porque el vendedor no tiene wallet
      // Web3, lo invitamos a crear/activar su billetera en "Mi Billetera".
      if (data?.blocked === "wallet") {
        Swal.fire({
          title: "Necesitás una wallet para vender",
          text: errorMsg,
          icon: "warning",
          background: "#1A1A1A",
          color: "#ffffff",
          confirmButtonColor: "#2563eb",
          confirmButtonText: "Ir a Mi Billetera",
          customClass: { popup: "rounded-3xl border border-gray-800" },
                }).then((result) => {
          if (result.isConfirmed) {
            navigate("/billetera");
          }
        });
        setIsSubmitting(false);
        return;
      }

      showError("Error: " + errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready) return null;

  // Si no está autenticado, mostramos llamada a la acción
  if (!authenticated || !user) {
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
            // onClick={()=> setIsLoginOpen(true)}
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
        {/* <NeroLogin 
          isOpen={isLoginOpen} 
          onClose={() => setIsLoginOpen(false)} 
           onLoginSuccess={(user) => {
        // Opcional: Aquí podrías navegar a otra página si quieres
        // navigate('/dashboard');
      }}
        /> */}
        <HowToSell />
      </div>
    );
  }

    // Si está autenticado y no hay formType, mostramos el selector
  if (!formType) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* 🔒 AVISO: SIN WALLET NO PUEDE PUBLICAR PRODUCTOS DE PAGO */}
          {dbUser && !dbUser.walletAddress && (
            <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
              <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
                  Vinculá una wallet Web3 antes de publicar
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                  Para publicar <b>Productos</b> y recibir los pagos (USDT) necesitás una billetera vinculada (la garantía se gestiona on-chain). Los clasificados (vehículos, inmuebles, servicios) no lo requieren. Activá tu billetera desde{" "}
                  <span
                    className="underline font-semibold cursor-pointer hover:text-amber-900 dark:hover:text-amber-200"
                    onClick={() => navigate("/billetera")}
                  >
                    Mi Billetera
                  </span>{" "}
                  antes de cargar la publicación para no perder tu trabajo.
                </p>
              </div>
            </div>
          )}
          <ListingTypeSelector onSelect={setFormType} />
        </div>
      </DashboardLayout>
    );
  }

  // Si está autenticado y hay formType, mostramos el formulario
    return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-10">

        {/* 🔒 AVISO: SIN WALLET NO SE PUEDE PUBLICAR PRODUCTOS DE PAGO */}
        {dbUser && !dbUser.walletAddress && (
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
            <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
                Vinculá una wallet Web3 antes de publicar
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                Para publicar productos y recibir los pagos (USDT) necesitás una billetera vinculada, ya que la garantía se gestiona de forma segura on-chain. Activá tu billetera desde{" "}
                <span
                  className="underline font-semibold cursor-pointer hover:text-amber-900 dark:hover:text-amber-200"
                  onClick={() => navigate("/billetera")}
                >
                  Mi Billetera
                </span>{" "}
                antes de cargar la publicación para no perder tu trabajo.
              </p>
            </div>
          </div>
        )}

        {/* HEADER */}
        <header>
          <h2 className="text-3xl font-black dark:text-white flex items-center gap-3">
            <Plus className="text-blue-600" size={32} /> Crear Publicación
          </h2>
          <div onClick={() => setFormType(null)} className="flex items-center gap-2 mt-4 cursor-pointer">
            <ArrowLeft className="text-blue-600" size={20} />
            <p className="cursor-pointer text-blue-600 text-md">Volver</p>
          </div>
        </header>

        {formType === "product" && (
          <ProductForm 
            handleSubmit={handleSubmit} 
            isSubmitting={isSubmitting} 
          />
        )}
        {formType === "vehicle" && (
          <VehicleForm 
            handleSubmit={handleSubmit} 
            isSubmitting={isSubmitting} 
          />
        )}
        {formType === "property" && (
          <PropertyForm 
            handleSubmit={handleSubmit} 
            isSubmitting={isSubmitting} 
          />
        )}
        {formType === "service" && (
          <ServiceForm 
            handleSubmit={handleSubmit} 
            isSubmitting={isSubmitting} 
          />
                )}
        <ImportSection />
      </div>

      {/* Modal de Onboarding Vendedor */}
      <SellerOnboarding
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleOnboardingComplete}
        draft={pendingProduct}
        prefill={onboardingPrefill}
      />
    </DashboardLayout>
  );
}

