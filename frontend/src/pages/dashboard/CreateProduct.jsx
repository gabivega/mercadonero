import { useState, useEffect } from "react";

import Swal from "sweetalert2";
import { usePrivy } from "../../Utils/authClient";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ImportSection } from "../../components/ImportProductsSection.jsx";
import ElitCatalogExplorer from "../../components/ElitCatalogExplorer.jsx";
import { ListingTypeSelector } from "../../components/ListingTypeSelector.jsx";
import SellingBenefits from "../../components/SellingBenefits.jsx";
import ProductForm from "../../components/ProductForm.jsx";
import VehicleForm from "../../components/VehicleForm.jsx";
import PropertyForm from "../../components/PropertyForm.jsx";
import ServiceForm from "../../components/ServiceForm.jsx";
import DashboardLayout from "../../components/DashboardLayout.jsx";
import SupabaseLogin from "../../components/SupabaseLogin.jsx";
import SellerOnboarding from "../../components/SellerOnboarding.jsx";
import { useUserStore } from "../../store/useUserStore";
import { useSyncUser } from "../../Utils/userSync";
import ShippingQuoteCalculator from "../../components/ShippingQuoteCalculator.jsx";


import {
  Plus,
  ArrowLeft,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export default function CreateProduct() {
  const [formType, setFormType] = useState(null);
  const { ready, getAccessToken, user, authenticated, login } = usePrivy();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // -- ONBOARDING VENDEDOR (WAITING LIST) --
  const { dbUser, setDbUser } = useUserStore();
  const { syncUser } = useSyncUser(setDbUser);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  // Estado del vendedor frente al acceso a publicar (waiting list):
  //  - onboardingComplete = completó datos básicos + tienda (shop.active)
  //  - shopApproved       = un admin lo habilito (shop.approved)
  //  - hasWallet          = tiene wallet Web3 (solo necesaria para publicar
  //                         productos de pago, no para clasificados)
  const onboardingComplete = Boolean(dbUser?.shop?.active);
  const shopApproved = Boolean(dbUser?.shop?.approved);
  const hasWallet = Boolean(dbUser?.walletAddress);

  // Prefilleo con datos que ya tengamos del perfil
  const onboardingPrefill = {
    firstName: dbUser?.firstName || "",
    lastName: dbUser?.lastName || "",
    dni: dbUser?.dni || "",
    phone: dbUser?.phone || "",
    shopName: dbUser?.shop?.name || "",
    taxCondition: dbUser?.shop?.taxCondition || "",
  };

  // MURO DE ENTRADA: si está autenticado pero NO completo el onboarding, el
  // modal se abre solo (antes de ver cualquier formulario). Así el vendedor no
  // carga todo un producto para descubrir al final que no puede publicar.
  useEffect(() => {
    if (authenticated && user && dbUser && !onboardingComplete) {
      setIsOnboardingOpen(true);
    }
  }, [authenticated, user, dbUser, onboardingComplete]);

  // Al terminar el onboarding: el vendedor queda en LISTA DE ESPERA. No hay
  // reintento de publicación; solo refrescamos el usuario en el store.
  const handleOnboardingComplete = async () => {
    await syncUser();
  };

  // CTA "Quiero vender" de la sección de beneficios. Como esa sección se
  // muestra en varios estados, resolvemos acá qué hacer según dónde esté el
  // usuario:
  //   - sin sesión        → abrir el login
  //   - sin onboarding    → abrir el modal de onboarding (waiting list)
  //   - en lista de espera→ ya aplicó: refrescamos estado (sin reintentar)
  //   - aprobado          → no aplica (ya ve el selector de tipo abajo)
  const handleWantToSell = () => {
    if (!authenticated || !user) {
      setIsLoginOpen(true);
      return;
    }
    if (!onboardingComplete) {
      setIsOnboardingOpen(true);
      return;
    }
    if (!shopApproved) {
      syncUser();
      return;
    }
    // Aprobado: el selector de tipo de publicación ya está en pantalla.
  };

  // Función unificada para errores
  const showError = (msg) => {
    Swal.fire({
      title: "Ups",
      text: msg,
      icon: "error",
      background: "#1A1A1A",
      color: "#ffffff",
      confirmButtonColor: "#2563eb",
      customClass: { popup: "rounded-3xl border border-gray-800" },
    });
  };

  const handleSubmit = async (productData) => {
    // El acceso a publicar ya se bloqueó a nivel de render (waiting list). Aca
    // solo validamos imágenes y enviamos. El backend revalida onboarding,
    // aprobación y wallet.
    if (!productData.images || productData.images.length === 0) {
      return Swal.fire({
        title: "Faltan fotos",
        text: "Debés cargar al menos una imagen para que los compradores vean tu publicación.",
        icon: "warning",
        background: "#1A1A1A",
        color: "#ffffff",
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Entendido",
        customClass: {
          popup: "rounded-3xl border border-gray-800 shadow-2xl",
        },
      });
    }

    setIsSubmitting(true);

    try {
      const token = await getAccessToken();

      const body = {
        ...productData,
        sale: productData.sale?.price > 0
          ? { active: true, price: productData.sale.price }
          : { active: false, price: 0 },
        shipping: productData.shipping || { isDigital: false, free: false },
      };

      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/product/create`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        // Si el vendedor aún no vinculó wallet, el producto de pago queda
        // oculto al público. Se lo avisamos para que sepa por qué no aparece.
        const ocultoPorWallet =
          productData.listingType !== "classified" && !hasWallet;
        Swal.fire({
          title: "Publicación exitosa",
          text: ocultoPorWallet
            ? "Tu publicación fue creada. Como todavía no tenés wallet vinculada, quedará OCULTA para compradores hasta que vincules tu billetera. Podés hacerlo desde Mi Billetera cuando quieras."
            : "Tu artículo estará disponible tras la aprobación de los administradores.",
          icon: "success",
          background: "#1A1A1A",
          color: "#ffffff",
          confirmButtonColor: "#2563eb",
          confirmButtonText: "Ir al Panel",
          customClass: { popup: "rounded-3xl border border-gray-800" },
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

      // Si el backend bloquea porque la tienda no está aprobada (waiting list).
      if (data?.blocked === "approval") {
        Swal.fire({
          title: "Lista de espera",
          text: errorMsg,
          icon: "info",
          background: "#1A1A1A",
          color: "#ffffff",
          confirmButtonColor: "#2563eb",
          confirmButtonText: "Entendido",
          customClass: { popup: "rounded-3xl border border-gray-800" },
        });
        setIsSubmitting(false);
        return;
      }

      // Falta onboarding (no debería ocurrir por el gate de render).
      if (data?.blocked === "onboarding") {
        setIsOnboardingOpen(true);
        setIsSubmitting(false);
        return;
      }

      // Fallback legacy: si un backend viejo aún bloqueara por wallet, no
      // cortamos el flujo con una redireccion; solo avisamos.
      if (data?.blocked === "wallet") {
        setIsSubmitting(false);
        return Swal.fire({
          title: "Necesitás vincular tu wallet",
          text: errorMsg,
          icon: "info",
          background: "#1A1A1A",
          color: "#ffffff",
          confirmButtonColor: "#2563eb",
          confirmButtonText: "Entendido",
          customClass: { popup: "rounded-3xl border border-gray-800" },
        });
      }

      showError("Error: " + errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready) return null;

  // Si no está autenticado, mostramos los beneficios de vender + CTA de login.
  // Antes caía directo al pedido de sesión sin explicar POR QUÉ conviene vender.
  if (!authenticated || !user) {
    return (
      <div className="animate-in fade-in zoom-in duration-300">
        <SellingBenefits onWantToSell={() => setIsLoginOpen(true)} />
        <div className="max-w-md mx-auto text-center pb-16">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            ¿No tenés cuenta? Se crea automáticamente al iniciar sesión. Sin
            contraseña ni datos biométricos.
          </p>
        </div>
        <SupabaseLogin
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
        />
      </div>
    );
  }

  // Mientras el usuario de Mongo no haya cargado (primer sync), esperamos para
  // no mostrar un falso "estas en la lista de espera" antes de saber su estado.
  if (!dbUser) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-6">
          <div className="mt-6 flex items-center justify-center gap-3 py-16 text-gray-400">
            <span className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            Cargando tu cuenta...
          </div>
        </div>
        <SellerOnboarding
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          onComplete={handleOnboardingComplete}
          prefill={onboardingPrefill}
        />
      </DashboardLayout>
    );
  }

  // MURO DE ENTRADA (WAITING LIST): mientras el usuario cargue antes de estar
  // aprobado, mostramos una pantalla informativa. El modal de onboarding se
  // abre solo (useEffect) si todavía no completó los datos.
  if (!shopApproved) {
    const alreadyApplied = onboardingComplete && !shopApproved;
    return (
      <DashboardLayout>
        {/* Beneficios siempre visibles: el que llega a /vender entiende las
            condiciones antes de tocar la lista de espera. Si ya aplicó, no
            mostramos el CTA "Quiero vender" (no tiene sentido pedirlo de nuevo). */}
        <SellingBenefits
          onWantToSell={handleWantToSell}
          showCta={!alreadyApplied}
        />
        <div className="max-w-2xl mx-auto p-6">
          <div className="mt-6 p-8 rounded-3xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <Clock className="text-amber-600 dark:text-amber-400" size={30} />
            </div>
            <h2 className="text-2xl font-black dark:text-white">
              {alreadyApplied
                ? "Estás en la lista de espera"
                : "Vender en Mercado Nero es por invitación"}
            </h2>
            <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed max-w-md mx-auto">
              {alreadyApplied
                ? "Ya recibimos tus datos. Un administrador está revisando tu tienda. Serás notificado cuando estés habilitado para vender en Mercado Nero."
                : "Completá tus datos para sumarte a la lista de espera. Cuando tu tienda sea habilitada, vas a poder publicar productos, vehículos, inmuebles y servicios."}
            </p>
            {!alreadyApplied && (
              <button
                onClick={() => setIsOnboardingOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
              >
                <ShieldCheck size={16} /> Completar mis datos
              </button>
            )}
            {alreadyApplied && (
              <button
                onClick={() => { syncUser(); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/10 rounded-xl transition-colors"
              >
                Actualizar estado
              </button>
            )}
          </div>
        </div>

        <SellerOnboarding
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          onComplete={handleOnboardingComplete}
          prefill={onboardingPrefill}
        />
      </DashboardLayout>
    );
  }

  // APROBADO: ahora si mostramos los avisos de wallet + selector/formularios.
  // Aviso de wallet NO BLOQUEANTE: el vendedor puede crear la publicación igual
  // (no pierde el formulario). Si no tiene wallet, la publicación de pago queda
  // PUBLICADA pero OCULTA al público hasta que vincule la billetera (el backend
  // ya filtra en getProducts/getProductById por seller.walletAddress).
  const walletNotice = dbUser && !hasWallet && (
    <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
      <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
      <div>
        <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
          Todavía no tenés wallet: tu publicación quedará oculta
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
          Podés crear la publicación ahora sin problema. Tené en cuenta que los <b>Productos</b> de pago no serán
          visibles para compradores hasta que vincules una billetera (los clasificados no la necesitan). Podés
          publicar primero y vincular tu billetera después desde{" "}
          <span
            className="underline font-semibold cursor-pointer hover:text-amber-900 dark:hover:text-amber-200"
            onClick={() => navigate("/billetera")}
          >
            Mi Billetera
          </span>.
        </p>
      </div>
    </div>
  );

  // Si está autenticado y no hay formType, mostramos el selector
  if (!formType) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {walletNotice}
          <ListingTypeSelector onSelect={setFormType} />
        </div>
        <SellerOnboarding
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          onComplete={handleOnboardingComplete}
          prefill={onboardingPrefill}
        />
      </DashboardLayout>
    );
  }

  // Si está autenticado y hay formType, mostramos el formulario
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-10">
        {walletNotice}

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

      {/* Modal de Onboarding Vendedor (por si se reabre) */}
      <SellerOnboarding
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleOnboardingComplete}
        prefill={onboardingPrefill}
      />
      {/* <ShippingQuoteCalculator /> */}
    </DashboardLayout>
  );
}


