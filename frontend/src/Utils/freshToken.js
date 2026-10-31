/**
 * Utils/freshToken.js
 * ────────────────────────────────────────────────────────────────────────────
 * Obtiene un access_token de Supabase "fresco" (no expirado ni por vencer).
 *
 * PROBLEMA que resuelve:
 *   `supabase.auth.getSession()` devuelve el token guardado AUNQUE YA ESTÉ
 *   EXPIRADO. Cualquier servicio externo que valide ese JWT (p.ej. Crossmint)
 *   lo rechaza con `ERROR_JWT_EXPIRED`. Con Privy esto no pasaba porque el
 *   token era gestionado de forma transparente; con Supabase hay que refrescar
 *   a mano.
 *
 * Estrategia:
 *   - Si el token vence con margen suficiente → se reutiliza.
 *   - Si está vencido o por vencer → `refreshSession()`.
 *   - El refresh se COMPARTE entre llamadas concurrentes (misma promesa), para
 *     no disparar varios `refreshSession()` a la vez (Supabase rota el
 *     refresh_token y detecta reuso → invalid_grant → logout espurio).
 *
 * Devuelve el token o `null` si no hay sesión / el refresh falló.
 */
import { supabase } from "./supabaseClient";

// Margen de seguridad: refrescamos si al token le quedan <= 30s.
const EXPIRY_MARGIN_SEC = 30;

// Refresh "en vuelo" compartido a nivel de módulo.
let refreshInFlight = null;

/**
 * @returns {Promise<string|null>} access_token vigente, o null.
 */
export async function getFreshAccessToken() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = session.expires_at || 0;

  // Token vigente con margen suficiente.
  if (exp && exp - nowSec > EXPIRY_MARGIN_SEC) {
    return session.access_token;
  }

  // Token expirado o por vencer: un único refresh compartido.
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

  return refreshInFlight;
}
