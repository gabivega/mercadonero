// models/Referral.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Registro de una RECOMPENSA DE REFERIDO asociada a una orden concreta.
 *
 * Se crea al COMPLETARSE la orden (igual que el cashback). Modela el modelo
 * de negocio "50-50": de un reward total (product.referral.percent sobre el
 * subtotal USD sin envío), la mitad va al REFERIDOR (quien compartió el
 * enlace) y la otra mitad al COMPRADOR (reintegro).
 *
 * Es el equivalente de "order.cashback" pero como colección aparte, porque:
 *   - Puede haber 0 o 1 referidor por orden (relación 1:1 con la orden).
 *   - Necesitamos auditar por separado cada acreditación (idempotencia).
 *   - Más adelante servirá para la liquidación del fee extra on-chain.
 *
 * La acreditación en los saldos (User.referral.balance) es idempotente vía
 * `creditAccrued`: si ya se acreditó, no se vuelve a hacer.
 */
const referralSchema = new Schema(
  {
    // Orden que generó la recompensa (única por orden).
    // ⚠️ NO usar `index: true` acá: el índice único se declara abajo con
    // `referralSchema.index({ order: 1 }, { unique: true })`. Tener ambos
    // genera el warning de Mongoose "Duplicate schema index on {order:1}".
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // Producto que ofrecía el referido (para trazabilidad del % aplicado).
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },

    // Comprador de la orden (recibe su mitad como reintegro).
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Referidor (quien compartió el enlace). Si el registro existe, es porque
    // hubo un referidor identificado y válido.
    referrer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ── CÁLCULO (auditoría) ──
    // % total configurado por el vendedor en el producto (ej 10 = 10%).
    percent: { type: Number, required: true },
    // Base de cálculo en USD: subtotal de productos SIN envío (precio final).
    baseUsd: { type: Number, required: true },
    // Reward total en USD antes de repartir (percent% de baseUsd).
    totalUsd: { type: Number, required: true },
    // Monto acreditado a cada parte (totalUsd / 2, redondeado).
    referrerUsd: { type: Number, required: true },
    buyerUsd: { type: Number, required: true },

    // ── GESTIÓN ──
    // Si la recompensa ya fue acreditada en los saldos (evita doble crédito).
    creditAccrued: { type: Boolean, default: false },
    // Estado del ciclo de vida de la recompensa.
    status: {
      type: String,
      enum: ["pending", "credited", "cancelled"],
      default: "pending",
    },
    // Cuándo se acreditó efectivamente.
    creditedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Índice único por orden (una orden = un registro de referido).
referralSchema.index({ order: 1 }, { unique: true });

const Referral =
  mongoose.models.Referral || mongoose.model("Referral", referralSchema);

export default Referral;
