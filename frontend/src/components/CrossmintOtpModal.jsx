/**
 * components/CrossmintOtpModal.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Modal que maneja el flujo de OTP del EMAIL SIGNER de Crossmint.
 *
 * Se monta UNA sola vez (en App.jsx). Escucha el `crossmintOtpBridge` y, cuando
 * el SDK requiere autenticación por email para firmar, muestra:
 *   1. Botón "Enviar código"  → sendOtpNow()
 *   2. Input del OTP          → submitOtp(code)
 *   3. Botón cancelar         → cancelAuth()
 *
 * No renderiza nada si no hay autenticación pendiente.
 *
 * NOTA sobre el doble OTP: con el caché de wallet en crossmintWallet.js, una
 * operación que hace approve + deposit debería pedir el OTP una sola vez por
 * sesión de dispositivo. Si igual aparece dos veces, revisar el device signer.
 */
import { useEffect, useRef, useState } from "react";
import {
  subscribe,
  sendOtpNow,
  submitOtp,
  cancelAuth,
} from "../Utils/crossmintOtpBridge";

const INITIAL = {
  active: false,
  signerType: null,
  signerLocator: null,
  channel: null,
  needsAuth: false,
  otpSent: false,
  verifying: false,
  error: null,
};

/** Devuelve los textos del modal según el canal (email / sms / whatsapp). */
function getCopy(signerType, channel) {
  if (signerType === "phone") {
    const via =
      channel === "whatsapp" ? "WhatsApp" : "mensaje de texto (SMS)";
    return {
      intro: `Para firmar esta operación de forma segura, vamos a confirmar tu identidad enviándote un código por ${via}. Es un código de verificación de nuestro proveedor de pagos.`,
      sendCta: `Enviar código por ${channel === "whatsapp" ? "WhatsApp" : "SMS"}`,
      resent: `Reenvía el código e ingresalo en el campo de abajo.`,
    };
  }
  return {
    intro:
      "Para firmar esta operación de forma segura, vamos a confirmar tu identidad enviándote un código por email. Es un código de verificación de nuestro proveedor de pagos. Ingresalo en el campo de abajo para continuar.",
    sendCta: "Enviar código por email",
    resent: "Reenvía el código e ingresalo en el campo de abajo.",
  };
}

export default function CrossmintOtpModal() {
  const [state, setState] = useState(INITIAL);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  // Suscripción al bridge.
  useEffect(() => subscribe(setState), []);

  // Autofoco del input cuando ya se envió el OTP.
  useEffect(() => {
    if (state.active && state.otpSent && !state.verifying) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [state.active, state.otpSent, state.verifying]);

  // Al cerrarse el flujo, reseteamos el input y el flag de envío.
  useEffect(() => {
    if (!state.active) {
      setCode("");
      setSending(false);
    }
  }, [state.active]);

  if (!state.active) return null;

  const copy = getCopy(state.signerType, state.channel);

  const handleSendOtp = async () => {
    setSending(true);
    try {
      await sendOtpNow();
    } catch (err) {
      console.error("[CrossmintOtpModal] sendOtp error:", err);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e) => {
    e?.preventDefault?.();
    if (!code.trim() || state.verifying) return;
    // No limpiamos el input acá: si falla, el usuario lo corrige; si acierta,
    // el bridge cierra el modal y el useEffect de reset limpia el code.
    await submitOtp(code);
  };

  const handleCancel = () => {
    cancelAuth();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#252525] shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-black dark:text-white">
          Verificación de seguridad
        </h2>
        <p className="text-sm text-gray-500 mt-1">{copy.intro}</p>

        {!state.otpSent ? (
          <div className="mt-5">
            <button
              onClick={handleSendOtp}
              disabled={sending}
              className="w-full py-3 bg-[#F26722] hover:brightness-110 text-white rounded-xl font-bold disabled:opacity-50"
            >
              {sending ? "Enviando código..." : copy.sendCta}
            </button>
            <p className="text-[11px] text-gray-400 mt-2 text-center">
              ¿No ves el código? Revisá {state.signerType === "phone" ? "tus mensajes" : "tu correo y la carpeta de spam"}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="mt-5 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
              Código recibido
            </label>
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              disabled={state.verifying}
              className="w-full text-center tracking-[0.4em] text-xl font-mono px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1f1f1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F26722] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={state.verifying || !code.trim()}
              className="w-full py-3 bg-[#F26722] hover:brightness-110 text-white rounded-xl font-bold disabled:opacity-50"
            >
              {state.verifying ? "Verificando..." : "Verificar y firmar"}
            </button>
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sending || state.verifying}
              className="w-full text-xs text-gray-500 hover:text-[#F26722] underline disabled:opacity-50"
            >
              {sending ? "Reenviando..." : "Reenviar código"}
            </button>
          </form>
        )}

        {state.error && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm">
            {state.error}
          </div>
        )}

        <button
          onClick={handleCancel}
          disabled={state.verifying}
          className="mt-5 w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
