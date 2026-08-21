// models/CashbackConfig.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Configuración GLOBAL del sistema de cashback.
 * Se guarda como un documento único (singleton) que el admin gestiona
 * desde el panel. Así podemos:
 *   - Activar/desactivar el cashback a nivel global.
 *   - Cambiar el importe (% sobre la comisión) sin tocar código.
 *   - Ajustar el umbral mínimo de retiro/uso.
 *   - Poner un tope de cashback por orden (opcional).
 *
 * Uso en el backend: getCashbackConfig() del cashbackService.
 * Si no existe documento, se crean/usan los defaults.
 */
const cashbackConfigSchema = new Schema(
  {
    // Campo fijo "true" para forzar documento único en la colección.
    singleton: { type: Boolean, default: true, required: true },

    // Flag global: si es false, no se acumula cashback en ninguna orden.
    enabled: { type: Boolean, default: true },

    // Porcentaje de la COMISIÓN (fee) del vendedor que se devuelve como
    // cashback al comprador. Ej: 0.3 => se devuelve el 30% del fee (0.03*0.3 = 0.9%).
    // Pensado como "importe" editable desde admin.
    feePercent: { type: Number, default: 0.3 }, // % de la comisión que se reintegra

    // Umbral mínimo (en USD) que debe alcanzar el balance para poder
    // retirar/usar el cashback. Antes de eso queda "pendiente de límite".
    minWithdrawalUsd: { type: Number, default: 5 },

    // Tope de cashback que genera una única orden (en USD). 0 = sin tope.
    maxPerOrderUsd: { type: Number, default: 0 },

    // Si el cashback se puede usar para comprar dentro de la plataforma.
    allowUseInCheckout: { type: Boolean, default: true },

    // Si el cashback se puede retirar fuera de la plataforma (extracción a wallet).
    allowWithdraw: { type: Boolean, default: true },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Índice único sobre `singleton`: impide que exista más de un documento.
cashbackConfigSchema.index({ singleton: 1 }, { unique: true });

const CashbackConfig =
  mongoose.models.CashbackConfig ||
  mongoose.model("CashbackConfig", cashbackConfigSchema);

export default CashbackConfig;

