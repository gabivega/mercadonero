/**
 * Utils/authClient.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Capa de COMPATIBILIDAD que reemplaza `@privy-io/react-auth` por Supabase Auth.
 *
 * La app entera consumía la API de Privy (`usePrivy`, `useWallets`,
 * `useCreateWallet`, `PrivyProvider`). Para migrar sin reescribir 60+
 * componentes, exponemos EXACTAMENTE la misma forma de API, pero por debajo
 * usamos Supabase. Así solo cambia el import:
 *
 *   - import { usePrivy } from "@privy-io/react-auth"
 *   + import { usePrivy } from "../Utils/authClient"
 *
 * El objeto `user` se "mimetiza" con la forma de Privy:
 *   {
 *     id,                       // uuid de Supabase (user.id)
 *     email: { address },       // user.email.address  (compat Privy)
 *     wallet: { address },      // si hay wallet vinculada
 *     linkedAccounts: [...],    // compat Privy
 *   }
 *
 * Login soportado:
 *   - Magic link (email OTP)  → signInWithOtp
 *   - Google OAuth            → signInWithOAuth({ provider: "google" })
 *
 * IMPORTANTE: la creación/sincronización del usuario en Mongo la sigue haciendo
 * `useSyncUser` → POST /api/auth/sync-user (igual que antes con Privy).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "./supabaseClient";
import { useUserStore } from "../store/useUserStore";
import SupabaseLogin from "../components/SupabaseLogin";
import { clearWalletCache } from "./crossmintWallet";
import { setUnauthorizedHandler, setRefreshHandler } from "./axiosAuth";

const AuthContext = createContext(null);

/**
 * Refresh "en vuelo" compartido a nivel de módulo.
 *
 * PROBLEMA que resuelve: si N requests paralelas llaman a `getAccessToken()`
 * cuando el token ya venció, TODAS veían el token expirado y TODAS disparaban
 * `refreshSession()` a la vez. Supabase rota el refresh_token en cada uso y
 * tiene detección de reuso: la primera gana, las demás reciben `invalid_grant`
 * → antes eso cerraba la sesión (`signOut`). De ahí que la sesión "se cayera
 * sola" sin tocar nada.
 *
 * Solución: una única promesa de refresh compartida; todas las llamadas
 * concurrentes esperan el MISMO resultado en vez de pedir refreshes distintos.
 */
let refreshInFlight = null;

/**
 * Normaliza la sesión/usuario de Supabase a la forma "Privy" que espera la app.
 *
 * @param supabaseUser  usuario de la sesión de Supabase (o null).
 * @param walletAddress dirección de wallet VINCULADA, resuelta desde Mongo
 *                      (dbUser.walletAddress). NO se toma de Supabase: la wallet
 *                      es un dato de negocio que vive en Mongo.
 */
function mapSupabaseUser(supabaseUser, walletAddress = null) {
  if (!supabaseUser) return null;

  return {
    id: supabaseUser.id,
    email: { address: supabaseUser.email || "" },
    // La wallet embebida/vinculada viene de Mongo (dbUser.walletAddress).
    wallet: walletAddress ? { address: walletAddress } : null,
    linkedAccounts: walletAddress
      ? [{ type: "wallet", address: walletAddress }]
      : [],
    raw: supabaseUser,
  };
}

/**
 * AuthProvider: reemplaza a `<PrivyProvider>`. Se encarga de:
 *   - inicializar la sesión de Supabase,
 *   - escuchar cambios de auth,
 *   - exponer login/logout/getAccessToken vía el contexto.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  // Controla el modal de login GLOBAL (lo abre login()/openLogin()).
  const [loginOpen, setLoginOpen] = useState(false);
  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  // Wallet vinculada: vive en Mongo (dbUser.walletAddress). Nos suscribimos al
  // store para que `user.wallet.address` (compat Privy) refleje el dato real.
  const dbWalletAddress = useUserStore((s) => s.dbUser?.walletAddress || null);

  useEffect(() => {
    let mounted = true;

    // 1. Sesión inicial.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session || null);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    // 2. Cambios de estado (login, logout, refresh de token).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
      setReady(true);
      // Al iniciar sesión, cerramos el modal global de login.
      if (s) setLoginOpen(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const logout = useCallback(async () => {
    // Limpiamos la caché de la wallet Crossmint autenticada para que el próximo
    // usuario NO herede el signer (ni la sesión de OTP) del anterior.
    clearWalletCache();
    await supabase.auth.signOut();
    setSession(null);
    // Limpiamos el usuario de negocio en el store para no dejar datos "colgados"
    // de una sesión ya cerrada (perfil, wallet, direcciones, etc.).
    try {
      useUserStore.getState().clearUser?.();
    } catch (err) {
      console.warn("logout: no se pudo limpiar el store de usuario:", err);
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    // ── TOKEN FRESCO (con refresh automático) ────────────────────────────
    // Privy refrescaba el token de forma transparente; Supabase NO lo hace
    // en llamadas puntuales: `getSession()` devuelve el token guardado aunque
    // esté EXPIRADO. Eso generaba 401 en el backend (token viejo).
    //
    // Estrategia:
    //   1. Si no hay sesión → null.
    //   2. Si el token expira en <= 30s (o ya expiró) → refreshSession().
    //   3. El refresh se COMPARTE entre llamadas concurrentes (refreshInFlight)
    //      para no disparar varios refreshSession() simultáneos (eso invalidaba
    //      el refresh_token por detección de reuso y cerraba la sesión).
    //   4. Si el refresh falla DE VERDAD, cerramos la sesión (logout): el
    //      refresh_token está vencido/revocado y no tiene sentido seguir
    //      navegando con un token muerto (el backend/Crossmint lo rechazan).
    //      Si era un blip transitorio, el interceptor 401 ya reintenta antes.
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = session.expires_at || 0;
    const EXPIRY_MARGIN_SEC = 30;

    if (exp && exp - nowSec > EXPIRY_MARGIN_SEC) {
      // El token sigue vigente con margen suficiente.
      return session.access_token;
    }

    // Token expirado o por vencer: forzamos UN único refresh compartido.
    if (!refreshInFlight) {
      refreshInFlight = supabase.auth
        .refreshSession()
        .then(({ data: refreshed, error }) => {
          if (error || !refreshed?.session) return null;
          return refreshed.session.access_token;
        })
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });
    }

    const token = await refreshInFlight;
    if (!token) {
      // El refresh falló DE VERDAD: el refresh_token está vencido/revocado.
      // Cerramos la sesión para no quedar navegando con un token muerto que el
      // backend/Crossmint rechazan (ERROR_JWT_EXPIRED, 401, etc.).
      console.warn("getAccessToken: refresh falló; cerrando sesión.");
      await logout();
      return null;
    }
    return token;
  }, [logout]);

  // ── Reacción GLOBAL ante 401 ──────────────────────────────────────────
  // Conectamos el interceptor de axios con NUESTRO logout. Así, cuando el
  // backend responde 401 (token expirado/inválido y refresh fallido), se cierra
  // la sesión y se redirige a la home automáticamente, en vez de dejar la UI
  // con una sesión muerta y errores genéricos por todos lados.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    // El interceptor 401 usa getAccessToken para forzar un refresh y REINTENTAR
    // la request antes de rendirse y cerrar sesión. Esto evita logouts por un
    // 401 puntual (request que llega justo al expirar el token, blip de red,
    // redeploy del backend, etc.).
    setRefreshHandler(getAccessToken);
  }, [logout, getAccessToken]);

  /**
   * `login()` mantiene la firma de Privy. Si se llama sin argumentos (como
   * antes), abre el modal GLOBAL de login de Supabase. Si se pasa `provider`,
   * dispara OAuth directo (compat con llamadas programáticas concretas).
   */
  const login = useCallback(async (opts = {}) => {
    if (opts?.provider) {
      await supabase.auth.signInWithOAuth({
        provider: opts.provider,
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    // Sin proveedor: abrimos el modal de login (magic link + Google).
    setLoginOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      authenticated: Boolean(session),
      session,
      user: mapSupabaseUser(session?.user, dbWalletAddress),
      getAccessToken,
      login,
      logout,
      openLogin,
      supabase,
    }),
    [ready, session, dbWalletAddress, getAccessToken, login, logout, openLogin],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Modal de login GLOBAL: cualquier componente puede abrirlo con login()/openLogin(). */}
      <SupabaseLogin isOpen={loginOpen} onClose={closeLogin} />
    </AuthContext.Provider>
  );
}

/** Hook con la misma API que `usePrivy()`. */
export function usePrivy() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback defensivo: si algún componente quedó fuera del provider,
    // devolvemos un objeto "deslogueado" para no romper el render.
    return {
      ready: false,
      authenticated: false,
      user: null,
      getAccessToken: async () => null,
      login: async () => {},
      logout: async () => {},
      supabase,
    };
  }
  return ctx;
}

/** Alias semántico (recomendado para código nuevo). */
export const useAuth = usePrivy;

// Re-export de los hooks de wallet para centralizar el import de la migración:
//   import { usePrivy, useWallets } from "@privy-io/react-auth"
//   import { usePrivy, useWallets } from "../Utils/authClient"
// NOTA: `useCreateWallet` ya NO se exporta (era un no-op de Privy y nadie lo
// usaba). La creación de wallet se hace con Crossmint: Utils/crossmintWallet.js
export { useWallets } from "./authWallets";
