import React, { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { MapPin, User, Phone, ArrowRight, CheckCircle } from "lucide-react";
import axios from "axios";
import NeroLogin from "./NeroLogin";

export default function AuthOnboarding({ onComplete }) {
  const { login, authenticated, user, getAccessToken } = usePrivy();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [isNeroLogin, setIsNeroLogin] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    addresses: [], // Por defecto o vacío
  });

  const PROVINCIAS_AR = [
    "Buenos Aires",
    "CABA",
    "Catamarca",
    "Chaco",
    "Chubut",
    "Córdoba",
    "Corrientes",
    "Entre Ríos",
    "Formosa",
    "Jujuy",
    "La Pampa",
    "La Rioja",
    "Mendoza",
    "Misiones",
    "Neuquén",
    "Río Negro",
    "Salta",
    "San Juan",
    "San Luis",
    "Santa Cruz",
    "Santa Fe",
    "Santiago del Estero",
    "Tierra del Fuego",
    "Tucumán",
  ];

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
    // CP argentino: 4 dígitos
    return /^\d{4}$/.test(value);
  };

  const handleNameChange = (field, value) => {
    const cleanValue = value.replace(/[^A-Za-zÁáÉéÍíÓóÚúÑñ\s]/g, '');
    setFormData({ ...formData, [field]: cleanValue });
  };

  const handleDNIChange = (value) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 8);
    setFormData({ ...formData, dni: cleanValue });
  };

  const handlePhoneChange = (value) => {
    const cleanValue = value.replace(/[^\d\s\-\+\(\)]/g, '');
    setFormData({ ...formData, phone: cleanValue });
  };

  const handleZipCodeChange = (value) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 4);
    setFormData({ ...formData, zipCode: cleanValue });
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
    
    if (!validateName(formData.firstName)) {
      newErrors.firstName = "El nombre debe tener solo letras y mínimo 2 caracteres";
    }
    
    if (!validateName(formData.lastName)) {
      newErrors.lastName = "El apellido debe tener solo letras y mínimo 2 caracteres";
    }
    
    if (!validateDNI(formData.dni)) {
      newErrors.dni = "El DNI debe tener entre 7 y 8 números";
    }
    
    if (!validatePhone(formData.phone)) {
      newErrors.phone = "Formato de teléfono inválido. Ej: +54 9 1234 5678";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = () => {
    const newErrors = {};
    
    if (formData.street.length < 3) {
      newErrors.street = "La calle debe tener al menos 3 caracteres";
    }
    
    if (isNaN(formData.streetNumber)) {
      newErrors.streetNumber = "El número debe ser válido";
    }
    
    if (!formData.province) {
      newErrors.province = "Debes seleccionar una provincia";
    }
    
    if (formData.city.length < 2) {
      newErrors.city = "La ciudad debe tener al menos 2 caracteres";
    }
    
    if (!validateZipCode(formData.zipCode)) {
      newErrors.zipCode = "El CP debe tener 4 dígitos";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStep2Submit = () => {
    if (validateStep2()) {
      setStep(3);
      setErrors({}); // Limpiar errores al avanzar
    }
  };

  const handleStep3Submit = () => {
    if (validateStep3()) {
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

  return (
    <div className="max-w-lg mx-auto my-10 p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl">
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
            onClick={() => setIsNeroLogin(true)}
            className="w-full py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] transition-transform"
          >
            Continuar con Email
          </button>
          <NeroLogin
           isOpen={isNeroLogin} 
      onClose={() => setIsNeroLogin(false)}
      onLoginSuccess={(user) => {
        // Opcional: Aquí podrías navegar a otra página si quieres
        // navigate('/dashboard');
      }} />
        </div>
      )}

      {/* PASO 2: IDENTIDAD Y CONTACTO */}
      {step === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right">
          <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white mb-6">
            Ingresa tus datos personales
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
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

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <input
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
              />
              <div className="h-5 mt-1">
                {errors.street && (
                  <p className="text-xs text-red-500">{errors.street}</p>
                )}
              </div>
            </div>
            <div>
              <input
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
              />
              <div className="h-5 mt-1">
                {errors.streetNumber && (
                  <p className="text-xs text-red-500">{errors.streetNumber}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <select
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.province 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white appearance-none`}
                value={formData.province}
                onChange={(e) =>
                  setFormData({ ...formData, province: e.target.value })
                }
              >
                <option value="">Provincia</option>
                {PROVINCIAS_AR.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <div className="h-5 mt-1">
                {errors.province && (
                  <p className="text-xs text-red-500">{errors.province}</p>
                )}
              </div>
            </div>
            
            <div>
              <input
                placeholder="Ciudad"
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.city 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white`}
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
              />
              <div className="h-5 mt-1">
                {errors.city && (
                  <p className="text-xs text-red-500">{errors.city}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                placeholder="Código Postal"
                className={`w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border ${
                  errors.zipCode 
                    ? 'border-red-500' 
                    : 'border-zinc-200 dark:border-zinc-700'
                } outline-none focus:border-[#F26722] dark:text-white`}
                value={formData.zipCode}
                onChange={(e) => handleZipCodeChange(e.target.value)}
              />
              <div className="h-5 mt-1">
                {errors.zipCode && (
                  <p className="text-xs text-red-500">{errors.zipCode}</p>
                )}
              </div>
            </div>
            
            <input
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
              {isSubmitting ? "Guardando..." : "Confirmar Orden"}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
