// controllers/referralLinkController.js
import User from "../models/User.js";
import Product from "../models/Product.js";
import os from "os";
import {
  getOrCreateReferralLink,
  resolveReferralCode,
  trackClick,
} from "../services/referralLinkService.js";
import { getReferralConfig } from "../services/referralService.js";

// ── Bases de URL ──────────────────────────────────────────────────────────
// El enlace corto (/r/<code>) vive en el BACKEND. La redirección apunta al
// FRONTEND (/producto/<slug>). Por eso manejamos DOS bases distintas:
//
//   PUBLIC_API_URL  → base del BACKEND (para armar el shortUrl que se comparte).
//                     ej: dev "http://localhost:3000", prod "https://api.mercadonero.com"
//   PUBLIC_WEB_URL  → base del FRONTEND (destino del redirect 302).
//                     ej: dev "http://localhost:5173", prod "https://mercadonero.com"
//
// Resolución (en este orden):
//   1) Si la env está definida (PUBLIC_API_URL / PUBLIC_WEB_URL) → manda la env.
//   2) Si NO hay env, se elige por NODE_ENV:
//        · development → local (backend :3000 / frontend :5173) para testear
//          el ciclo completo del referido SIN tocar el server.
//        · production  → dominios reales (mercadonero.com).
//
// ⚠️ HISTÓRICO: antes el fallback de la base WEB era SIEMPRE mercadonero.com,
// por eso en localhost el /r/<code> te mandaba al server de prod. Ahora en dev
// se resuelve local y, al deployar, basta con NODE_ENV=production (o
// PUBLIC_WEB_URL=https://mercadonero.com) en el .env del server.

const IS_PROD = process.env.NODE_ENV === "production";

// ── IP DE LAN (solo dev) ─────────────────────────────────────────────────
// El enlace corto (/r/<code>) se escanea con un CELULAR. Si la base del
// frontend es "localhost", el teléfono la resuelve a sí mismo y el QR no
// abre nada. En dev usamos la IP de la máquina en la red Wi-Fi para que el
// enlace funcione desde otro dispositivo.
let cachedLanIp;

function getLanIp() {
  if (cachedLanIp !== undefined) return cachedLanIp;
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family !== "IPv4" || net.internal) continue;
        if (net.address.startsWith("169.254")) continue;
        cachedLanIp = net.address;
        return cachedLanIp;
      }
    }
  } catch {
    /* sin detección */
  }
  cachedLanIp = null;
  return null;
}

// Base del FRONTEND por defecto según entorno (cuando no hay PUBLIC_WEB_URL).
const webBaseDefault = () =>
  IS_PROD
    ? "https://mercadonero.com"
    : `http://${getLanIp() || "localhost"}:5173`;

const DEFAULT_WEB_BASE = webBaseDefault();

// Base del backend para el shortUrl. Se calcula por request (host real).
const apiBaseFromReq = (req) => {
  const env = (process.env.PUBLIC_API_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  const proto = req.protocol || "http";
  const host = req.get("host"); // ej: localhost:3000
  return host ? `${proto}://${host}` : "http://localhost:3000";
};

// Base del frontend para la redirección (PUBLIC_WEB_URL > default de entorno).
const webBaseFromEnv = () => {
  const env = (process.env.PUBLIC_WEB_URL || "").trim();
  return (env || DEFAULT_WEB_BASE).replace(/\/$/, "");
};

/**
 * POST /api/referral/link
 * Crea (o reutiliza) el enlace corto de un referidor para un producto.
 * Solo disponible para referidores APROBADOS.
 * Body: { productId }.
 * Devuelve: { success, code, shortUrl, clicks, referrerSharePercent }.
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

    // Reparto vigente: el referidor NO se lleva el 100% del reward, se lleva
    // `referrerSharePercent` (default 75). Lo devolvemos para que la vista del
    // referidor muestre SU parte exacta y no el total. Config pública singleton.
    let referrerSharePercent = 75;
    try {
      const config = await getReferralConfig();
      const share = Number(config?.referrerSharePercent);
      if (Number.isFinite(share)) referrerSharePercent = share;
    } catch {
      /* usamos el default 75 */
    }

    // El shortUrl apunta al BACKEND (donde vive /r/<code>).
    const apiBase = apiBaseFromReq(req);

    res.status(200).json({
      success: true,
      code,
      clicks,
      shortUrl: `${apiBase}/r/${code}`,
      referrerSharePercent,
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
