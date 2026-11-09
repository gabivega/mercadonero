import { useState } from "react";
import Swal from "sweetalert2";
import PostalCodeInput from "./PostalCodeInput";
import {
  X,
  ShieldCheck,
  Store,
  Loader2,
  ArrowLeft,
  ArrowRight,
  User,
  Check,
  Clock,
} from "lucide-react";
import { usePrivy } from "../Utils/authClient";
import axios from "axios";
import { isValidPhone } from "../Utils/crossmintWallet";

/**
 * Modal de ONBOARDING VENDEDOR (WAITING LIST) / EDITAR TIENDA.
 *
 * - Modo "onboarding": es el MURO DE ENTRADA para vender. En esta etapa las
 *   publicaciones estan limitadas a tiendas invitadas. Se muestra ANTES de los
 *   formularios de publicacion: sin pasar por aca (y sin aprobacion del admin)
 *   el vendedor no puede cargar nada. Pasos:
 *     1. Datos basicos de usuario.
 *     2. Datos de la tienda.
 *   Se ELIMINO el paso de datos bancarios: la cuenta bancaria se administra
 *   desde el perfil (BankAccountSection). Al terminar, la tienda queda en
 *   LISTA DE ESPERA (shop.active=true + shop.approved=false) hasta que un admin
 *   la habilite. No se reintenta publicar: primero hay que ser aprobado.
 *
 * - Modo "edit": edita los datos de la tienda (mismos 2 pasos). Al terminar
 *   solo cierra el modal.
 */
export default function SellerOnboarding({
  isOpen,
  onClose,
  onComplete,
  prefill = {},
  mode = "onboarding",
}) {
  const { getAccessToken } = usePrivy();
  const isEdit = mode === "edit";
  const maxStep = 2;
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  // Error de formato del telefono (se muestra inline bajo el input).
  const [phoneError, setPhoneError] = useState("");

  // -- Estado del formulario (datos de usuario + tienda, sin bancarios) --
  const [form, setForm] = useState({
    firstName: prefill.firstName || "",
    lastName: prefill.lastName || "",
    dni: prefill.dni || "",
    phone: prefill.phone || "",
    shopName: prefill.shopName || "",
    shopDescription: prefill.shopDescription || "",
    province: prefill.province || "",
    city: prefill.city || "",
    zipCode: prefill.zipCode || "",
  });

  if (!isOpen) return null;

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // -- TELEFONO -- Antes el input aceptaba CUALQUIER texto y sin limite de longitud.
  // Ahora sanitizamos al tipear (solo digitos/espacios/+ - ()) y validamos el
  // FORMATO con isValidPhone (E.164 de crossmintWallet) al avanzar/guardar.
  const PHONE_MAX_LEN = 20;
  const handlePhoneChange = (e) => {
    let clean = e.target.value.replace(/[^\d\s+\-()]/g, "");
    if (clean.length > PHONE_MAX_LEN) clean = clean.slice(0, PHONE_MAX_LEN);
    setForm((prev) => ({ ...prev, phone: clean }));
    if (phoneError) setPhoneError("");
  };

  // -- Navegacion entre pasos --
  const goNext = () => setStep((s) => Math.min(s + 1, maxStep));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  // Validacion simple del paso antes de avanzar.
  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      return Boolean(form.firstName.trim() && form.lastName.trim() && form.dni.trim() && form.phone.trim());
    }
    if (currentStep === 2) {
      return Boolean(form.shopName.trim() && form.province && form.city.trim() && form.zipCode.trim());
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(step)) return;
    setIsSaving(true);

    // Payload comun (sin datos bancarios en ningun caso).
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      dni: form.dni,
      phone: form.phone,
      shopName: form.shopName,
      shopDescription: form.shopDescription,
      city: form.city,
      province: form.province,
      zipCode: form.zipCode,
    };

    try {
      const token = await getAccessToken();

      if (isEdit) {
        // MODO EDITAR: solo actualiza tienda + datos de usuario.
        const { data } = await axios.put(
          `${import.meta.env.VITE_SERVER_URL}/api/user/shop`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (data.success) {
          Swal.fire({
            title: "Tienda actualizada",
            text: "Los datos de tu tienda quedaron guardados.",
            icon: "success",
            background: "#1A1A1A",
            color: "#ffffff",
            confirmButtonColor: "#2563eb",
            customClass: { popup: "rounded-3xl border border-gray-800" },
            timer: 1500,
            showConfirmButton: false,
          });
          onClose();
        }
      } else {
        // MODO ONBOARDING (waiting list): deja la tienda en lista de espera.
        const { data } = await axios.post(
          `${import.meta.env.VITE_SERVER_URL}/api/user/seller-onboarding`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (data.success) {
          Swal.fire({
            title: "Ya estas en la lista de espera",
            html:
              '<p style="font-size:14px;line-height:1.5">Seras notificado cuando estes habilitado para vender en <b>Mercado Nero</b>.</p>' +
              '<p style="font-size:12px;line-height:1.5;margin-top:10px;opacity:.7">Mientras tanto podes explorar y comprar como siempre.</p>',
            icon: "success",
            background: "#1A1A1A",
            color: "#ffffff",
            confirmButtonColor: "#2563eb",
            confirmButtonText: "Entendido",
            customClass: { popup: "rounded-3xl border border-gray-800" },
          });
          // El vendedor NO puede publicar hasta que un admin lo habilite:
          // no reintentamos ningun submit. Avisamos al caller si le interesa.
          onComplete?.();
          onClose();
        }
      }
    } catch (error) {
      const err = error.response?.data;
      const field = err?.field;
      const msg =
        err?.message ||
        (error.response?.status === 500
          ? "Hubo un problema al guardar en el servidor. Revisa que los datos esten completos e intenta de nuevo."
          : "No se pudieron guardar tus datos. Intenta de nuevo.");

      // Resaltamos el campo con error (si el backend indica cual).
      if (field) {
        const el = document.getElementById(`field-${field}`);
        el?.focus();
        el?.classList.add("ring-2", "ring-red-500", "border-red-500");
        setTimeout(() => el?.classList.remove("ring-2", "ring-red-500"), 2500);
      }

      Swal.fire({
        title: "Ups",
        text: msg,
        icon: "error",
        background: "#1A1A1A",
        color: "#ffffff",
        confirmButtonColor: "#2563eb",
        customClass: { popup: "rounded-3xl border border-gray-800" },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls =
    "w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white focus:outline-none focus:border-blue-500 transition-colors";
  const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 inline-block";

  const stepsMeta = [
    { n: 1, label: "Tus datos", icon: User },
    { n: 2, label: "Tu tienda", icon: Store },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSaving && onClose()} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#1A1A1A] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1A1A1A] border-b border-gray-100 dark:border-gray-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/10 flex items-center justify-center">
              <ShieldCheck className="text-blue-500" size={22} />
            </div>
            <div>
              <h3 className="font-black text-lg dark:text-white leading-tight">
                {isEdit ? "Edita los datos de tu tienda" : "Queremos conocerte para habilitarte a vender"}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {isEdit
                  ? "Actualiza tu usuario y la informacion publica de tu tienda."
                  : "Vender en Mercado Nero es por invitacion. Completa tus datos y sumate a la lista de espera."}
              </p>
            </div>
          </div>
          <button
            onClick={() => !isSaving && onClose()}
            disabled={isSaving}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Indicador de pasos */}
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between">
            {stepsMeta.map((s, i) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => done && setStep(s.n)}
                    className={`flex flex-col items-center gap-1 ${done ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        active
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                          : done
                          ? "bg-green-500 text-white"
                          : "bg-gray-100 dark:bg-white/5 text-gray-400"
                      }`}
                    >
                      {done ? <Check size={16} /> : <Icon size={16} />}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`}>
                      {s.label}
                    </span>
                  </button>
                  {i < stepsMeta.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full ${step > s.n ? "bg-green-500" : "bg-gray-200 dark:bg-white/10"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Aviso / lista de espera */}
        <div className="mx-5 mt-4 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-2.5">
          {isEdit ? (
            <ShieldCheck size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          ) : (
            <Clock size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-[11px] text-blue-600 dark:text-blue-400">
            {isEdit ? (
              <>
                Tus <b>datos bancarios</b> no se modifican aca: se administran desde tu{" "}
                <b>Perfil</b>.
              </>
            ) : (
              <>
                Al enviar tus datos, tu tienda entra en la <b>lista de espera</b>. Un administrador
                la revisara y <b>seras notificado cuando estes habilitado para vender</b>.
              </>
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {/* PASO 1: DATOS DE USUARIO */}
          {step === 1 && (
            <section className="animate-in fade-in slide-in-from-left-4 duration-300">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                Tus datos
                {prefill.firstName && <span className="normal-case font-medium text-green-500">(ya tenemos estos datos)</span>}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nombre *</label>
                  <input id="field-firstName" className={inputCls} placeholder="Nombre" value={form.firstName} onChange={set("firstName")} required />
                </div>
                <div>
                  <label className={labelCls}>Apellido *</label>
                  <input id="field-lastName" className={inputCls} placeholder="Apellido" value={form.lastName} onChange={set("lastName")} required />
                </div>
                <div>
                  <label className={labelCls}>DNI *</label>
                  <input id="field-dni" className={inputCls} placeholder="DNI sin puntos" value={form.dni} onChange={set("dni")} inputMode="numeric" required />
                </div>
                <div>
                  <label className={labelCls}>Telefono *</label>
                  <input
                    id="field-phone"
                    className={inputCls}
                    placeholder="Ej: +54 9 11 5555 1234"
                    value={form.phone}
                    onChange={handlePhoneChange}
                    inputMode="tel"
                    maxLength={PHONE_MAX_LEN}
                    aria-invalid={Boolean(phoneError)}
                    required
                  />
                  {phoneError && (
                    <p className="text-xs text-red-500 mt-1">{phoneError}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* PASO 2: DATOS DE LA TIENDA */}
          {step === 2 && (
            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                Tu tienda
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nombre de la tienda *</label>
                  <input id="field-shopName" className={inputCls} placeholder="Ej: Tienda de Gabi" value={form.shopName} onChange={set("shopName")} required />
                </div>
                <div className="sm:col-span-2">
                  <PostalCodeInput
                    zipCode={form.zipCode}
                    province={form.province}
                    city={form.city}
                    cityAsSelect
                    labels={{ city: "Ciudad / Partido de despacho *" }}
                    onChange={({ zipCode, province, city }) =>
                      setForm((prev) => ({
                        ...prev,
                        ...(zipCode !== undefined ? { zipCode } : {}),
                        ...(province !== undefined ? { province } : {}),
                        ...(city !== undefined ? { city } : {}),
                      }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Descripcion de la tienda (opcional)</label>
                  <textarea className={inputCls} rows="2" placeholder="Conta un poco que vendes..." value={form.shopDescription} onChange={set("shopDescription")} />
                </div>
              </div>
            </section>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                <ArrowLeft size={16} /> Anterior
              </button>
            ) : (
              <button
                type="button"
                onClick={() => !isSaving && onClose()}
                disabled={isSaving}
                className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
            )}

            {step < maxStep ? (
              <button
                type="button"
                onClick={() => validateStep(step) && goNext()}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
              >
                Siguiente <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Guardando...
                  </>
                ) : isEdit ? (
                  <>
                    <Store size={15} /> Guardar cambios
                  </>
                ) : (
                  <>
                    <Clock size={15} /> Unirme a la lista
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
