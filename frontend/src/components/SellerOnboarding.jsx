import { useState } from "react";
import Swal from "sweetalert2";
import {
  X,
  ShieldCheck,
  Landmark,
  CreditCard,
  Store,
  Loader2,
  ArrowLeft,
  ArrowRight,
  User,
  Check,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";

/**
 * Modal de ONBOARDING VENDEDOR (3 pasos) / EDITAR TIENDA (2 pasos).
 *
 * - Modo "onboarding": se abre cuando el usuario intenta publicar un producto
 *   de pago (escrow) sin haber completado sus datos. Al terminar, llama a
 *   onComplete(draft) para que el caller reintente el submit del producto.
 *   Pasos: 1. Datos de usuario · 2. Datos de la tienda · 3. Datos bancarios.
 *
 * - Modo "edit": se abre desde "Mis publicaciones" para que el vendedor edite
 *   los datos de su tienda. SOLO edita los pasos 1 y 2 (usuario + tienda).
 *   El paso 3 (cuentas bancarias) se OMITE para no duplicar ni pisar la cuenta
 *   que ya se administra desde el perfil (BankAccountSection, fuente de verdad).
 *   Al terminar solo cierra el modal (no reintenta ninguna publicación).
 */
export default function SellerOnboarding({
  isOpen,
  onClose,
  onComplete,
  draft,
  prefill = {},
  mode = "onboarding",
}) {
  const { getAccessToken } = usePrivy();
  const isEdit = mode === "edit";
  const maxStep = isEdit ? 2 : 3;
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Provincias argentinas para el selector de ubicación de la tienda.
  const PROVINCIAS_AR = [
    "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
    "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
    "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
    "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego",
    "Tucumán",
  ];

  // ── Estado del formulario ──
  const [form, setForm] = useState({
    // Datos de usuario (reutilizamos lo que ya tenga el perfil)
    firstName: prefill.firstName || "",
    lastName: prefill.lastName || "",
    dni: prefill.dni || "",
    phone: prefill.phone || "",
    // Datos bancarios
    bankName: prefill.bankName || "",
    cbuCvu: prefill.cbuCvu || "",
    alias: prefill.alias || "",
    holderName: prefill.holderName || "",
    cuitCuil: prefill.cuitCuil || "",
    // Datos de tienda
    shopName: prefill.shopName || "",
    shopDescription: prefill.shopDescription || "",
    province: prefill.province || "",
    city: prefill.city || "",
    zipCode: prefill.zipCode || "",
  });

  if (!isOpen) return null;

  // ── Detección automática CBU vs CVU ──
  // 22 dígitos → CBU (cuenta bancaria) · 23 dígitos → CVU (billetera virtual).
  const cbuCvuDigits = (form.cbuCvu || "").replace(/\D/g, "");
  const detectedType = cbuCvuDigits.length === 23 ? "CVU" : "CBU";

  // El número bancario no permite más de 23 dígitos.
  const handleCbuCvuChange = (e) => {
    const clean = e.target.value.replace(/\D/g, "");
    if (clean.length > 23) return;
    setForm((prev) => ({ ...prev, cbuCvu: clean }));
  };

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ── Navegación entre pasos ──
  const goNext = () => setStep((s) => Math.min(s + 1, maxStep));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  // Validación simple del paso antes de avanzar.
  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      return form.firstName.trim() && form.lastName.trim() && form.dni.trim() && form.phone.trim();
    }
    if (currentStep === 2) {
      return form.shopName.trim() && form.province && form.city.trim() && form.zipCode.trim();
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    // En modo edición NO enviamos datos bancarios: el endpoint /api/user/shop
    // actualiza solo la tienda y los datos de usuario, sin tocar las cuentas
    // bancarias (que se administran desde el perfil).
    if (isEdit) {
      const payloadEdit = {
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
        const { data } = await axios.put(
          `${import.meta.env.VITE_SERVER_URL}/api/user/shop`,
          payloadEdit,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (data.success) {
          Swal.fire({
            title: "¡Tienda actualizada!",
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
      } catch (error) {
        const err = error.response?.data;
        const field = err?.field;
        const msg = err?.message || "No se pudieron guardar los datos de la tienda. Intentá de nuevo.";

        if (field) {
          const el = document.getElementById(`field-${field}`);
          el?.focus();
          el?.classList.add("ring-2", "ring-red-500", "border-red-500");
          setTimeout(() => el?.classList.remove("ring-2", "ring-red-500"), 2500);
        }

        Swal.fire({
          title: "¡Ups!",
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
      return;
    }

    // ── Modo ONBOARDING (enviar también datos bancarios) ──
    // El backend sabe diferenciar CBU/CVU por la cantidad de dígitos
    // (22 → CBU, 23 → CVU). Ya no enviamos accountNumberType.
    const payload = {
      ...form,
      cbuCvu: cbuCvuDigits,
    };
    try {
      const token = await getAccessToken();
      const { data } = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/user/seller-onboarding`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        Swal.fire({
          title: "¡Todo listo!",
          text: "Tus datos quedaron guardados. Seguimos con tu publicación.",
          icon: "success",
          background: "#1A1A1A",
          color: "#ffffff",
          confirmButtonColor: "#2563eb",
          customClass: { popup: "rounded-3xl border border-gray-800" },
          timer: 1500,
          showConfirmButton: false,
        });
        // Cerramos el modal y reintentamos el submit con el draft guardado.
        onComplete(draft);
      }
    } catch (error) {
      const err = error.response?.data;
      const field = err?.field;
      const msg = err?.message || "No se pudieron guardar tus datos. Intentá de nuevo.";

      // Resaltamos el campo con error
      if (field) {
        const el = document.getElementById(`field-${field}`);
        el?.focus();
        el?.classList.add("ring-2", "ring-red-500", "border-red-500");
        setTimeout(() => el?.classList.remove("ring-2", "ring-red-500"), 2500);
      }

      Swal.fire({
        title: "¡Ups!",
        text: msg,
        icon: field === "cbuCvu" || field === "cuitCuil" ? "warning" : "error",
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
    { n: 1, label: "Datos de usuario", icon: User },
    { n: 2, label: "Tu tienda", icon: Store },
    ...(!isEdit ? [{ n: 3, label: "Datos bancarios", icon: CreditCard }] : []),
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
                {isEdit ? "Editá los datos de tu tienda" : "Completá tus datos para poder publicar"}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {isEdit
                  ? "Actualizá tu usuario y la información pública de tu tienda."
                  : "No compartiremos tus datos con nadie."}
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

        {/* Seguridad / Aviso */}
        <div className="mx-5 mt-4 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-2.5">
          <ShieldCheck size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-600 dark:text-blue-400">
            {isEdit ? (
              <>
                Tus <b>datos bancarios</b> no se modifican acá: se administran desde tu{" "}
                <b>Perfil</b> para mantener una única fuente de verdad y evitar cuentas duplicadas.
              </>
            ) : (
              <>
                Necesitamos esta información para ofrecer una plataforma segura para todos los
                usuarios y evitar el uso de cuentas bancarias de terceros. La titularidad de la
                cuenta debe coincidir con la del vendedor.
              </>
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {/* ══════════ PASO 1: DATOS DE USUARIO ══════════ */}
          {step === 1 && (
            <section className="animate-in fade-in slide-in-from-left-4 duration-300">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                Datos de usuario
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
                  <label className={labelCls}>Teléfono *</label>
                  <input id="field-phone" className={inputCls} placeholder="Ej: 11 5555 1234" value={form.phone} onChange={set("phone")} inputMode="tel" required />
                </div>
              </div>
          </section>
          )}

          {/* ══════════ PASO 2: DATOS DE LA TIENDA ══════════ */}
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
                <div>
                  <label className={labelCls}>Provincia *</label>
                  <select
                    id="field-province"
                    className={inputCls}
                    value={form.province}
                    onChange={set("province")}
                    required
                  >
                    <option value="">Seleccioná tu provincia</option>
                    {PROVINCIAS_AR.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Ciudad *</label>
                  <input id="field-city" className={inputCls} placeholder="Tu ciudad/partido de despacho" value={form.city} onChange={set("city")} required />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Código postal *</label>
                  <input
                    id="field-zipCode"
                    className={inputCls}
                    placeholder="Código postal"
                    value={form.zipCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, zipCode: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    inputMode="numeric"
                    maxLength={4}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Descripción de la tienda (opcional)</label>
                  <textarea className={inputCls} rows="2" placeholder="Contá un poco qué vendés..." value={form.shopDescription} onChange={set("shopDescription")} />
                </div>
              </div>
            </section>
          )}

          {/* ══════════ PASO 3: DATOS BANCARIOS ══════════ */}
          {step === 3 && (
            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px]">3</span>
                Datos bancarios para recibir tus pagos
              </h4>

              <div className="mb-3 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center gap-2.5">
                <Landmark size={16} className="text-blue-500 flex-shrink-0" />
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Detectamos el tipo automáticamente: <b>CBU</b> (22 dígitos) para cuentas bancarias o{" "}
                  <b>CVU</b> (23 dígitos) para billeteras virtuales.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>N° CBU / CVU *</label>
                  <div className="relative">
                    <input
                      id="field-cbuCvu"
                      className={`${inputCls} pr-24 tracking-[0.15em] font-mono`}
                      placeholder="Ingresá tu CBU o CVU"
                      value={form.cbuCvu}
                      onChange={handleCbuCvuChange}
                      inputMode="numeric"
                      required
                    />
                    {cbuCvuDigits.length > 0 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase px-2 py-1 rounded-md bg-blue-600/10 text-blue-600 dark:text-blue-400">
                        {detectedType} · {cbuCvuDigits.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Máx. 23 dígitos · {cbuCvuDigits.length}/23
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Banco / Proveedor *</label>
                  <input id="field-bankName" className={inputCls} placeholder="Ej: Santander, Nación, Mercado Pago..." value={form.bankName} onChange={set("bankName")} required />
                </div>
                <div>
                  <label className={labelCls}>Titular de la cuenta *</label>
                  <input id="field-holderName" className={inputCls} placeholder="Nombre y apellido del titular" value={form.holderName} onChange={set("holderName")} required />
                </div>
                <div>
                  <label className={labelCls}>CUIT/CUIL *</label>
                  <input id="field-cuitCuil" className={inputCls} placeholder="11 dígitos" value={form.cuitCuil} onChange={set("cuitCuil")} inputMode="numeric" required />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Alias (opcional)</label>
                  <input className={inputCls} placeholder="Ej: mis.ventas.alias" value={form.alias} onChange={set("alias")} />
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
                    <Store size={15} /> Guardar y continuar
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
