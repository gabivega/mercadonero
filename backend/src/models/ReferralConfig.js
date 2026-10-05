// models/ReferralConfig.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Configuración GLOBAL del sistema de REFERIDOS (reintegros por compartir).
 *
 * Es un singleton (un único documento) que el admin gestiona desde el panel,
 * análogo a CashbackConfig. El modelo de negocio:
 *
 *   - El VENDEDOR decide, por producto, qué % de reintegro (reward) ofrece
 *     (product.referral.percent). Ese % sale de su margen/colateral.
 *   - El reconpmensa se reparte 50/50: la mitad para quien COMPARTIÓ el enlace
 *     (referidor) y la mitad para el COMPRADOR (reintegro).
 *   - El % total on-chain NO cambia: en el flujo normal (pago ARS + colateral
 *     USDT) el backend pasa al contrato un fee por orden = feeNero + reward.
 *     Ese monto extra emerge del colateral del vendedor y, off-chain, se
 *     acredita como reward al referidor y al comprador.
 *
 * Esta config define los TOPES y DEFAULTS que el admin controla:
 *   - enabled: activa/desactiva referidos a nivel plataforma.
 *   - defaultPercent: % sugerido por defecto en el form del seller.
 *   - maxPercent: tope duro que un seller NO puede superar.
 *   - maxRewardUsdPerOrder: tope de reward (USD) por orden (0 = sin tope).
 *   - platformFeePercent: comisión real de Nero (informativa; debe coincidir
 *     con el fee base que hoy está en 3%).
 */
const referralConfigSchema = new Schema(
  {
    // Campo fijo "true" para forzar documento único en la colección.
    singleton: { type: Boolean, default: true, required: true },

    // Flag global: si es false, no se generan recompensas de referidos.
    enabled: { type: Boolean, default: true },

    // % sugerido por defecto en el formulario del vendedor.
    defaultPercent: { type: Number, default: 10 },

    // % MÁXIMO que un vendedor puede configurar por producto (tope duro).
    maxPercent: { type: Number, default: 20 },

    // Tope del reward (USD) que puede generar una única orden. 0 = sin tope.
    maxRewardUsdPerOrder: { type: Number, default: 0 },

    // Comisión real de Nero (base). Informativa para el panel de admin.
    // El fee efectivo on-chain por orden será platformFeePercent + rewardPercent.
    platformFeePercent: { type: Number, default: 3 },

    // Umbral mínimo (USD) de saldo de referidos para poder retirar.
    minWithdrawalUsd: { type: Number, default: 5 },

    // Si el saldo de referidos se puede retirar fuera de la plataforma (a la
    // wallet del usuario). El admin puede cortarlo sin desactivar todo el
    // programa de referidos. Por defecto permitido.
    allowWithdraw: { type: Boolean, default: true },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Índice único sobre `singleton`: impide que exista más de un documento.
referralConfigSchema.index({ singleton: 1 }, { unique: true });

const ReferralConfig =
  mongoose.models.ReferralConfig ||
  mongoose.model("ReferralConfig", referralConfigSchema);

export default ReferralConfig;
