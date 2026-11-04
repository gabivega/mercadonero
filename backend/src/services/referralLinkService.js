// services/referralLinkService.js
import crypto from "crypto";
import ReferralLink from "../models/ReferralLink.js";

/**
 * Genera un código corto único (7 chars, base64url). Reintenta ante colisión.
 * Devuelve el string del código (no crea el documento todavía).
 */
const makeCode = () => crypto.randomBytes(5).toString("base64url").slice(0, 7);

/**
 * Obtiene (o crea) el enlace corto de un referidor para un producto.
 * Idempotente por (referrer, product): si ya existe, lo reutiliza.
 *
 * @param {ObjectId} referrerId
 * @param {ObjectId} productId
 * @param {string} slugSnapshot
 * @returns {Promise<{ code:string, clicks:number }>}
 */
export async function getOrCreateReferralLink(
  referrerId,
  productId,
  slugSnapshot = "",
) {
  // 1) ¿Ya existe?
  let link = await ReferralLink.findOne({
    referrer: referrerId,
    product: productId,
  });
  if (link) return { code: link.code, clicks: link.clicks || 0 };

  // 2) Crear con reintentos ante colisión de `code` (índice único global).
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      link = await ReferralLink.create({
        code: makeCode(),
        referrer: referrerId,
        product: productId,
        slugSnapshot: slugSnapshot || "",
      });
      return { code: link.code, clicks: link.clicks || 0 };
    } catch (e) {
      if (e?.code === 11000) {
        // Puede ser colisión de `code` (reintentar) o de (referrer,product)
        // (carrera: otro request ya lo creó → recuperarlo).
        const existing = await ReferralLink.findOne({
          referrer: referrerId,
          product: productId,
        });
        if (existing) return { code: existing.code, clicks: existing.clicks || 0 };
        continue; // colisión de code → reintentar
      }
      throw e;
    }
  }
  throw new Error("No se pudo generar el enlace corto.");
}

/**
 * Resuelve un código: devuelve el link poblado con el slug del producto, o null.
 */
export async function resolveReferralCode(code) {
  return ReferralLink.findOne({ code }).populate("product", "slug");
}

/**
 * Incrementa el contador de clics de un enlace (no bloqueante).
 */
export function trackClick(linkId) {
  ReferralLink.updateOne(
    { _id: linkId },
    { $inc: { clicks: 1 }, $set: { lastClickAt: new Date() } },
  ).catch((e) => console.error("Error contando clic de referido:", e));
}
