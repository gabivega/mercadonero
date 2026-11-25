// frontend/src/pages/Contacto.jsx
//
// ────────────────────────────────────────────────────────────────────────────
// CONTACTO + BOTÓN DE ARREPENTIMIENTO
// ────────────────────────────────────────────────────────────────────────────
// Una sola página con dos modos (se elige por el query param `?motivo=refund`
// o por el selector de motivo del formulario):
//
//   1. "contact" → Ayuda y contacto general.
//   2. "refund"  → Botón de Arrepentimiento (Ley 24.240, AR): el consumidor
//                  tiene 10 días corridos desde que recibe el producto para
//                  revocar la compra, sin costo y sin expresión de causa.
//
// ¿Por qué un formulario y no un `mailto:`? El mailto depende de que el
// usuario tenga cliente de correo configurado (falla seguido en mobile) y deja
// nuestra casilla expuesta al scraping. Acá el backend recibe el mensaje y lo
// manda al admin por mail (Resend) + Telegram.
//
// El backend valida igual: email válido, mensaje ≥10 caracteres y, en modo
// arrepentimiento, número de orden. Este form replica esas reglas para dar
// feedback inmediato sin round-trip.
// ────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Mail, ShieldAlert, Send, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { useUserStore } from "../store/useUserStore";
import { useAuth } from "../Utils/authClient";

const serverUrl = import.meta.env.VITE_SERVER_URL;

// Clases compartidas por todos los inputs del formulario. Se declaran acá (y no
// como `.input-base` en CSS) para no tocar la capa de estilos global.
const INPUT_CLASS =
  "w-full bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 " +
  "rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-zinc-100 outline-none " +
  "transition-colors focus:ring-2 focus:ring-[#F26722]/40 focus:border-[#F26722] " +
  "placeholder-gray-400 dark:placeholder-zinc-500";

export default function Contacto() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { dbUser } = useUserStore();
  const { authenticated, user } = useAuth();

  // Modo inicial según la URL: /contacto?motivo=refund → arrepentimiento.
  const initialKind = searchParams.get("motivo") === "refund" ? "refund" : "contact";
  const [kind, setKind] = useState(initialKind);

  // Prefill con datos de la sesión (si está logueado). El usuario puede
  // editarlos: permitimos escribir en nombre de otra persona (p. ej. alguien
  // que compró con otro mail).
  const prefilledEmail = useMemo(
    () => (authenticated ? user?.email || dbUser?.email || "" : dbUser?.email || ""),
    [authenticated, user?.email, dbUser?.email],
  );
  const prefilledName = useMemo(
    () =>
      [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ") ||
      dbUser?.name ||
      "",
    [dbUser?.firstName, dbUser?.lastName, dbUser?.name],
  );

  const [form, setForm] = useState({
    name: prefilledName,
    email: prefilledEmail,
    phone: "",
    orderId: "",
    purchaseDate: "",
    subject: "",
    message: "",
  });

  // Si la sesión carga después del primer render, completamos lo que esté vacío.
  // No pisamos lo que el usuario ya escribió.
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      email: prev.email || prefilledEmail,
      name: prev.name || prefilledName,
    }));
  }, [prefilledEmail, prefilledName]);

  // Mantenemos la URL sincronizada con el modo elegido, así se puede compartir
  // el link directo al botón de arrepentimiento.
  const changeKind = (next) => {
    setKind(next);
    if (next === "refund") setSearchParams({ motivo: "refund" });
    else setSearchParams({});
  };

  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [feedback, setFeedback] = useState("");

  const setField = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  // Validación local mínima (el backend revalida todo).
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  const messageOk = form.message.trim().length >= 10;
  const orderOk = kind !== "refund" || form.orderId.trim().length > 0;
  const canSubmit = emailOk && messageOk && orderOk && status !== "sending";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    setFeedback("");
    try {
      const { data } = await axios.post(`${serverUrl}/api/contact`, {
        kind,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        orderId: form.orderId.trim(),
        purchaseDate: form.purchaseDate.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setStatus("success");
      setFeedback(data?.message || "¡Listo! Recibimos tu mensaje.");
    } catch (err) {
      setStatus("error");
      setFeedback(
        err?.response?.data?.message ||
          "No pudimos enviar el mensaje. Revisá tu conexión e intentá de nuevo.",
      );
    }
  };

  const isRefund = kind === "refund";

  return (
    <section className="w-full py-12 px-4 bg-gray-50 dark:bg-zinc-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/ayuda"
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-zinc-400 hover:text-[#F26722] mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Ayuda
        </Link>

        {/* Encabezado */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-orange-50 dark:bg-orange-950/20 text-[#F26722] rounded-2xl mb-4">
            {isRefund ? (
              <ShieldAlert className="w-6 h-6 stroke-[2]" />
            ) : (
              <Mail className="w-6 h-6 stroke-[2]" />
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-3">
            {isRefund ? "Botón de Arrepentimiento" : "Ayuda y contacto"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
            {isRefund
              ? "Si te arrepentiste de una compra, tenés derecho a revocarla. Completá el formulario y nuestro equipo te va a contactar para gestionar la devolución."
              : "Escribinos por cualquier consulta sobre tu compra, tu cuenta o el funcionamiento de la plataforma. Respondemos a la brevedad."}
          </p>
        </div>

        {/* Selector de motivo */}
        <div className="flex gap-2 p-1 mb-6 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl">
          <button
            type="button"
            onClick={() => changeKind("contact")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              !isRefund
                ? "bg-[#F26722] text-white"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
          >
            Consulta general
          </button>
          <button
            type="button"
            onClick={() => changeKind("refund")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              isRefund
                ? "bg-[#F26722] text-white"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
          >
            Arrepentimiento
          </button>
        </div>

        {status === "success" ? (
          <div className="bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-900/40 rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Mensaje enviado
            </h3>
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6">{feedback}</p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setForm((p) => ({ ...p, message: "", orderId: "", purchaseDate: "" }));
              }}
              className="px-6 py-2.5 rounded-xl bg-[#F26722] text-white text-sm font-bold hover:bg-[#d9591a] transition-colors"
            >
              Enviar otro mensaje
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-6 space-y-4"
          >
            {/* Aviso legal del derecho de revocación */}
            {isRefund && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  <strong>Ley 24.240 (Defensa del Consumidor):</strong> tenés 10 días
                  corridos desde la recepción del producto para arrepentirte de la
                  compra, sin costo y sin expresión de causa. La devolución se coordina
                  con el vendedor.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nombre y apellido">
                <input
                  type="text"
                  value={form.name}
                  onChange={setField("name")}
                  placeholder="Cómo te llamás"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Email" required>
                <input
                  type="email"
                  value={form.email}
                  onChange={setField("email")}
                  placeholder="tu@email.com"
                  className={INPUT_CLASS}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Teléfono (opcional)">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={setField("phone")}
                  placeholder="11 5555-5555"
                  className={INPUT_CLASS}
                />
              </Field>
              {isRefund ? (
                <Field label="N° de orden" required>
                  <input
                    type="text"
                    value={form.orderId}
                    onChange={setField("orderId")}
                    placeholder="Ej: 64F2A1"
                    className={INPUT_CLASS}
                    required
                  />
                </Field>
              ) : (
                <Field label="Asunto">
                  <input
                    type="text"
                    value={form.subject}
                    onChange={setField("subject")}
                    placeholder="Motivo de tu consulta"
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
            </div>

            {isRefund && (
              <Field label="Fecha de compra (opcional)">
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={setField("purchaseDate")}
                  className={INPUT_CLASS}
                />
              </Field>
            )}

            <Field
              label={isRefund ? "Contanos el motivo (opcional)" : "Mensaje"}
              required={!isRefund}
            >
              <textarea
                value={form.message}
                onChange={setField("message")}
                rows={5}
                placeholder={
                  isRefund
                    ? "Podés detallar por qué querés revocar la compra."
                    : "Contanos en qué podemos ayudarte (mínimo 10 caracteres)."
                }
                className={`${INPUT_CLASS} resize-y`}
                required={!isRefund}
              />
            </Field>

            {status === "error" && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                {feedback}
              </p>
            )}

            <div className="flex items-center justify-between gap-4 pt-2">
              <p className="text-[11px] text-gray-400 dark:text-zinc-500">
                Tu mensaje llega directo a nuestro equipo. No compartimos tus datos.
              </p>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F26722] text-white text-sm font-bold hover:bg-[#d9591a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Enviar
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-[11px] text-gray-400 dark:text-zinc-500 mt-6">
          ¿Tenés un problema con una compra en curso? No verifiques la entrega y abrí
          una disputa desde el detalle de la orden para resguardar los fondos.
        </p>
      </div>
    </section>
  );
}

/** Envoltorio chico para etiqueta + input, con el `<label>` accesible. */
function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5">
        {label} {required && <span className="text-[#F26722]">*</span>}
      </span>
      {children}
    </label>
  );
}
