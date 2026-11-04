// controllers/referralLinkController.js
import User from "../models/User.js";
import Product from "../models/Product.js";
import {
  getOrCreateReferralLink,
  resolveReferralCode,
  trackClick,
} from "../services/referralLinkService.js";

// ── Bases de URL ──────────────────────────────────────────────────────────
// El enlace corto (/r/<code>) vive en el BACKEND. La redirección apunta al
// FRONTEND (/producto/<slug>). Por eso manejamos DOS bases distintas:
//
//   PUBLIC_API_URL  → base del BACKEND (para armar el shortUrl que se comparte).
//                     ej: dev "http://localhost:3000", prod "https://api.mercadonero.com"
//   PUBLIC_WEB_URL  → base del FRONTEND (destino del redirect 302).
//                     ej: dev "http://localhost:5173", prod "https://mercadonero.com"
//
// Fallbacks:
//   - API: si no hay PUBLIC_API_URL, deducimos del request (protocol + host):
//     en localhost eso da http://localhost:3000, justo el backend.
//   - WEB: si no hay PUBLIC_WEB_URL, usamos el dominio de producción.

// Base del backend para el shortUrl. Se calcula por request (host real).
const apiBaseFromReq = (req) => {
  const env = (process.env.PUBLIC_API_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  const proto = req.protocol || "http";
  const host = req.get("host"); // ej: localhost:3000
  return host ? `${proto}://${host}` : "http://localhost:3000";
};

// Base del frontend para la redirección.
const webBaseFromEnv = () => {
  const env = (process.env.PUBLIC_WEB_URL || "").trim();
  return (env || "https://mercadonero.com").replace(/\/$/, "");
};

/**
 * POST /api/referral/link
 * Crea (o reutiliza) el enlace corto de un referidor para un producto.
 * Solo disponible para referidores APROBADOS.
 * Body: { productId }.
 * Devuelve: { success, code, shortUrl, clicks }.
 */
export const createReferralLink = async (req, res) => {
  try {
    const { productId } = req.body || {};
    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Falta productId." });
    }

    const user = await User.findById(req.user._id).select("referralStatus");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }
    if (user.referralStatus !== "approved") {
      return res.status(403).json({
        success: false,
        code: "NOT_APPROVED",
        message: "Necesitás ser referidor aprobado para compartir enlaces.",
      });
    }

    const product = await Product.findById(productId).select(
      "slug referral listingType",
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Producto no encontrado." });
    }
    // Solo productos de pago con referido activo.
    if (
      product.listingType !== "product" ||
      !product.referral?.enabled ||
      !(product.referral?.percent > 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Este producto no ofrece recompensa por referidos.",
      });
    }

    const { code, clicks } = await getOrCreateReferralLink(
      user._id,
      product._id,
      product.slug || "",
    );

    // El shortUrl apunta al BACKEND (donde vive /r/<code>).
    const apiBase = apiBaseFromReq(req);

    res.status(200).json({
      success: true,
      code,
      clicks,
      shortUrl: `${apiBase}/r/${code}`,
    });
  } catch (error) {
    console.error("Error en createReferralLink:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /r/:code
 * Redirección pública del enlace corto. Cuenta el clic y redirige (302) a
 * /producto/<slug>?ref=<referrerId>. No requiere auth (es lo que se comparte).
 */
export const resolveReferralLink = async (req, res) => {
  const webBase = webBaseFromEnv();
  try {
    const { code } = req.params;
    const link = await resolveReferralCode(code);

    if (!link) {
      // Enlace inexistente/vencido → home del FRONTEND.
      return res.redirect(302, webBase);
    }

    const seg = link.product?.slug || link.slugSnapshot || "";
    const target = seg
      ? `${webBase}/producto/${seg}?ref=${link.referrer}`
      : webBase;

    // Contamos el clic sin frenar la redirección.
    trackClick(link._id);

    return res.redirect(302, target);
  } catch (error) {
    console.error("Error en resolveReferralLink:", error);
    return res.redirect(302, webBase);
  }
};
