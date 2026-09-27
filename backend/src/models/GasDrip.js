import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Modelo GAS DRIP
 * ──────────────────────────────────────────────────────────────────────
 * Registra cada micro-transferencia de BNB que la PLATAFORMA le envía a un
 * comprador para cubrir el gas de sus transacciones de escrow (approve +
 * createGroup/joinGroup), SIN que el comprador tenga que fondear su wallet.
 *
 * Por qué existe:
 *   - Auditoría: saber cuánto BNB salió de la wallet admin y a quién.
 *   - Anti-abuso: limitar cuántos drips puede pedir un usuario por día.
 *
 * IMPORTANTE: la plataforma NUNCA custodia USDT. Solo regala un poco de BNB
 * (gas) just-in-time. El USDT siempre sale de la wallet del comprador al
 * contrato de escrow.
 * ──────────────────────────────────────────────────────────────────────
 */
const gasDripSchema = new Schema(
  {
    // Usuario que recibió el drip.
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Wallet que recibió los BNB (la embedded del comprador).
    walletAddress: {
      type: String,
      lowercase: true,
      trim: true,
      required: true,
      index: true,
    },
    // Monto de BNB entregado (en formato decimal legible, ej: 0.001).
    amountBnb: { type: Number, required: true },
    // Monto en wei como string (para precisión exacta).
    amountWei: { type: String, required: true },
    // txHash de la transferencia de BNB on-chain.
    txHash: { type: String, trim: true, default: "" },

    // Motivo / contexto del drip.
    reason: {
      type: String,
      enum: ["create_group", "join_group", "approve", "other"],
      default: "other",
      index: true,
    },
    // Referencia opcional al Pool/orden que motivó el drip.
    refId: { type: Schema.Types.ObjectId },

    // Balance de BNB que tenía el usuario ANTES del drip (para auditoría).
    balanceBeforeWei: { type: String, default: "0" },

    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

// Índice para contar drips por usuario en una ventana de tiempo (rate-limit).
gasDripSchema.index({ user: 1, createdAt: -1 });
gasDripSchema.index({ walletAddress: 1, createdAt: -1 });

export default mongoose.model("GasDrip", gasDripSchema);
