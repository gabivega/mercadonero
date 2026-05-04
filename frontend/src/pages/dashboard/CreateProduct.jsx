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

import {
  Package,
  Image as ImageIcon,
  Plus,
  X,
  ArrowRight,
  Truck,
  ArrowLeft,
} from "lucide-react";
export default function CreateProduct() {
 
  const [formType, setFormType] = useState(null);

  const { getAccessToken, user, authenticated, login } = usePrivy();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

 
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
    // Usamos el spread (...) para pasar todo lo que venga del form (incluyendo specifications)
    // y solo sobreescribimos o aseguramos campos base si es necesario.
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
    // Axios guarda el error del back en error.response.data
    const errorMsg = error.response?.data?.message || error.message;
    showError("Error: " + errorMsg);
  } finally {
    setIsSubmitting(false);
  }
};

if (!authenticated || !user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white mb-2">
          ¿Quieres empezar a vender?
        </h2>
        
        <p className="text-zinc-500 dark:text-zinc-400 max-w-xs mb-8 text-sm">
          Para crear una publicación, primero debes iniciar sesión.
        </p>

        <button
          onClick={login}
          className="px-8 py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#F26722]/20"
        >
          Iniciar Sesión
        </button>
      </div>
    );
  }


  if (!formType) {
 return <ListingTypeSelector onSelect={setFormType} />;
}
  return (
    <DashboardLayout>
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      {/* HEADER */}
      <header>
        <h2 className="text-3xl font-black dark:text-white flex items-center gap-3">
          <Plus className="text-blue-600" size={32} /> Crear Publicación
        </h2>
        {/* <p className="text-gray-500 mt-1">
          Completa los detalles para vender en Mercado Nero.
        </p> */}
        <div onClick={() => setFormType(null)} className="flex items-center gap-2 mt-4 cursor-pointer">
          <ArrowLeft className="text-blue-600" size={20} />
          <p  className="cursor-pointer text-blue-600 text-md">Volver</p>
        </div>
      </header>

       {formType === "product" && 
       <ProductForm 
       handleSubmit={handleSubmit} 
       isSubmitting={isSubmitting} 
       />}
       {formType === "vehicle" && 
       <VehicleForm 
       handleSubmit={handleSubmit} 
       isSubmitting={isSubmitting} 
       />}
       {formType === "property" && 
       <PropertyForm 
       handleSubmit={handleSubmit} 
       isSubmitting={isSubmitting} 
       />}
       {formType === "service" && 
       <ServiceForm 
       handleSubmit={handleSubmit} 
       isSubmitting={isSubmitting} 
       />}
       <ImportSection />
    </div>
    </DashboardLayout>
  );
}
