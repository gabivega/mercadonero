// models/SellerCredit.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * CRÉDITO A FAVOR DEL VENDEDOR por compras pagadas con "saldo de recompensas".
 *
 * Contexto (modelo off-chain):
 *   - El comprador puede pagar parte (o todo) con su saldo de recompensas
 *     (cashback + reintegro de referidos). Ese saldo YA lo tiene la plataforma
 *     (salió de fees de ventas previas).
 *   - Cuando usa su saldo, el ESCROW se fondea por el monto restante. El seller,
 *     entonces, cobra de menos en el escrow.
 *   - Para compensarlo, la plataforma le queda DEBIENDO ese monto al seller y lo
 *     registra acá como un SellerCredit (pendiente). La plataforma se lo
 *     transfiere manualmente y, al hacerlo, se marca como "claimed".
 *
 * Es un "pasivo" de la plataforma con el vendedor, 100% off-chain. No toca el
 * contrato: el escrow cobra siempre lo que el comprador efectivamente fondea.
 *
 * Un seller puede tener VARIOS créditos (uno por orden pagada con saldo), y se
 * reclaman de a uno o todos juntos. Por eso es una colección y no un campo.
 */
const sellerCreditSchema = new Schema(
  {
    // Vendedor al que se le debe el crédito.
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Orden que originó el crédito (una orden = máximo un crédito).
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // Monto en USD que la plataforma le debe al seller por el saldo que usó
    // el comprador en esta orden (= rewards aplicados en el checkout).
    amountUsd: { type: Number, required: true },

    // Desglose de qué saldo usó el comprador (auditoría).
    breakdown: {
      cashbackUsd: { type: Number, default: 0 },
      referralUsd: { type: Number, default: 0 },
    },

    // Estado del crédito:
    //   "pending"  → la plataforma todavía se lo debe al seller.
    //   "claimed"  → ya se le transfirió manualmente y se descontó del pasivo.
    //   "cancelled"→ la orden se canceló/reembolsó; el crédito deja de aplicar.
    status: {
      type: String,
      enum: ["pending", "claimed", "cancelled"],
      default: "pending",
      index: true,
    },

    // Cuándo se le pagó efectivamente al seller (transferencia manual).
    claimedAt: { type: Date, default: null },
    // Referencia del pago manual (hash tx, número de operación, etc.).
    claimRef: { type: String, default: "" },
    // Quién marcó el claim como pagado (admin) si aplica.
    claimedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Una orden genera como máximo un crédito.
sellerCreditSchema.index({ order: 1 }, { unique: true });

const SellerCredit =
  mongoose.models.SellerCredit ||
  mongoose.model("SellerCredit", sellerCreditSchema);

export default SellerCredit;
