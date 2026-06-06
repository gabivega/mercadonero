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

import {
  Package,
  Image as ImageIcon,
  Plus,
  X,
  ArrowRight,
  Truck,
  ArrowLeft,
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

  const handleSubmit = async (productData) => {
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
      const errorMsg = error.response?.data?.message || error.message;
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
            onClick={()=> setIsLoginOpen(true)}
            className="group flex items-center gap-3 px-8 py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#F26722]/20"
          >
            Iniciar Sesión
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            ¿No tienes cuenta? Se crea automáticamente al iniciar sesión
          </p>
        </div>
        <NeroLogin 
          isOpen={isLoginOpen} 
          onClose={() => setIsLoginOpen(false)} 
           onLoginSuccess={(user) => {
        // Opcional: Aquí podrías navegar a otra página si quieres
        // navigate('/dashboard');
      }}
        />
        <HowToSell />
      </div>
    );
  }

  // Si está autenticado y no hay formType, mostramos el selector
  if (!formType) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-6">
          <ListingTypeSelector onSelect={setFormType} />
        </div>
      </DashboardLayout>
    );
  }

  // Si está autenticado y hay formType, mostramos el formulario
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-10">
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
    </DashboardLayout>
  );
}
