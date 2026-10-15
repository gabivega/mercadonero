/**
 * Utils/crossmintOtpBridge.js
 * ────────────────────────────────────────────────────────────────────────────
 * Puente (bridge) para el flujo de OTP del EMAIL SIGNER de Crossmint.
 *
 * ¿Por qué existe?
 *   La smart wallet de Crossmint se firma idealmente con un DEVICE SIGNER
 *   (clave P-256 en el dispositivo, sin OTP). Pero si el device signer no está
 *   disponible en este navegador (p. ej. el usuario abrió la app en otro
 *   equipo, se borró el storage, o el mapeo address→clave falló), Crossmint cae
 *   al recovery por EMAIL y lanza:
 *
 *     "email signer requires the onAuthRequired callback to handle OTP
 *      verification..."
 *
 *   El SDK espera que le pasemos un callback `onAuthRequired` que maneje el
 *   flujo (enviar OTP + pedirle al usuario que lo ingrese + verificar/rechazar).
 *   Como nuestro proyecto NO usa el provider React de Crossmint, ese callback
 *   NO viene "de fábrica": lo implementamos acá.
 *
 * Contrato REAL del SDK (verificado en el bundle del SDK v1.20.0):
 *   - El SDK llama: onAuthRequired(signerType, signerLocator, needsAuth,
 *       sendOtp, verifyOtp, reject)
 *   - El SDK hace `await` de la promesa que devolvemos.
 *   - Internamente `verifyOtp(code)`:
 *       · Si el código es correcto: marca el signer como "ready" y RESUELVE la
 *         promesa de auth interna del SDK (NO la nuestra).
 *       · Si el código es incorrecto/vencido: LANZA un error (OtpValidationError).
 *   - Por eso, cuando `verifyOtp` resuelve OK, nosotros también debemos resolver
 *     NUESTRA promesa para que el `await` del SDK continúe.
 *
 * IMPORTANTE (por qué cada firma pedía OTP de nuevo):
 *   Cada operación (approve, deposit, transfer...) dispara su propia auth flow
 *   si el signer del email no quedó autenticado en la sesión. Además, recrear
 *   la wallet/signer en cada operación pierde el estado de autenticación. Eso se
 *   resuelve cacheando la wallet autenticada (ver crossmintWallet.js) — acá solo
 *   manejamos la UI del OTP una vez que el SDK lo requiere.
 */

// ── Estado interno ──────────────────────────────────────────────────────────
const listeners = new Set();

// Solicitud de auth en curso.
let pending = null;

/** Notifica a la UI del nuevo estado/solicitud. */
function emit() {
  const snapshot = getSnapshot();
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch (err) {
      console.error("[crossmintOtpBridge] listener error:", err);
    }
  }
}

/**
 * Snapshot inmutable del estado actual, para que la UI lo renderice.
 */
export function getSnapshot() {
  if (!pending) {
    return {
      active: false,
      signerType: null,
      signerLocator: null,
      needsAuth: false,
      otpSent: false,
      verifying: false,
      error: null,
    };
  }
  return {
    active: true,
    signerType: pending.signerType,
    signerLocator: pending.signerLocator,
    needsAuth: pending.needsAuth,
    otpSent: pending.otpSent,
    verifying: pending.verifying,
    error: pending.error,
  };
}

/**
 * Suscribe la UI a los cambios del flujo de OTP.
 * @param {(snapshot) => void} fn
 * @returns {() => void} función para desuscribirse.
 */
export function subscribe(fn) {
  listeners.add(fn);
  fn(getSnapshot());
  return () => listeners.delete(fn);
}

/**
 * El `onAuthRequired` que le pasamos al SDK de Crossmint.
 *
 * Devuelve una promesa que:
 *   - se RESUELVE cuando el usuario completó el OTP con éxito.
 *   - se RECHAZA cuando el usuario cancela o el flujo falla definitivamente.
 */
export function onAuthRequired(
  signerType,
  signerLocator,
  needsAuth,
  sendOtp,
  verifyOtp,
) {
  return new Promise((resolve, rejectPromise) => {
    // ⚠️ CLAVE: el SDK vuelve a invocar `onAuthRequired` con `needsAuth === false`
    // cuando el OTP YA se verificó con éxito (es su forma de notificar el
    // cierre del flujo), y hace `await` de la promesa devuelta. Si acá
    // creáramos una nueva solicitud, el modal volvería a pedir "Enviar código"
    // y el SDK quedaría esperando para siempre (=> "queda trabado").
    // Ante needsAuth falsy, resolvemos al instante: NO hay que autenticar nada.
    if (!needsAuth) {
      resolve();
      return;
    }

    // Si ya hay una solicitud activa sin verificar, reutilizamos la UI existente
    // y resolvemos esta invocación duplicada cuando la original termine.
    if (pending) {
      // Encadenamos: cuando la solicitud vigente se resuelva/rechace, replicamos
      // el resultado en esta invocación para no dejar promesas colgadas.
      const current = pending;
      const waitOriginal = new Promise((res, rej) => {
        current._followers = current._followers || [];
        current._followers.push({ res, rej });
      });
      waitOriginal.then(resolve).catch(rejectPromise);
      return;
    }

    pending = {
      signerType,
      signerLocator,
      needsAuth,
      otpSent: false,
      verifying: false,
      error: null,
      _followers: [],
      _sendOtp: sendOtp,
      _verifyOtp: verifyOtp,
      _resolve: resolve,
      _rejectPromise: rejectPromise,
    };
    emit();
  });
}

/**
 * La UI pide enviar el OTP (paso 1: botón "Enviar código").
 */
export async function sendOtpNow() {
  if (!pending) return;
  try {
    await pending._sendOtp();
    pending.otpSent = true;
    pending.error = null;
    emit();
  } catch (err) {
    pending.error = err?.message || "No se pudo enviar el código.";
    emit();
    throw err;
  }
}

/**
 * La UI envía el OTP ingresado por el usuario (paso 2: "Verificar y firmar").
 * @param {string} code
 * @returns {Promise<boolean>} true si se verificó OK.
 */
export async function submitOtp(code) {
  if (!pending) return false;
  const clean = String(code || "").trim();
  if (!clean) {
    pending.error = "Ingresá el código que te llegó por email.";
    emit();
    return false;
  }

  pending.verifying = true;
  pending.error = null;
  emit();

  try {
    // verifyOtp del SDK: si el código es correcto resuelve; si no, LANZA.
    // ⚠️ OJO: internamente, cuando el código es correcto, el SDK vuelve a
    // llamar a `onAuthRequired(needsAuth=false)` y hace `await` de esa promesa
    // ANTES de continuar. Ese caso lo cubrimos arriba (needsAuth falsy →
    // resolve inmediato), así que aquí no se cuelga.
    await pending._verifyOtp(clean);

    // Éxito: resolvemos nuestra promesa (y a los seguidores) para que el
    // `await onAuthRequired(...)` del SDK continúe.
    const resolve = pending._resolve;
    const followers = pending._followers || [];
    pending = null;
    emit();
    resolve();
    for (const f of followers) {
      try {
        f.res();
      } catch {
        /* noop */
      }
    }
    return true;
  } catch (err) {
    const message =
      err?.code === "OTP_INVALID" ||
      /invalid|incorrect|expired|vencid|inv[aá]lid/i.test(err?.message || "")
        ? "Código incorrecto o vencido. Probá de nuevo."
        : err?.message || "No se pudo verificar el código.";
    if (pending) {
      pending.verifying = false;
      pending.error = message;
      // Dejamos otpSent=true para permitir reingresar el código sin volver al
      // paso inicial (o reenviar).
      emit();
    }
    return false;
  }
}

/**
 * La UI cancela el flujo. Abortamos la firma para que la promesa de la
 * operación (writeContract/approveToken/sendToken) se RECHACE y el caller no
 * quede colgado en "procesando".
 */
export function cancelAuth() {
  if (!pending) return;
  const { _rejectPromise, _followers = [] } = pending;
  pending = null;
  emit();
  // ⚠️ NO llamamos al `reject` del SDK: ese callback re-invoca
  // `onAuthRequired` internamente y volvería a abrir el modal. Al RECHAZAR
  // nuestra promesa, el `await onAuthRequired(...)` del SDK lanza, el SDK
  // rechaza su auth flow y la operación (writeContract/sendToken) rechaza →
  // el caller sale del "procesando".
  const err = new Error("Autenticación cancelada por el usuario.");
  err.name = "AuthRejectedError";
  err.code = "AUTH_REJECTED";
  _rejectPromise?.(err);
  for (const f of _followers) {
    try {
      f.rej(err);
    } catch {
      /* noop */
    }
  }
}

/** ¿Hay un flujo de OTP activo? */
export function isAuthPending() {
  return pending !== null;
}

export default {
  onAuthRequired,
  subscribe,
  getSnapshot,
  sendOtpNow,
  submitOtp,
  cancelAuth,
  isAuthPending,
};
