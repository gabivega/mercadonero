/**
 * Utils/axiosAuth.js
 * ────────────────────────────────────────────────────────────────────────────
 * Manejo GLOBAL de respuestas 401 (sesión inválida / expirada) en axios.
 *
 * Antes Privy gestionaba el ciclo de vida del token de forma transparente.
 * Con Supabase, si el token vence (o el refresh falla), el backend responde
 * 401 y cada componente caía en su propio try/catch mostrando un error
 * genérico ("Error de conexión") SIN cerrar la sesión ni redirigir. Resultado:
 * la app quedaba "a medias", con una sesión muerta en la UI y todo fallando.
 *
 * Este módulo centraliza esa reacción:
 *   - Registra un interceptor de RESPUESTA en axios.
 *   - Ante un 401, dispara el logout y redirige a la home (una sola vez).
 *
 * Es un "puente": el `logout` real lo provee el AuthProvider (que conoce
 * Supabase y limpia la caché de wallet). Lo conectamos con `setUnauthorizedHandler`.
 */
import axios from "axios";

// Handler de "sesión inválida". Lo setea el AuthProvider al montarse.
let onUnauthorized = null;
// Handler para forzar un refresh de token (getAccessToken del AuthProvider).
// Permite reintentar una request tras un 401 ANTES de cerrar la sesión.
let onRefreshToken = null;
// Evita disparar el logout/redirect múltiples veces si llegan varios 401 en
// paralelo (lo normal cuando la sesión se cae y hay varias requests en vuelo).
let redirecting = false;

/**
 * Conecta la reacción ante 401. Se llama UNA vez desde el AuthProvider.
 * @param {Function} handler  async () => { ... }  (normalmente el logout).
 */
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

/**
 * Conecta el "refrescador" de token. Se llama UNA vez desde el AuthProvider.
 * @param {Function} handler  async () => token | null  (normalmente getAccessToken).
 */
export const setRefreshHandler = (handler) => {
  onRefreshToken = handler;
};

/**
 * ¿El error indica que el JWT/sesión venció?
 *
 * Cubre el error del backend (401 "Token inválido o expirado") y los errores de
 * servicios externos que validan el JWT directamente — como Crossmint, que
 * responde `{ code: "ERROR_JWT_EXPIRED", expiredAt }`. En esos casos la sesión
 * ya no sirve y hay que cerrarla (no reintentar con el mismo token).
 *
 * @param {any} error  error de axios / Crossmint / fetch.
 * @returns {boolean}
 */
export const isJwtExpiredError = (error) => {
  if (!error) return false;
  const code = error?.code || error?.response?.data?.code;
  if (code === "ERROR_JWT_EXPIRED" || code === "ERROR_JWT_INVALID") return true;
  const msg = String(
    error?.message || error?.response?.data?.message || error?.response?.data?.error || "",
  );
  return /jwt\s*(provided\s*)?expired|jwt\s*invalid|token\s*(inv[aá]lido|expirado)|jwt\s*malformed/i.test(
    msg,
  );
};


/**
 * Ejecuta el logout + redirección una sola vez por "ráfaga" de 401.
 * Redirige a "/" (home) para que el usuario vuelva a un estado conocido y
 * pueda re-loguearse. No forzamos una recarga completa si ya estamos en "/".
 */
export const handleUnauthorized = async () => {
  if (redirecting) return;
  redirecting = true;

  try {
    if (typeof onUnauthorized === "function") {
      await onUnauthorized();
    }
  } catch (err) {
    console.error("axiosAuth: error ejecutando logout:", err);
  } finally {
    // Dejamos pasar un momento antes de redirigir para evitar rebotes y
    // permitir que se limpie el estado. Solo redirigimos si no estamos ya
    // en la home (evita recargas innecesarias en páginas públicas).
    const path = window.location.pathname;
    if (path !== "/" && path !== "") {
      window.location.href = "/";
    }
    // Liberamos el flag después de un pequeño delay.
    setTimeout(() => {
      redirecting = false;
    }, 3000);
  }
};

// Interceptor de RESPUESTA: reaccionamos a 401 del backend.
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    // 403 NO se trata acá (es "sin permisos", la sesión puede ser válida).
    if (status !== 401) {
      return Promise.reject(error);
    }

    // ── Reintento único tras refresh ──────────────────────────────────────
    // Un 401 puede ser (a) el token expiró justo antes de la request, o
    // (b) un token viejo que estaba en vuelo. En vez de cerrar la sesión de
    // inmediato (lo que provocaba logouts "de la nada"), forzamos UN refresh
    // y reintentamos la request. Sólo si eso vuelve a dar 401 cerramos sesión.
    const original = error.config || {};
    if (onRefreshToken && !original._authRetried) {
      original._authRetried = true;
      let token = null;
      try {
        token = await onRefreshToken();
      } catch {
        token = null;
      }
      if (token) {
        original.headers = {
          ...(original.headers || {}),
          Authorization: `Bearer ${token}`,
        };
        try {
          return await axios(original);
        } catch (retryErr) {
          // Si el reintento NO es 401, propagamos ese error tal cual.
          if (retryErr?.response?.status !== 401) {
            return Promise.reject(retryErr);
          }
        }
      }
    }

    // Refresh imposible o el reintento volvió a dar 401 → sesión realmente caída.
    handleUnauthorized();
    return Promise.reject(error);
  },
);

/**
 * Fetch autenticado que respeta el manejo GLOBAL de 401.
 *
 * El `fetch` nativo NO pasa por los interceptores de axios, así que las pocas
 * llamadas que aún lo usan (p.ej. SellerDashboard) quedarían sin reacción ante
 * una sesión caída. Este helper:
 *   1. pide un token FRESCO con `getAccessToken` (que ya refresca en Supabase),
 *   2. arma el header Authorization,
 *   3. si la respuesta es 401, dispara el logout+redirect global,
 *   4. devuelve la Response (el llamador decide cómo parsearla).
 *
 * @param {string}   url        URL completa del endpoint.
 * @param {object}   options    opciones de fetch (method, body, headers, etc.).
 * @param {Function} getToken   `getAccessToken` del AuthProvider (opcional si
 *                              se pasó `token`).
 * @param {string}   token      token explícito (opcional).
 */
export const authFetch = async (url, options = {}, getToken, token) => {
  const bearer = token || (getToken ? await getToken() : null);
  const headers = {
    ...(options.headers || {}),
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
};
