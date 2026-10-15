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

const AuthContext = createContext(null);

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

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }, []);

  const logout = useCallback(async () => {
    // Limpiamos la caché de la wallet Crossmint autenticada para que el próximo
    // usuario NO herede el signer (ni la sesión de OTP) del anterior.
    clearWalletCache();
    await supabase.auth.signOut();
    setSession(null);
  }, []);

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
export { useWallets, useCreateWallet } from "./authWallets";
