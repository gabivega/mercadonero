import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCartStore } from "../store/useCartStore";
import {
  MapPin,
  CreditCard,
  ChevronRight,
    ArrowLeft,
  ShieldCheck,
  User,
  Save,
} from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import { AddressSection } from "../components/AddressSection";
import { useUserStore } from "../store/useUserStore";
import { usePrivy } from "@privy-io/react-auth";
import AuthOnboarding from "../components/AuthOnboarding";
import { useSyncUser } from "../Utils/userSync";
import LoadingSpinner from "../components/LoadingSpinner";

export default function Checkout() {
  const { sellerId } = useParams();
  const navigate = useNavigate();
  const { cart, removeFromCart } = useCartStore();
  const { dbUser, setDbUser, setAddresses } = useUserStore();
  const { getAccessToken, ready, user, authenticated } = usePrivy(); // Asumiendo que viene de Privy
const addresses = dbUser?.addresses || [];

const [selectedAddress, setSelectedAddress] = useState(null);
  const { syncUser } = useSyncUser(setDbUser);
  const [isLoading, setIsLoading] = useState(false);

    // ── ESTADO DEL MODAL DE DATOS OBLIGATORIOS (ONBOARDING PRE-CHECKOUT) ──
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [isSavingBasic, setIsSavingBasic] = useState(false);
  // Separado en 2 pasos para que guardar la dirección (que actualiza el store
  // global) no borre los datos básicos que el usuario aún no guardó:
  //   step 1 = datos personales obligatorios (nombre, apellido, DNI, teléfono)
  //   step 2 = dirección de envío (AddressSection)
  const [step, setStep] = useState(1);
  const [basicForm, setBasicForm] = useState({
    firstName: "",
    lastName: "",
    dni: "",
    phone: "",
  });
  const [basicErrors, setBasicErrors] = useState({});

  const getEffectivePrice = (item) => {
    if (item.salePrice && item.salePrice > 0) {
      return item.salePrice;
    }
    return item.price;
  };

// Seleccionar la dirección principal automáticamente cuando se cargan/modifican las direcciones
useEffect(() => {
  if (addresses.length > 0 && !selectedAddress) {
    const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
    setSelectedAddress(defaultAddr);
  }
}, [addresses]);

    const handleSelectAddress = (addr) => {
    // 1. Primero actualizamos el estado local
    setSelectedAddress(addr);
    // Si se limpió la selección (se eliminó la dirección), no mostramos el Toast
    if (!addr) return;
    //checkeo de theme
    const isDark = document.documentElement.classList.contains("dark");
    // 2. Disparamos una notificación sutil (Toast) o un Swal de confirmación
    const Toast = Swal.mixin({
      toast: true,
      position: "bottom-end",
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
      background: isDark ? "#1f2937" : "#ffffff", // bg-gray-800 o blanco
      color: isDark ? "#f3f4f6" : "#1f2937", // text-gray-100 o gray-800
      iconColor: "#3483fa",
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });

    Toast.fire({
      icon: "success",
      title: `Envío configurado a: ${addr.street} ${addr.streetNumber}, ${addr.city}, ${addr.province}`,
    });
  };


// Validación robusta basada en tu objeto real de usuario
const canProceedToCheckout = (user) => {
  if (!user) return false;

  const hasIdentity = user.firstName && user.lastName && user.dni;
  const hasContact = user.phone;
  // const hasDefaultAddress = user.addresses?.some(addr => addr.isDefault === true);

  return hasIdentity && hasContact;
};

// console.log(dbUser)

const isProfileIncomplete = (user) => {
  if (!user) return true;

  const hasBasicData =
    user.firstName && user.lastName && user.dni && user.phone;
  return !hasBasicData;
};

// Valida los datos básicos del formulario del modal
const validateBasicStep = () => {
  const errs = {};
  const nameRe = /^[A-Za-zÁáÉéÍíÓóÚúÑñ\s]{2,}$/;
  const dniRe = /^\d{7,8}$/;

  if (!basicForm.firstName.trim() || !nameRe.test(basicForm.firstName.trim())) {
    errs.firstName = "Ingresá un nombre válido (solo letras, mínimo 2 caracteres)";
  }
  if (!basicForm.lastName.trim() || !nameRe.test(basicForm.lastName.trim())) {
    errs.lastName = "Ingresá un apellido válido (solo letras, mínimo 2 caracteres)";
  }
    if (!dniRe.test(basicForm.dni.trim())) {
    errs.dni = "El DNI debe tener entre 7 y 8 números";
  }
    const phoneDigits = cleanPhone(basicForm.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 12) {
    errs.phone =
      "Ingresá el teléfono completo (código de área + número, entre 10 y 12 dígitos, sin el 0)";
  }

  setBasicErrors(errs);
  return Object.keys(errs).length === 0;
};

// Cada vez que se ABRE el modal, precargamos en el formulario los datos ya
// guardados (por si el usuario completó alguno) para no obligarlo a
// reescribirlos. Depende de dataModalOpen (no de dbUser) para que al guardar
// una dirección —lo que actualiza dbUser en el store— NO se pise lo que el
// usuario está escribiendo en el paso 1.
useEffect(() => {
  if (dataModalOpen && dbUser) {
        setBasicForm({
      firstName: dbUser.firstName || "",
      lastName: dbUser.lastName || "",
      dni: dbUser.dni || "",
      phone: cleanPhone(dbUser.phone || ""),
    });
    setStep(1);
  }
}, [dataModalOpen]);

// Abre el modal automáticamente si el perfil está incompleto (checkout
// bloqueado hasta completar los datos obligatorios).
useEffect(() => {
  if (dbUser && isProfileIncomplete(dbUser)) {
    setDataModalOpen(true);
  }
}, [dbUser]);

// DNI: solo números, máx. 8 dígitos.
const cleanDigitsOnly = (value) => value.replace(/\D/g, "").slice(0, 8);

// Teléfono argentino: solo la parte local (sin +54). Quita prefijos sueltos
// (54/0/15) que el usuario pueda pegar y permite entre 10 y 12 dígitos
// (los fijos con código de área de 4 cifras, ej: 03492 sin el 0 = 3492, más
// 7-8 cifras del número, llegan a 11-12 dígitos).
const cleanPhone = (value) => {
  let digits = value.replace(/\D/g, "");
  digits = digits.replace(/^(549|54)/, "");
  digits = digits.replace(/^0/, "");
  digits = digits.slice(0, 12);
  return digits;
};

// Formatea la parte local del teléfono para su visualización:
// 123456789 -> 12 3456-7899 (espacio entre código de área y número)
// 3492 456789 -> 3492 4567-89 (código de área de 4 cifras + número)
const formatPhoneDisplay = (digits) => {
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
};

// Guarda los datos básicos en el backend (mismo endpoint que el onboarding).
const handleSaveBasicData = async () => {
  if (!validateBasicStep()) return;
  setIsSavingBasic(true);
  try {
    const token = await getAccessToken();
    const { data } = await axios.put(
      `${import.meta.env.VITE_SERVER_URL}/api/user/update-profile`,
            {
        firstName: basicForm.firstName.trim(),
        lastName: basicForm.lastName.trim(),
        dni: basicForm.dni.trim(),
        // Guardamos el teléfono ya normalizado con prefijo internacional.
        phone: `+54${basicForm.phone.trim()}`,
        // Preservamos las direcciones ya existentes para no borrarlas.
        addresses: dbUser?.addresses || [],
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

        if (data?.success && data.user) {
      // Actualizamos el store global con el perfil completo y pasamos al
      // paso 2 (dirección de envío).
      setDbUser(data.user, user?.id);
      setBasicErrors({});
      setStep(2);
    }
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text:
        error?.response?.data?.message ||
        "No se pudieron guardar tus datos. Intentalo de nuevo.",
    });
  } finally {
    setIsSavingBasic(false);
  }
};

    const handleFinalConfirm = async () => {
    if (isProfileIncomplete(dbUser)) {
      setDataModalOpen(true);
      return Swal.fire({
        icon: "warning",
        title: "Faltan datos obligatorios",
        text: "Completá tu nombre, apellido, DNI y teléfono para poder continuar con la compra.",
      });
    }

    if (!selectedAddress) {
      return Swal.fire({ icon: "warning", title: "Falta la dirección" });
    }

    const isDark = document.documentElement.classList.contains("dark");

    // MODAL 1: Compromiso de compra
 const productListHtml = sellerProducts.map(p => `
  <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px; padding-left: 10px; border-left: 2px solid #3483fa;">
    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
      ${p.quantity}x ${p.name}
    </span>
    <span style="font-weight: 600;">$${(p.sale?.price ? p.sale.price * p.quantity :p.price * p.quantity).toLocaleString()}</span>
  </div>
`).join('');

const step1 = await Swal.fire({
  title: '<span style="font-size: 1.25rem; font-weight: 800;">Confirmar Compromiso de Compra</span>',
  html: `
    <div style="text-align: left; font-size: 0.9rem; line-height: 1.5; color: ${isDark ? "#e4e4e7" : "#374151"};">
      
      <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid ${isDark ? "#27272a" : "#e5e7eb"};">
        <p style="margin: 0 0 10px 0;"><b>Resumen de productos:</b></p>
        <div style="margin-bottom: 12px;">
          ${productListHtml}
        </div>
        <div style="background-color: ${isDark ? "#27272a" : "#f8fafc"}; padding: 10px; border-radius: 12px; margin-top: 10px;">
          <p style="margin: 3px 0; display: flex; justify-content: space-between;">
            <span>📦 Subtotal Productos:</span>
            <span style="font-weight: 700;">$${total.toLocaleString()}</span>
          </p>
          <p style="margin: 3px 0; display: flex; justify-content: space-between;">
            <span>🚚 Costo de Envío:</span>
            <span style="font-weight: 700; color: ${shippingTotal === 0 ? '#10b981' : 'inherit'}">
              ${shippingTotal === 0 ? 'GRATIS' : `$${shippingTotal.toLocaleString()}`}
            </span>
          </p>
          <p style="margin: 8px 0 0 0; display: flex; justify-content: space-between; font-size: 1.1rem; border-top: 1px solid ${isDark ? "#3f3f46" : "#e5e7eb"}; pt-2">
            <b>Total Final:</b>
            <span style="color: #3483fa; font-weight: 900;">$${finalTotal.toLocaleString()}</span>
          </p>
        </div>
        <p style="margin: 10px 0 0 0; font-size: 0.85rem;">👤 <b>Vendedor:</b> ${sellerName}</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 5px 0;">📍 <b>Envío a:</b> ${selectedAddress.street} ${selectedAddress.streetNumber}, ${selectedAddress.city}</p>
        <p style="margin: 5px 0;">🚚 <b>Despacho:</b> El vendedor despacha en <b>${sellerProducts[0]?.shipping?.shippingTime || "48h"}</b></p>
        <p style="margin: 10px 0 0 0; font-size: 0.8rem; color: #10b981; display: flex; align-items: center; gap: 4px;">
          🛡️ Compra protegida por Mercado Nero
        </p>
      </div>

      <div style="background-color: ${isDark ? "#1e1b4b" : "#eff6ff"}; border: 1px solid ${isDark ? "#312e81" : "#bfdbfe"}; padding: 12px; border-radius: 8px; margin-top: 15px;">
        <p style="margin: 0; font-weight: 600; color: ${isDark ? "#93c5fd" : "#1e40af"}; font-size: 0.85rem;">
          ⏱️ Tienes 60 minutos para realizar y notificar el pago. De lo contrario, la orden se cancelará automáticamente.
        </p>
      </div>
    </div>
  `,
  icon: "question",
  showCancelButton: true,
  confirmButtonText: "Confirmar Orden",
  cancelButtonText: "Volver",
  confirmButtonColor: "#3483fa",
  cancelButtonColor: isDark ? "#27272a" : "#6b7280",
  background: isDark ? "#121212" : "#ffffff",
  color: isDark ? "#f3f4f6" : "#1f2937",
  reverseButtons: true,
  width: "550px",
});

    if (step1.isConfirmed) {
      setIsLoading(true);
      try {
        // 1. CREAMOS LA ORDEN EN EL BACKEND
        const token = await getAccessToken();
        const response = await axios.post(
          `${import.meta.env.VITE_SERVER_URL}/api/order/create`,
          {
            sellerId,
            items: sellerProducts.map((p) => ({
              productId: p._id,
              quantity: p.quantity,
            })),
            shippingAddress: selectedAddress,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );

        const newOrderId = response.data.order._id;

        // Obtener datos bancarios del vendedor
        let bankAccount = null;
        try {
          const bankResponse = await axios.get(
            `${import.meta.env.VITE_SERVER_URL}/api/user/bank-accounts/${sellerId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (bankResponse.data.success) {
            bankAccount = bankResponse.data.bankAccount;
          }
        } catch (error) {
          console.error("Error al obtener datos bancarios del vendedor:", error);
        }

        const step2 = await Swal.fire({
          title: "¡Orden Creada! Realiza el pago",
          html: `
    <div style="text-align: left; font-size: 0.9rem;">
      <div style="background: ${isDark ? "#1f2937" : "#f3f4f6"}; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
        <p style="margin: 5px 0;"><b>Titular:</b> ${bankAccount?.holderName || 'No disponible'}</p>
        <p style="margin: 5px 0;"><b>CBU:</b> ${bankAccount?.cbuCvu || 'No disponible'}</p>
        <p style="margin: 5px 0;"><b>Alias:</b> ${bankAccount?.alias || 'No disponible'}</p>
        <p style="margin: 5px 0;"><b>Banco:</b> ${bankAccount?.bankName || 'No disponible'}</p>
        <p style="margin: 5px 0;"><b>Cuit/Cuil:</b> ${bankAccount?.cuitCuil || 'No disponible'}</p>
        <p style="margin: 10px 0 0 0; font-size: 1.1rem; color: #3483fa; font-weight: bold;">
          Total: $${response.data.order.totalAmount.toLocaleString()}
        </p>
      </div>
      <p>Transferí y presioná el botón de abajo para avisarle al vendedor.</p>
      <p>Tenés 60 minutos o la orden expira automáticamente.</p>
    </div>
  `,
          icon: "info",
          showCancelButton: true,
          confirmButtonText: "Ya transferí",
          cancelButtonText: "Pagaré más tarde",
          confirmButtonColor: "#22c55e", // Verde para éxito
          cancelButtonColor: "#6b7280",
          background: isDark ? "#121212" : "#ffffff",
          color: isDark ? "#f3f4f6" : "#1f2937",
          showLoaderOnConfirm: true,
          allowOutsideClick: false,
          preConfirm: async () => {
            try {
              const token = await getAccessToken();
              // Actualizamos la orden a "verifying_payment"
              return await axios.patch(
                `${import.meta.env.VITE_SERVER_URL}/api/order/${newOrderId}`,
                { status: 'verifying_payment' },
                { headers: { Authorization: `Bearer ${token}` } },
              );
            } catch (error) {
              Swal.showValidationMessage(
                `Error: ${error.response?.data?.message || "No se pudo actualizar"}`,
              );
            }
          },
        });

        // Vaciamos el carrito después de la creación exitosa, sin importar si pagó ahora o después
        sellerProducts.forEach((p) => removeFromCart(p._id));

        if (step2.isConfirmed) {
          Swal.fire({
            title: "¡Aviso enviado!",
            text: 'El vendedor verificará el pago. Podés subir el comprobante en "Mis Compras".',
            icon: "success",
            confirmButtonColor: "#3483fa",
          });
        }

        navigate("/compras");
      } catch (error) {
        const errorMsg = error.response?.data?.message || "No pudimos procesar la orden";
        Swal.fire("Error", errorMsg, "error");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 1. Filtramos los productos de este vendedor desde el Store
  const sellerProducts = useMemo(() => {
  return cart.filter(
    (item) => (item.seller?._id || item.seller) === sellerId,
  );
}, [cart, sellerId]);

// 2. Calculamos el total considerando el precio de oferta (item.sale.price)
const total = useMemo(() => {
  return sellerProducts.reduce((acc, p) => {
    // Verificamos si existe el precio de oferta y es mayor a 0
    const effectivePrice = (p.sale && p.sale.price > 0) 
      ? p.sale.price 
      : p.price;
      
    return acc + (effectivePrice * p.quantity);
  }, 0);
}, [sellerProducts]);

// CALCULO DEL COSTO DE ENVIO: Se toma el valor mas alto
  const shippingTotal = useMemo(() => {
  const costs = sellerProducts.map(p => p.shipping?.free ? 0 : (p.shipping?.cost || 0));
  
  // Si todos son gratis, el max será 0. Si hay costos, tomamos el mayor.
  return Math.max(...costs);
}, [sellerProducts]);

// Calculamos el total final sumando productos + envío
const finalTotal = useMemo(() => total + shippingTotal, [total, shippingTotal]);


  const sellerName = sellerProducts[0]?.sellerName || "Vendedor";

  // Ahora puedes pasarle la función al Onboarding sin problemas

// if (!authenticated || isProfileIncomplete(dbUser) || !dbUser || !canProceedToCheckout(dbUser)) {
if (!authenticated ||  !dbUser ) {
    
  return (<AuthOnboarding onComplete={syncUser} initialStep={authenticated ? 2 : 1} />);
  // <LoadingSpinner message="Verificando tu perfil..." size="sm" className="flex justify-center my-auto absolute" />;
}

  if (sellerProducts.length === 0) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-xl font-bold">
          No hay productos para este vendedor
        </h2>
        <button
          onClick={() => navigate("/cart")}
          className="mt-4 text-blue-500 underline"
        >
          Volver al carrito
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f5f5] dark:bg-[#0a0a0a] min-h-screen pb-20">
      {/* Header simple para Checkout */}
      <header className="bg-white dark:bg-[#121212] border-b dark:border-zinc-800 py-4 mb-8">
        <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
          <button
            onClick={() => navigate("/cart")}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />{" "}
            <span className="text-sm font-medium">Volver al carrito</span>
          </button>
          <h1 className="text-lg font-bold dark:text-white">
            Finalizar compra
          </h1>
          <div className="w-20"></div> {/* Spacer */}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lado Izquierdo: Configuración */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECCIÓN DIRECCIÓN */}
          <section className="bg-white dark:bg-[#121212] rounded-lg shadow-sm border dark:border-zinc-800 p-6">
            <h3 className="flex items-center gap-3 font-bold text-gray-800 dark:text-gray-100 mb-6">
              <MapPin className="text-[#3483fa]" size={22} />
              ¿Dónde quieres recibir tu compra?
            </h3>

           <AddressSection
  addresses={addresses}
  getAccessToken={getAccessToken}
  setAddresses={setAddresses}
  handleSelectAddress={handleSelectAddress}
  selectedAddress={selectedAddress}
/>

            {selectedAddress && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium capitalize">
                  Dirección seleccionada: {selectedAddress.street}{" "}
                  {selectedAddress.streetNumber}, {selectedAddress.city}
                </p>
              </div>
            )}
          </section>

          {/* SECCIÓN PAGO (INFO) */}
          <section className="bg-white dark:bg-[#121212] rounded-lg shadow-sm border dark:border-zinc-800 p-6">
            <h3 className="flex items-center gap-3 font-bold text-gray-800 dark:text-gray-100 mb-6">
              <CreditCard className="text-[#3483fa]" size={22} />
              Método de pago
            </h3>
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border cursor-pointer border-[#3483fa] bg-blue-50 dark:bg-blue-900/10 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-4 border-[#3483fa] hidden md:flex"></div>
                <div>
                  <p className="font-semibold text-sm dark:text-white">
                    Transferencia o tarjeta de crédito
                  </p>
                  <p className="text-xs text-gray-500">
                    Directo al vendedor y tu compra siempre está protegida.
                  </p>
                </div>
              </div>
              <span className="text-[10px] bg-[#3483fa] text-white m-2 px-2 py-0.5 rounded font-bold">
                MEJOR PRECIO
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border mt-4 border-[#173768] bg-blue-50 dark:bg-blue-900/10 rounded-lg select-none">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-4 border-[#133669] hidden md:flex"></div>
                <div>
                  <p className="font-semibold text-sm dark:text-white">
                    Pagar con Criptomonedas
                  </p>
                  <p className="text-xs text-gray-500">
                    Paga con criptomonedas desde el saldo de tu wallet, con menor comisión.
                  </p>
                </div>
              </div>
              <span className="text-[10px] bg-[#3483fa] text-white px-2 m-2 py-0.5 rounded font-bold">
                PROXIMAMENTE
              </span>
            </div>
            {/* <div className="flex flex-col sm:flex-row items-center justify-between p-4 border mt-4 border-[#173768] bg-blue-50 dark:bg-blue-900/10 rounded-lg select-none">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-4 border-[#133669] hidden md:flex"></div>
                <div>
                  <p className="font-semibold text-sm dark:text-white">
                    Tarjeta de Crédito
                  </p>
                  <p className="text-xs text-gray-500">
                    Pagos con tarjeta Visa o Mastercard, con compra protegida.
                  </p>
                </div>
              </div>
              <span className="text-[10px] bg-[#3483fa] text-white m-2 px-2 py-0.5 rounded font-bold">
                PROXIMAMENTE
              </span>
            </div> */}
          </section>

          {/* RESUMEN DE PRODUCTOS */}
          <section className="bg-white dark:bg-[#121212] rounded-lg shadow-sm border dark:border-zinc-800 p-6">
            <h3 className="flex items-center gap-3 font-bold text-gray-800 dark:text-gray-100 mb-4 text-sm uppercase tracking-wider">
              Revisión de productos
            </h3>
            <div className="divide-y dark:divide-zinc-800">
              {sellerProducts.map((item) => (
                <div
                  key={item._id}
                  className="py-4 flex gap-4 cursor-pointer"
                  onClick={() => navigate(`/product/${item._id}`)}
                >
                  <img
                    src={item.images?.[0]?.url || item.image}
                    className="w-12 h-12 object-contain rounded"
                    alt=""
                  />
                  <div className="flex-1">
                    <p className="text-sm dark:text-gray-200 line-clamp-1">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Cantidad: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    {item.sale.price > 0 ? (
                      <>
                        {/* Precio de lista tachado */}
                        <p className="text-xs text-gray-400 line-through">
                          ${(item.price * item.quantity).toLocaleString()}
                        </p>
                        {/* Precio con descuento */}
                        <p className="text-sm font-bold text-green-600 dark:text-green-400">
                          ${(item.sale.price * item.quantity).toLocaleString()}
                        </p>
                      </>
                    ) : (
                      /* Precio normal si no hay oferta */
                      <p className="text-sm font-medium dark:text-white">
                        ${(item.price * item.quantity).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Lado Derecho: Sticky Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[#121212] rounded-lg shadow-sm border dark:border-zinc-800 p-6 sticky top-8">
            <h2 className="text-lg font-bold mb-6 dark:text-white">
              Resumen de compra
            </h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Productos ({sellerProducts.length})</span>
                <span>${total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600 font-bold">
                <span>Envío: </span>
                <span>{shippingTotal.toLocaleString() > 0 ? ("$" + shippingTotal.toLocaleString()) : 'Gratis'} </span>
              </div>
              <div className="border-t dark:border-zinc-800 pt-4 flex justify-between">
                <span className="text-lg font-bold dark:text-white">Total</span>
                <span className="text-lg font-bold dark:text-white">
                  ${finalTotal.toLocaleString()}
                </span>
              </div>
            </div>

                        <button
              onClick={handleFinalConfirm}
              disabled={isLoading || !selectedAddress || isProfileIncomplete(dbUser)}
              className={`w-full py-4 rounded-md font-bold text-white transition-all flex items-center justify-center gap-2 ${
                selectedAddress && !isProfileIncomplete(dbUser)
                  ? "bg-[#3483fa] hover:bg-[#2968c8]"
                  : "bg-gray-300 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Procesando...
                </>
              ) : (
                <>
                  Confirmar compra <ChevronRight size={18} />
                </>
              )}
            </button>
            {!selectedAddress && (
              <div className="mt-2 text-red-500 text-sm">
                Por favor selecciona una dirección de envío para poder avanzar
              </div>
            )}

            <div className="mt-6 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-gray-400 mt-1" />
              <p className="text-[11px] text-gray-500">
                Al confirmar, se generará una orden de compra. Tendrás un tiempo
                limitado para realizar la transferencia y subir el comprobante.
              </p>
            </div>
                    </div>
        </div>
      </main>

      {/* ──────────────────────────────────────────────────────────
          MODAL DE DATOS OBLIGATORIOS (ONBOARDING PRE-CHECKOUT)
          Overlay difuminado sobre el checkout. Obliga al usuario a
          completar su nombre, apellido, DNI y teléfono para poder
          confirmar la compra. Incluye el AddressSection por si necesita
          cargar una dirección de envío. Se mantiene abierto hasta tener
          todos los datos. El envío (AddressSection) del checkout sigue
          siempre disponible abajo.
      ────────────────────────────────────────────────────────── */}
      {dataModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#121212] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl my-8">
            {/* HEADER */}
            <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#F26722]/10 rounded-2xl text-[#F26722]">
                  <User size={22} />
                </div>
                                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight dark:text-white">
                    {step === 1 ? "Completa tus datos" : "Dirección de envío"}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {step === 1
                      ? "Necesitamos estos datos para poder procesar tu compra."
                      : "Cargá o elegí dónde querés recibir tu compra."}
                  </p>
                  {/* Indicador de pasos */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <span
                      className={`h-1.5 w-6 rounded-full ${
                        step >= 1 ? "bg-[#F26722]" : "bg-zinc-200 dark:bg-zinc-700"
                      }`}
                    />
                    <span
                      className={`h-1.5 w-6 rounded-full ${
                        step >= 2 ? "bg-[#F26722]" : "bg-zinc-200 dark:bg-zinc-700"
                      }`}
                    />
                  </div>
                </div>
              </div>
                            <button
                onClick={() => navigate("/cart")}
                className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-400 hover:text-[#F26722] transition-colors"
              >
                <ArrowLeft size={15} /> Volver al carrito
              </button>
            </div>

                        {step === 1 ? (
              /* ── PASO 1: DATOS PERSONALES OBLIGATORIOS ── */
              <div className="p-6 space-y-5">
                {/* NOMBRE Y APELLIDO */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      placeholder="Nombre *"
                      className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${basicErrors.firstName ? "border-red-500" : "border-zinc-200 dark:border-zinc-700"} outline-none focus:border-[#F26722] dark:text-white`}
                      value={basicForm.firstName}
                      onChange={(e) =>
                        setBasicForm({
                          ...basicForm,
                          firstName: e.target.value.replace(
                            /[^A-Za-zÁáÉéÍíÓóÚúÑñ\s]/g,
                            "",
                          ),
                        })
                      }
                    />
                    {basicErrors.firstName && (
                      <p className="text-xs text-red-500 mt-1">{basicErrors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <input
                      placeholder="Apellido *"
                      className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${basicErrors.lastName ? "border-red-500" : "border-zinc-200 dark:border-zinc-700"} outline-none focus:border-[#F26722] dark:text-white`}
                      value={basicForm.lastName}
                      onChange={(e) =>
                        setBasicForm({
                          ...basicForm,
                          lastName: e.target.value.replace(
                            /[^A-Za-zÁáÉéÍíÓóÚúÑñ\s]/g,
                            "",
                          ),
                        })
                      }
                    />
                    {basicErrors.lastName && (
                      <p className="text-xs text-red-500 mt-1">{basicErrors.lastName}</p>
                    )}
                  </div>
                </div>

                {/* DNI */}
                <div>
                  <input
                    placeholder="DNI (Sin puntos) *"
                    inputMode="numeric"
                    maxLength={8}
                    className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${basicErrors.dni ? "border-red-500" : "border-zinc-200 dark:border-zinc-700"} outline-none focus:border-[#F26722] dark:text-white`}
                    value={basicForm.dni}
                    onChange={(e) =>
                      setBasicForm({ ...basicForm, dni: cleanDigitsOnly(e.target.value) })
                    }
                  />
                  {basicErrors.dni && (
                    <p className="text-xs text-red-500 mt-1">{basicErrors.dni}</p>
                  )}
                </div>

                                {/* TELÉFONO (formato argentino, +54 fijo, 10-12 dígitos) */}
                <div>
                  <div className="flex items-stretch">
                    <span className="flex items-center px-4 rounded-l-2xl bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300 border border-r-0 border-zinc-200 dark:border-zinc-700 font-bold text-sm">
                      +54
                    </span>
                    <input
                      placeholder="11 2345-6789"
                      inputMode="tel"
                      maxLength={14}
                      className={`flex-1 w-full p-4 rounded-r-2xl bg-zinc-50 dark:bg-zinc-800 border ${basicErrors.phone ? "border-red-500" : "border-zinc-200 dark:border-zinc-700"} outline-none focus:border-[#F26722] dark:text-white`}
                      value={formatPhoneDisplay(basicForm.phone)}
                      onChange={(e) =>
                        setBasicForm({ ...basicForm, phone: cleanPhone(e.target.value) })
                      }
                    />
                  </div>
                  {basicErrors.phone ? (
                    <p className="text-xs text-red-500 mt-1">{basicErrors.phone}</p>
                  ) : (
                    <p className="text-xs text-zinc-400 mt-1">
                      Ej: +54 11 2345-6789 o +54 3492 4567-89 (código de área
                      + número, sin el 0)
                    </p>
                  )}
                </div>

                {/* BOTÓN CONTINUAR */}
                <button
                  onClick={handleSaveBasicData}
                  disabled={isSavingBasic}
                  className="w-full py-4 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingBasic ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      <Save size={18} /> Continuar
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* ── PASO 2: DIRECCIÓN DE ENVÍO ── */
              <div className="p-6 space-y-5">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Tus datos personales se guardaron correctamente. Ahora cargá
                  o elegí una dirección de envío (opcional ahora, podés hacerlo
                  en el checkout).
                </p>

                <div className="max-h-72 overflow-y-auto pr-1">
                  <AddressSection
                    addresses={addresses}
                    getAccessToken={getAccessToken}
                    setAddresses={setAddresses}
                    handleSelectAddress={handleSelectAddress}
                    selectedAddress={selectedAddress}
                  />
                </div>

                {/* BOTÓN FINALIZAR */}
                <button
                  onClick={() => {
                    if ((addresses?.length || 0) === 0 && !selectedAddress) {
                      return Swal.fire({
                        icon: "info",
                        title: "Recomendamos cargar una dirección",
                        text: "Para confirmar la compra necesitás una dirección de envío. Podés cargarla ahora o hacerlo en el checkout.",
                        confirmButtonColor: "#3483fa",
                      });
                    }
                    setDataModalOpen(false);
                  }}
                  className="w-full py-4 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
                >
                  <ChevronRight size={18} /> Finalizar e ir al checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
