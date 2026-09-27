import React, { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { MapPin, User, Phone, ArrowRight, CheckCircle, AlertCircle, X } from "lucide-react";


import axios from "axios";
import NeroLogin from "./NeroLogin";
import PostalCodeInput from "./PostalCodeInput";
import { existeCP } from "../Utils/postalCodes";

/** Nombres legibles de cada campo para el resumen de errores. */
const FIELD_LABELS = {
  firstName: "Nombre",
  lastName: "Apellido",
  dni: "DNI",
  phone: "Teléfono",
  street: "Calle",
  streetNumber: "Número",
  province: "Provincia",
  city: "Ciudad",
  zipCode: "Código Postal",
};

export default function AuthOnboarding({ onComplete, onClose }) {
  const { login, authenticated, user, getAccessToken } = usePrivy();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [isNeroLogin, setIsNeroLogin] = useState(false);
  const formRef = useRef(null);

    const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    dni: "",
    street: "",
    streetNumber: "",
    city: "",
    province: "",
    zipCode: "",
    apartment: "",
    floor: "",
    addresses: [], // Por defecto o vacío
  });

  // Efecto: Si el usuario se loguea (Paso 1), saltamos automáticamente al Paso 2
  useEffect(() => {
    if (authenticated && step === 1) {
      setStep(2);
    }
  }, [authenticated, step]);

  // Validaciones
  const validateName = (value) => {
    // Solo letras y espacios, mínimo 2 caracteres
    return /^[A-Za-zÁáÉéÍíÓóÚúÑñ\s]{2,}$/.test(value);
  };

  const validateDNI = (value) => {
    // Solo números, entre 7 y 8 dígitos
    return /^\d{7,8}$/.test(value);
  };

  const validatePhone = (value) => {
    // Formato argentino: +54 9 XXXX XXXX o similar
    return /^(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/.test(value);
  };




    const validateZipCode = (value) => {
    // CP argentino: 4 dígitos Y debe existir en la base.
    return /^\d{4}$/.test(value) && existeCP(value);
  };

    // Limpia el error de un campo puntual (al empezar a corregirlo) y apaga el
  // resumen si ya no quedan errores.
  const clearError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      if (Object.keys(next).length === 0) setShowSummary(false);
      return next;
    });
  };

  const handleNameChange = (field, value) => {
    const cleanValue = value.replace(/[^A-Za-zÁáÉéÍíÓóÚúÑñ\s]/g, '');
    setFormData({ ...formData, [field]: cleanValue });
    clearError(field);
  };

  const handleDNIChange = (value) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 8);
    setFormData({ ...formData, dni: cleanValue });
    clearError("dni");
  };

    const handlePhoneChange = (value) => {
    const cleanValue = value.replace(/[^\d\s\-\+\(\)]/g, '');
    setFormData({ ...formData, phone: cleanValue });
    clearError("phone");
  };

  // Callback del <PostalCodeInput>: recibe un patch parcial ({ zipCode,
  // province, city }) y lo aplica al estado del formulario.
  const handleAddressPatch = (patch) => {
    setFormData((prev) => ({ ...prev, ...patch }));
    if (patch.zipCode !== undefined) clearError("zipCode");
    if (patch.province !== undefined) clearError("province");
    if (patch.city !== undefined) clearError("city");
  };

  // Setea errores, activa el resumen y lleva el foco/scroll al primer campo
  // con error. Devuelve true si NO hay errores.
  const applyValidation = (newErrors) => {
    setErrors(newErrors);
    const hasErrors = Object.keys(newErrors).length > 0;
    setShowSummary(hasErrors);

    if (hasErrors) {
      const firstField = Object.keys(newErrors)[0];
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector(`[name="${firstField}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus?.();
        }
      });
    }
    return !hasErrors;
  };

  const canProceedToStep2 = () => {
    return validateName(formData.firstName) && 
           validateName(formData.lastName) && 
           validateDNI(formData.dni) && 
           validatePhone(formData.phone);
  };

  const canProceedToStep3 = () => {
    return formData.street && 
           formData.streetNumber && 
           formData.city && 
           formData.province && 
           validateZipCode(formData.zipCode);
  };

    const validateStep2 = () => {
    const newErrors = {};

    if (!formData.firstName) {
      newErrors.firstName = "Ingresá tu nombre";
    } else if (!validateName(formData.firstName)) {
      newErrors.firstName = "El nombre debe tener solo letras y mínimo 2 caracteres";
    }

    if (!formData.lastName) {
      newErrors.lastName = "Ingresá tu apellido";
    } else if (!validateName(formData.lastName)) {
      newErrors.lastName = "El apellido debe tener solo letras y mínimo 2 caracteres";
    }

    if (!formData.dni) {
      newErrors.dni = "Ingresá tu DNI";
    } else if (!validateDNI(formData.dni)) {
      newErrors.dni = "El DNI debe tener entre 7 y 8 números";
    }

        if (!formData.phone) {
      newErrors.phone = "Ingresá tu teléfono";
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = "Formato de teléfono inválido. Ej: +54 9 1234 5678";
    }

    return newErrors;
  };

  const validateStep3 = () => {
    const newErrors = {};

    if (!formData.street) {
      newErrors.street = "Ingresá la calle";
    } else if (formData.street.trim().length < 3) {
      newErrors.street = "La calle debe tener al menos 3 caracteres";
    }

    if (!formData.streetNumber) {
      newErrors.streetNumber = "Ingresá el número";
    } else if (isNaN(formData.streetNumber)) {
      newErrors.streetNumber = "El número debe ser válido";
    }

    if (!formData.province) {
      newErrors.province = "Debes seleccionar una provincia";
    }

    if (!formData.city) {
      newErrors.city = "Ingresá la ciudad";
    } else if (formData.city.trim().length < 2) {
      newErrors.city = "La ciudad debe tener al menos 2 caracteres";
    }

                if (!formData.zipCode) {
      newErrors.zipCode = "Ingresá el código postal";
    } else if (!/^\d{4}$/.test(formData.zipCode)) {
      newErrors.zipCode = "El CP debe tener 4 dígitos";
    } else if (!existeCP(formData.zipCode)) {
      newErrors.zipCode = "Ese código postal no existe en Argentina";
    }

    return newErrors;
  };

  const handleStep2Submit = () => {
    if (applyValidation(validateStep2())) {
      setStep(3);
      setErrors({}); // Limpiar errores al avanzar
      setShowSummary(false);
    }
  };

  const handleStep3Submit = () => {
    if (applyValidation(validateStep3())) {
      handleFinalSubmit();
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      // Guardamos en tu DB vinculando con el privyId (user.id)
      const updatePayload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        dni: formData.dni,
        // Aquí armamos el array con el objeto address
        addresses: [
          {
            province: formData.province,
            city: formData.city,
            street: formData.street,
            streetNumber: formData.streetNumber,
            zipCode: formData.zipCode,
            apartment: formData.apartment || "",
            floor: formData.floor || "",
            isDefault: true, // La primera dirección siempre es default
            addressType: "home",
            country: "Argentina", // Podés dejarlo hardcodeado por ahora
          },
        ],
      };
      await axios.put(
        `${import.meta.env.VITE_SERVER_URL}/api/user/update-profile`,
        updatePayload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      onComplete(); // Notifica al Checkout que ya puede renderizar
    } catch (error) {
      console.error("Error guardando perfil:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

    // Lista de errores activos para el resumen.
  const errorList = Object.keys(errors);
  const hasErrors = errorList.length > 0;

    /** Banner de resumen de errores (visible cuando falla la validación). */
  const renderErrorSummary = () =>
    showSummary && hasErrors ? (
      <div className="mb-4 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4 animate-in fade-in">
        <p className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
          <AlertCircle size={16} /> Revisá estos datos para continuar
        </p>
        <ul className="mt-2 space-y-0.5 list-disc list-inside">
          {errorList.map((field) => (
            <li key={field} className="text-xs text-red-600 dark:text-red-400">
              <span className="font-bold">
                {FIELD_LABELS[field] || field}:
              </span>{" "}
              {errors[field]}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
      <div
        ref={formRef}
        className="relative max-w-lg mx-auto my-10 p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl"
      >
      {/* Botón cerrar (solo si el consumidor permite cancelar) */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X size={20} />
        </button>
      )}

      {/* INDICADOR DE PASOS */}
      <div className="flex justify-between mb-10 px-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 w-full mx-1 rounded-full ${step >= s ? "bg-[#F26722]" : "bg-zinc-200 dark:bg-zinc-800"}`}
          />
        ))}
      </div>

      {/* PASO 1: LOGIN / REGISTRO */}
      {step === 1 && (
        <div className="text-center space-y-6 animate-in fade-in zoom-in">
          <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto">
            <User className="text-[#F26722] w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white">
            Iniciar Sesión
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Debes iniciar sesión para continuar con la compra. Si es tu primera
            vez, el registro se realiza de una forma muy simple y rápida.
          </p>
          <button
            // onClick={() => setIsNeroLogin(true)}
            onClick={login}
            className="w-full py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] transition-transform"
          >
            Continuar con Email
          </button>
          {/* <NeroLogin
           isOpen={isNeroLogin} 
      onClose={() => setIsNeroLogin(false)}
      onLoginSuccess={() => onComplete()}
        // Opcional: Aquí podrías navegar a otra página si quieres
        // navigate('/dashboard');
       /> */}
        </div>
      )}

      {/* PASO 2: IDENTIDAD Y CONTACTO */}
      {step === 2 && (
        <div className="space-y-2 animate-in slide-in-from-right">
                    <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white mb-2">
            Ingresa tus datos
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Necesitamos algunos datos básicos para que puedas comprar y vender
            en Mercado Nero
          </p>

          {renderErrorSummary()}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                name="firstName"
                placeholder="Nombre"
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.firstName 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white`}
                value={formData.firstName}
                onChange={(e) => handleNameChange("firstName", e.target.value)}
              />
              <div className="h-5 mt-1">
                {errors.firstName && (
                  <p className="text-xs text-red-500">{errors.firstName}</p>
                )}
              </div>
            </div>
            
            <div>
              <input
                name="lastName"
                placeholder="Apellido"
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.lastName 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white`}
                value={formData.lastName}
                onChange={(e) => handleNameChange("lastName", e.target.value)}
              />
              <div className="h-5 mt-1">
                {errors.lastName && (
                  <p className="text-xs text-red-500">{errors.lastName}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <input
              name="dni"
              placeholder="DNI (Sin puntos)"
              type="text"
              className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                errors.dni 
                  ? 'border-red-500' 
                  : 'border-zinc-200 dark:border-zinc-700'
              } outline-none focus:border-[#F26722] dark:text-white`}
              value={formData.dni}
              onChange={(e) => handleDNIChange(e.target.value)}
            />
            <div className="h-5 mt-1">
              {errors.dni && (
                <p className="text-xs text-red-500">{errors.dni}</p>
              )}
            </div>
          </div>

          <div>
            <input
              name="phone"
              placeholder="Teléfono de contacto"
              type="tel"
              className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                errors.phone 
                  ? 'border-red-500' 
                  : 'border-zinc-200 dark:border-zinc-700'
              } outline-none focus:border-[#F26722] dark:text-white`}
              value={formData.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
            />
            <div className="h-5 mt-1">
              {errors.phone && (
                <p className="text-xs text-red-500">{errors.phone}</p>
              )}
            </div>
          </div>

          <button
            onClick={handleStep2Submit}
            className="w-full py-4 bg-zinc-900 dark:bg-white dark:text-black text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:bg-black dark:hover:bg-zinc-200"
          >
            Siguiente: Dirección de Envío
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-in slide-in-from-right">
                    <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white mb-6">
            Dirección de Envío
          </h2>

          {renderErrorSummary()}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <input
                name="street"
                placeholder="Calle"
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.street 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white`}
                value={formData.street}
                onChange={(e) =>
                  setFormData({ ...formData, street: e.target.value })
                }
                onInput={() => clearError("street")}
              />
              <div className="h-5 mt-1">
                {errors.street && (
                  <p className="text-xs text-red-500">{errors.street}</p>
                )}
              </div>
            </div>
            <div>
              <input
                name="streetNumber"
                placeholder="N°"
                type="text"
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.streetNumber 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white`}
                value={formData.streetNumber}
                onChange={(e) =>
                  setFormData({ ...formData, streetNumber: e.target.value })
                }
                onInput={() => clearError("streetNumber")}
              />
              <div className="h-5 mt-1">
                {errors.streetNumber && (
                  <p className="text-xs text-red-500">{errors.streetNumber}</p>
                )}
              </div>
            </div>
          </div>

                    {/* CP → autocompleta Provincia y Localidad */}
          <PostalCodeInput
            zipCode={formData.zipCode}
            province={formData.province}
            city={formData.city}
            onChange={handleAddressPatch}
            cityAsSelect
            error={errors.zipCode || errors.province || errors.city || ""}
          />

          <div>
            <input
              name="apartment"
              placeholder="Piso / Depto (Opcional)"
              className="w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:border-[#F26722] dark:text-white"
              value={formData.apartment}
              onChange={(e) =>
                setFormData({ ...formData, apartment: e.target.value })
              }
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep(2);
                setErrors({}); // Limpiar errores al volver
              }}
              className="flex-1 py-4 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-2xl font-black uppercase tracking-widest hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
            >
              Anterior
            </button>
            <button
              onClick={handleStep3Submit}
              disabled={isSubmitting}
              className="flex-1 py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
                            {isSubmitting ? "Guardando..." : "Confirmar"}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
