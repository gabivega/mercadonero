import React, { useState } from "react";
import { Mail, ArrowRight, X, CheckCircle2 } from "lucide-react";
import Swal from "sweetalert2";
import { supabase } from "../Utils/supabaseClient";
import LoadingSpinner from "./LoadingSpinner";

/**
 * Traduce los errores comunes de Supabase Auth al español.
 *
 * Supabase devuelve mensajes en inglés. El más frecuente es el rate-limit del
 * magic link:
 *   "For security purposes, you can only request this after 23 seconds."
 * Lo convertimos a un mensaje claro en español con los segundos restantes.
 *
 * @param {Error|{message?:string, status?:number}} error
 * @returns {string} mensaje legible en español
 */
function translateAuthError(error) {
  const raw = String(error?.message || "").trim();

  // Rate limit del envío de magic link / OTP.
  // "For security purposes, you can only request this after 23 seconds."
  const rateMatch = raw.match(/after (\d+)\s*seconds?/i);
  if (rateMatch) {
    const secs = Number(rateMatch[1]);
    const tiempo =
      secs >= 60
        ? `${Math.ceil(secs / 60)} minuto${Math.ceil(secs / 60) > 1 ? "s" : ""}`
        : `${secs} segundo${secs === 1 ? "" : "s"}`;
    return `Por seguridad, esperá ${tiempo} antes de volver a pedir el enlace.`;
  }

  // Otros errores puntuales traducidos.
  if (/rate limit|too many requests/i.test(raw)) {
    return "Hiciste demasiados intentos. Esperá un momento antes de reintentar.";
  }
  if (/invalid email/i.test(raw)) {
    return "El email no es válido. Verificá e intentá de nuevo.";
  }
  if (/signups not allowed|user not found/i.test(raw)) {
    return "No pudimos enviarte el enlace a ese email.";
  }

  // Fallback: mensaje original, o uno genérico en español.
  return raw || "No pudimos enviar el enlace. Verificá el email e intentá de nuevo.";
}

/**
 * SupabaseLogin
 * -------------
 * Modal de autenticación con Supabase (reemplaza a NeroLogin de Privy).
 * Métodos habilitados:
 *   1. Magic link (email)   → supabase.auth.signInWithOtp({ email })
 *   2. Google OAuth         → supabase.auth.signInWithOAuth({ provider: "google" })
 *
 * Flujo: el usuario elige un método; Supabase gestiona la sesión y el listener
 * de `AuthProvider` (onAuthStateChange) actualiza el estado global, disparando
 * la sincronización con Mongo (useSyncUser).
 *
 * Props:
 *   - isOpen: bool
 *   - onClose: fn
 *   - onLoginSuccess?: fn(user)  (compatibilidad con el uso anterior)
 *   - redirectTo?: string        (a dónde vuelve tras el magic link / OAuth)
 */
export default function SupabaseLogin({
  isOpen,
  onClose,
  onLoginSuccess,
  redirectTo,
}) {
  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!isOpen) return null;

  const redirectUrl = redirectTo || window.location.origin;

  // ── Magic link (email OTP) ──
  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;
      setIsSent(true);
    } catch (error) {
      Swal.fire({
        title: "No se pudo enviar el enlace",
        text: translateAuthError(error),
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google OAuth ──
  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
      // El navegador redirige a Google; no hace falta más acá.
    } catch (error) {
      setIsGoogleLoading(false);
      Swal.fire({
        title: "No se pudo iniciar sesión",
        text: translateAuthError(error),
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
        confirmButtonColor: "#F26722",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="text-zinc-500" size={20} />
        </button>

        {isSent ? (
          <div className="text-center py-10 space-y-4 animate-in zoom-in">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="text-green-500 w-12 h-12" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">
              Revisá tu correo
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              Te enviamos un enlace a <strong>{email}</strong>.<br /> Hacé clic
              en él para ingresar a Mercado Nero.
            </p>
            <button
              type="button"
              onClick={() => setIsSent(false)}
              className="text-xs text-zinc-500 uppercase font-bold hover:text-[#F26722] transition-colors"
            >
              Usar otro email
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-8 pt-4">
              <div className="w-16 h-16 bg-[#F26722]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="text-[#F26722]" size={30} />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">
                Ingresar a Mercado Nero
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">
                Accedé para comprar, vender y operar
              </p>
            </div>

            {/* Magic link */}
            <form onSubmit={handleSendMagicLink} className="space-y-4">
              <input
                type="email"
                placeholder="tu@email.com"
                className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-none outline-none focus:ring-2 ring-[#F26722] dark:text-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex flex-row items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    Continuar con email <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Separador */}
            <div className="flex items-center gap-4 my-6">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-[11px] uppercase font-bold text-zinc-400">
                o
              </span>
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isGoogleLoading}
              className="w-full py-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-white rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <GoogleIcon />
                  Continuar con Google
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-zinc-400 dark:text-zinc-500 leading-normal px-2 pt-5">
              Al hacer clic en continuar, aceptás los{" "}
              <a
                href="/terminos-y-condiciones"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-[#F26722] transition-colors"
              >
                Términos y Condiciones
              </a>{" "}
              y la{" "}
              <a
                href="/politica-de-privacidad"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-[#F26722] transition-colors"
              >
                Política de Privacidad
              </a>{" "}
              de Mercado Nero.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Ícono de Google (SVG inline para no sumar dependencias). */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}
