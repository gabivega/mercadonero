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
  (error) => {
    const status = error?.response?.status;
    // 401 = token inválido/expirado → sesión caída.
    // 403 NO se trata acá (es "sin permisos", la sesión puede ser válida).
    if (status === 401) {
      handleUnauthorized();
    }
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
