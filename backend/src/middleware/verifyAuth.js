import { createClient } from "@supabase/supabase-js";
/**
 * Middleware de autenticación con SUPABASE AUTH (única fuente de verdad).
 * ─────────────────────────────────────────────────────────────────────────
 * Privy fue ELIMINADO del proyecto. Antes este middleware era "dual" (probaba
 * Supabase y caía a Privy). Ese fallback se quitó porque el paquete
 * @privy-io/server-auth ya no está instalado y, además, todos los usuarios
 * de la base tienen `supabaseId` (nadie dependía de Privy para entrar).
 *
 * Inyecta en `req.user`:
 *   - did:         uuid de Supabase (el `sub` del JWT).
 *   - email:       email del usuario (si está disponible).
 *   - authSource:  siempre "supabase" (se mantiene el campo por compatibilidad
 *                  con el código que lo lee, p. ej. attachUser).
 *
 * ⚠️ Se CONSERVA el nombre del campo `did` (y no `sub`/`userId`) porque decenas
 * de handlers hacen `req.user.did`. Renombrarlo obligaría a tocar todo el
 * backend sin ganar nada.
 */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No autorizado" });
    }
    const token = authHeader.split(" ")[1];

    // Validación contra Supabase. Devuelve null (sin lanzar) si el token es
    // inválido/expirado.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    req.user = {
      did: data.user.id,
      email: data.user.email || "",
      authSource: "supabase",
    };
    next();
  } catch (error) {
    console.error("Error validando token de Supabase:", error);
    res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export default verifyAuth;

