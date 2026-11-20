// middleware/isAdmin.js
/**
 * Autoriza solo a administradores.
 *
 * Fuentes de verdad (en orden de prioridad):
 *   1. `role === "admin"` en la BD (lo inyecta `attachUser`). ← camino normal.
 *   2. `ADMIN_EMAILS`: lista de emails (separados por coma) definida en el .env.
 *      Sirve como "bootstrap" para poder entrar al panel y ejecutar acciones
 *      sensibles (liberar garantías, escrow, etc.) AUNQUE el usuario todavía no
 *      tenga `role: "admin"` en la BD. Requiere que el token traiga el email
 *      (Supabase lo hace). Comparación case-insensitive.
 *
 * ⚠️ El fallback legacy por `ADMIN_PRIVY_ID` fue ELIMINADO junto con Privy.
 * Quedan solo dos fuentes: rol en la BD y lista blanca de emails.
 *
 * IMPORTANTE: este middleware DEBE correr DESPUÉS de `verifyAuth` + `attachUser`
 * para que `req.user.role` y `req.user.email` estén poblados.
 */
/**
 * Parsea la lista de emails admin del entorno y devuelve un Set en minúsculas.
 * Acepta separadores por coma y/o punto y coma, y tolera espacios sobrantes.
 */
const getAdminEmails = () => {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(/[,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
};

/**
 * Determina si un usuario (req.user) es admin. Centraliza las fuentes de
 * verdad para que los controladores NO dupliquen la lógica:
 *   1. `role === "admin"` en la BD.
 *   2. Email en `ADMIN_EMAILS` (.env) — bootstrap/emergencia.
 *
 * @param {object} reqUser - El objeto `req.user` (puede venir con role, email).
 * @returns {boolean}
 */
export const isAdminUser = (reqUser) => {
  if (!reqUser) return false;
  // 1. Rol en la BD.
  if (reqUser.role === "admin") return true;

  // 2. Lista blanca de emails en el .env.
  const email = (reqUser.email || "").toLowerCase().trim();
  if (email && getAdminEmails().has(email)) return true;

  return false;
};

export const isAdmin = (req, res, next) => {
  if (isAdminUser(req.user)) {
    return next();
  }

  return res.status(403).json({
    message: "Acceso denegado: No tenés permisos de administrador.",
  });
};

/**
 * Busca al usuario admin en la BD para ENVIARLE notificaciones/mails de la
 * cola de pendientes.
 *   1. Cualquier usuario con `role: "admin"` (preferimos el primero).
 *   2. El email de `ADMIN_EMAILS` (bootstrap).
 *
 * @returns {Promise<object|null>} El documento User del admin o null.
 *
 * NOTA: recibe el modelo `User` por parámetro para no acoplar este middleware
 * al modelo (evita imports circulares).
 */
export const findAdminUser = async (User) => {
  try {
    // 1. Admin por rol en la BD.
    const byRole = await User.findOne({ role: "admin" });
    if (byRole) return byRole;

    // 2. Admin por email de la lista blanca.
    const emails = [...getAdminEmails()];
    if (emails.length > 0) {
      const byEmail = await User.findOne({ email: { $in: emails } });
      if (byEmail) return byEmail;
    }

    return null;
  } catch (err) {
    console.error("findAdminUser error:", err.message);
    return null;
  }
};

