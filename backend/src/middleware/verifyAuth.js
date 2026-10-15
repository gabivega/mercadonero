import { createClient } from "@supabase/supabase-js";
import { PrivyClient } from "@privy-io/server-auth";

/**
 * Middleware de autenticación DUAL (transición Privy → Supabase).
 * ─────────────────────────────────────────────────────────────────
 * Intenta validar el token como JWT de Supabase y, si falla, cae al
 * validador de Privy. De esta forma una MISMA ruta protegida sirve tanto
 * para usuarios nuevos (sesión Supabase) como para los que todavía usan
 * Privy, sin tener que duplicar rutas.
 *
 * Inyecta en `req.user`:
 *   - did:         identificador del usuario (uuid de Supabase o did:privy:...)
 *   - email:       email del usuario (si está disponible)
 *   - authSource:  "supabase" | "privy"  ← permite a `attachUser` saber
 *                  por cuál campo buscar en la DB.
 *
 * Mantener el campo `did` preserva la compatibilidad con todo el código
 * existente que hace `req.user.did`.
 */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID,
  process.env.PRIVY_APP_SECRET,
);

// Valida como Supabase. Devuelve el usuario o null (sin lanzar).
const trySupabase = async (token) => {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return {
    did: data.user.id,
    email: data.user.email || "",
    authSource: "supabase",
  };
};

// Valida como Privy. Devuelve el usuario o null (sin lanzar).
const tryPrivy = async (token) => {
  const claims = await privy.verifyAuthToken(token);
  return {
    did: claims.userId,
    email: claims.email || "",
    authSource: "privy",
  };
};

const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No autorizado" });
    }
    const token = authHeader.split(" ")[1];

    // 1) Supabase primero (es el destino de la migración).
    let user = null;
    try {
      user = await trySupabase(token);
    } catch {
      user = null;
    }

    // 2) Fallback a Privy (mientras convive el auth viejo).
    if (!user) {
      try {
        user = await tryPrivy(token);
      } catch {
        user = null;
      }
    }

    if (!user) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error validando token (dual):", error);
    res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export default verifyAuth;
