import React, { useState, useEffect } from "react";
import {
  usePrivy,
  useLoginWithEmail,
  useCreateWallet,
} from "@privy-io/react-auth";
import { Mail, KeyRound, ArrowRight, X, CheckCircle2 } from "lucide-react";
import Swal from "sweetalert2";
import LoadingSpinner from "./LoadingSpinner";

export default function NeroLogin({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = React.useRef([]);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  // Efecto para hacer focus en el primer casillero cuando aparece el formulario de OTP
  useEffect(() => {
    if (isCodeSent && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [isCodeSent]);

  const { createWallet } = useCreateWallet();

  const { loginWithCode, sendCode } = useLoginWithEmail({
    onComplete: async (user, loginMethodMetaData) => {
      // 1. Debug para ver qué nos manda Privy realmente
      // console.log("Privy User Data:", user);
      // console.log("Metadata:", loginMethodMetaData);

      // 2. Lógica Infalible: Si NO hay wallet, intentamos crearla
      if (!user.wallet) {
        try {
          // console.log("No se detectó wallet, intentando crear...");
          await createWallet();
          // console.log("✅ Wallet de Nero generada con éxito");
        } catch (err) {
          // console.warn("Aviso en creación de wallet:", err.message);
        }
      }
      setIsDone(true);

      // SweetAlert de éxito y redirección
      Swal.fire({
        title: "¡SESIÓN INICIADA!",
        text: "Te estamos redirigiendo para que sigas operando en Mercado Nero.",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
        background: "#1A1A1A",
        color: "#fff",
        iconColor: "#F26722",
      }).then(() => {
        if (onLoginSuccess) {
          onLoginSuccess(user);
        } else {
          window.location.reload();
        }
        onClose(); // Cerramos el modal
      });
    },
    onError: (error) => {
      // console.error("Error detectado en Login OTP:", error);

      // 1. Destrabamos el botón apagando el spinner de carga
      if (typeof setIsLoading === "function") {
        setIsLoading(false);
      }

      // 2. Reiniciamos el array del OTP a vacío para que puedan re-intentar al toque
      if (typeof setOtp === "function") {
        setOtp(new Array(6).fill("")); // O la cantidad de dígitos que uses (ej: 6)
      }

      // 3. Forzamos el foco de vuelta al primer input del formulario
      if (inputRefs.current && inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }

      // 4. Mostramos la alerta de error al usuario
      Swal.fire({
        title: "Error de Código",
        text: "El código no es válido o ya expiró. Por favor, intentalo de nuevo.",
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
        confirmButtonColor: "#F26722",
      });
    },
  });

  const handleSendCode = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendCode({ email });
      setIsCodeSent(true);
    } catch (error) {
      Swal.fire(
        "Error",
        "No pudimos enviar el email. Verifica el formato.",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await loginWithCode({ code });
    } catch (error) {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (element, index) => {
    const value = element.value.replace(/\D/g, ""); // Solo números
    if (!value && element.value !== "") return; // Evitar caracteres no numéricos

    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1); // Tomar solo el último dígito
    setOtp(newOtp);

    // Mover al siguiente input si hay valor
    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }

    // Si es el último dígito y está completo, disparar el login
    const finalCode = newOtp.join("");
    if (finalCode.length === 6 && index === 5) {
      setIsLoading(true);
      loginWithCode({ code: finalCode });
    }
  };

  const handleKeyDown = (e, index) => {
    // Manejar el Backspace para volver atrás
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  // Función para manejar el pegado (Paste) de códigos completos
  const handlePaste = (e) => {
    const data = e.clipboardData.getData("text").slice(0, 6).split("");
    if (data.length === 6) {
      setOtp(data);
      setIsLoading(true);
      loginWithCode({ code: data.join("") });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/10 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 scale-in-center">
        {/* Botón de cierre */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="text-zinc-500" size={20} />
        </button>

        {isDone ? (
          /* PASO FINAL: CONFIRMACIÓN */
          <div className="text-center py-10 space-y-4 animate-in zoom-in">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="text-green-500 w-12 h-12" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">
              Autenticado
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              Sincronizando con Mercado Nero...
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-8 pt-4">
              <div className="w-16 h-16 bg-[#F26722]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                {isCodeSent ? (
                  <KeyRound className="text-[#F26722]" size={30} />
                ) : (
                  <Mail className="text-[#F26722]" size={30} />
                )}
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">
                {isCodeSent ? "Verifica el código" : "Ingresar a Mercado Nero"}
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">
                {isCodeSent
                  ? `Enviamos un código OTP a ${email}`
                  : "Accedé para comprar, vender y participar de la comunidad"}
              </p>
            </div>

            {!isCodeSent ? (
              <form onSubmit={handleSendCode} className="space-y-4">
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
                    <>
                      <LoadingSpinner size="sm" />
                      {/* Enviando... */}
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => e.preventDefault()}
                className="space-y-6 w-full"
              >
                <div
                  className="flex justify-between gap-1.5 sm:gap-2 w-full max-w-md mx-auto"
                  onPaste={handlePaste}
                >
                  {otp.map((data, index) => (
                    <input
                      key={index}
                      type="text"
                      inputMode="numeric" // 📱 Fuerza el teclado numérico en Mobile sin romper el comportamiento
                      pattern="[0-9]*" // 📱 Compatibilidad extra para iOS de Apple
                      maxLength={1}
                      ref={(el) => (inputRefs.current[index] = el)}
                      value={data}
                      onChange={(e) => handleOtpChange(e.target, index)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      className="w-full aspect-[6/7] max-w-[48px] text-center text-xl sm:text-2xl font-black rounded-xl bg-zinc-100 dark:bg-zinc-800 border-2 border-transparent focus:border-[#F26722] focus:bg-white dark:focus:bg-zinc-700 dark:text-white outline-none transition-all px-0"
                    />
                  ))}
                </div>
                <button
                  onClick={() => {
                    setIsLoading(true); // 👈 Activamos el spinner antes de arrancar la verificación
                    loginWithCode({ code: otp.join("") });
                  }}
                  disabled={otp.some((v) => v === "") || isLoading}
                  className="w-full h-14 bg-zinc-900 dark:bg-white dark:text-black text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <LoadingSpinner size="sm" />
                      <span>Verificando...</span>
                    </div>
                  ) : (
                    "Verificar Ingreso"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCodeSent(false)}
                  className="w-full text-xs text-zinc-500 uppercase font-bold text-center hover:text-[#F26722] transition-colors"
                >
                  Cambiar email
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
