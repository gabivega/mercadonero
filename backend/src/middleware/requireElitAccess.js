// middleware/requireElitAccess.js
/**
 * Autoriza el acceso al CATÁLOGO DE ELIT (explorador + importar + sync).
 *
 * POR QUÉ EXISTE:
 *   Las rutas de Elit antes solo exigían `verifyAuth`, así que CUALQUIER usuario
 *   logueado podía consumir el catálogo del proveedor pegándole directo a la
 *   API. En la práctica "solo el admin" era una ilusión de la UI (el link del
 *   menú), no una defensa real.
 *
 *   Este middleware cierra esa brecha: solo deja pasar a:
 *     1. Administradores (role "admin" o email en ADMIN_EMAILS).
 *     2. Cuentas puntuales habilitadas explícitamente en ELIT_ALLOWED_EMAILS.
 *
 * POR QUÉ UNA LISTA EN EL .env Y NO UN FLAG EN LA BD:
 *   Es una etapa temprana y hoy es UNA sola cuenta (una tienda de hardware).
 *   Editar el .env y redeployar es más simple que montar un flag + toggle en el
 *   panel de admin. Si el número de cuentas crece, migramos a
 *   `User.permissions.elitCatalog` sin cambiar la firma de este middleware.
 *
 * ⚠️ El email que se compara es el de la JWT de SUPABASE (req.user.email), no
 *   el que el usuario cargue en su perfil. Supabase lo normaliza a minúsculas,
 *   y acá también comparamos case-insensitive por las dudas.
 *
 * IMPORTANTE: DEBE correr DESPUÉS de `verifyAuth` + `attachUser` para que
 *   `req.user.role` y `req.user.email` estén poblados.
 */
import { isAdminUser } from "./isAdmin.js";

/**
 * Parsea ELIT_ALLOWED_EMAILS (coma y/o punto y coma) a un Set en minúsculas.
 */
const getElitAllowedEmails = () => {
  const raw = process.env.ELIT_ALLOWED_EMAILS || "";
  return new Set(
    raw
      .split(/[,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
};

/**
 * ¿El usuario tiene acceso al catálogo de Elit?
 *   - Admin (por rol o ADMIN_EMAILS) → sí.
 *   - Email en ELIT_ALLOWED_EMAILS  → sí.
 *
 * @param {object} reqUser  `req.user` ya poblado por attachUser.
 * @returns {boolean}
 */
export const hasElitAccess = (reqUser) => {
  if (!reqUser) return false;
  if (isAdminUser(reqUser)) return true;

  const email = (reqUser.email || "").toLowerCase().trim();
  if (email && getElitAllowedEmails().has(email)) return true;

  return false;
};

/**
 * Middleware de Express: 403 si el usuario no tiene acceso a Elit.
 */
const requireElitAccess = (req, res, next) => {
  if (hasElitAccess(req.user)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message:
      "Acceso denegado: tu cuenta no tiene habilitado el catálogo de proveedores.",
  });
};

export default requireElitAccess;
