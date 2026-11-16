// models/ReferralLink.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Enlace corto de referido para COMPARTIR un producto.
 *
 * Cada referidor, por producto, tiene UN enlace corto reutilizable:
 *   prod: https://mercadonero.com/r/<code>
 *   dev:  http://localhost:3000/r/<code>   (la base la resuelve el controller
 *         según NODE_ENV / PUBLIC_API_URL, ver referralLinkController.js)
 * que redirige (302) a /producto/<slug>?ref=<referrerId> en el frontend
 * (dev: http://localhost:5173, prod: https://mercadonero.com).
 *
 * Sirve para:
 *   - Links "lindos" y cortos para postear en X/WhatsApp/Telegram.
 *   - Contar clics (ítem 2 del plan: tracking de compartidos).
 *
 * NO es la recompensa (esa vive en `Referral`, al completarse la orden). Acá
 * solo modelamos el enlace y sus métricas de uso.
 */
const referralLinkSchema = new Schema(
  {
    // Código corto público (único). Ej: "a1b2c3d4".
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // Referidor dueño del enlace.
    referrer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Producto al que apunta el enlace (para resolver slug/redirección).
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // Snapshot del slug al momento de crear (por si cambia). La redirección
    // igual resuelve el slug actual desde el producto, pero lo guardamos para
    // no romper si el producto se borra.
    slugSnapshot: { type: String, default: "" },

    // ── MÉTRICAS ──
    clicks: { type: Number, default: 0 }, // total de aperturas del enlace
    lastClickAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Un referidor tiene UN solo enlace por producto (reutilizable).
referralLinkSchema.index({ referrer: 1, product: 1 }, { unique: true });

const ReferralLink =
  mongoose.models.ReferralLink ||
  mongoose.model("ReferralLink", referralLinkSchema);

export default ReferralLink;

