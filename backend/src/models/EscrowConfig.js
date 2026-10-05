// models/EscrowConfig.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Configuración GLOBAL del sistema de ESCROW (pagos en criptomonedas).
 *
 * Singleton análogo a ReferralConfig / CashbackConfig, gestionado por el admin.
 *
 * Qué controla:
 *   - releaseFallbackDays: días que deben pasar desde que el comprador fondeó
 *     el escrow sin confirmar la recepción, para que pueda SOLICITAR al admin
 *     la liberación manual al vendedor (fallback anti-bloqueo).
 *
 * Nota: el fee (feeBps) y la feeWallet viven ON-CHAIN en el contrato NeroEscrow;
 * se administran con las funciones setFeeBps/setFeeWallet (ver escrowServices).
 */
const escrowConfigSchema = new Schema(
  {
    // Campo fijo "true" para forzar documento único en la colección.
    singleton: { type: Boolean, default: true, required: true },

    // Días de espera (desde el fondeo) sin confirmación del comprador para
    // habilitar su solicitud de liberación manual al admin. Default 7 días.
    releaseFallbackDays: { type: Number, default: 7 },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

escrowConfigSchema.index({ singleton: 1 }, { unique: true });

const EscrowConfig =
  mongoose.models.EscrowConfig ||
  mongoose.model("EscrowConfig", escrowConfigSchema);

export default EscrowConfig;
