import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Modelo POOL (Social Selling / Compra en Grupo)
 * ──────────────────────────────────────────────────────────────────────
 * Un "pool" es un grupo de compradores que se juntan para comprar un mismo
 * producto a un precio mejor, que baja a medida que se suman personas
 * (los descuentos por cantidad los define el vendedor en
 * `product.socialSelling.tiers`, indexado por cantidad de compradores: 2..5).
 *
 * Se guarda en su PROPIA colección (no embebido en Product) para poder:
 *   - listar/filtrar pools por producto,
 *   - indexar por `expiresAt` y estado,
 *   - escalar sin tocar el documento del producto.
 *
 * Estados:
 *   - "open":      el grupo está juntando compradores.
 *   - "filled":    se alcanzó el objetivo (targetBuyers) → se congela el precio.
 *   - "expired":   pasó `expiresAt` sin llenarse.
 *   - "cancelled": se canceló (por el creador o por el sistema).
 *
 * NOTA (MVP / escrow): todavía NO se interactúa con blockchain. Cada miembro
 * tiene un `escrowStatus` placeholder ("pending") para dejar el flujo completo
 * y sólo "enchufar" el contrato inteligente más adelante.
 * ──────────────────────────────────────────────────────────────────────
 */

// Miembro del pool: referencia al User + snapshot para render rápido
// (evita populate para mostrar avatar/username en las cards).
const poolMemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, default: "" }, // snapshot
    avatar: { type: String, default: "" }, // snapshot
    joinedAt: { type: Date, default: Date.now },
    // ── MULTI-UNIDAD (contrato v2) ──────────────────────────────────
    // Cada comprador puede pedir N unidades del producto. El tier se define
    // por CANTIDAD DE PERSONAS (2..5), pero cada persona aporta `units`.
    units: { type: Number, default: 1, min: 1 },
    // Wallet que fondea el grupo on-chain (la del comprador).
    wallet: { type: String, default: "", trim: true },
    // Monto congelado on-chain (wei como string) al momento de fondear.
    locked: { type: String, default: "0" },
    // Precio final unitario aplicado a este member al liberar (USDT).
    finalUnitPriceUsd: { type: Number, default: 0 },
    // Placeholder de escrow. Cuando exista el contrato:
    // "pending" → "locked" (fondos congelados on-chain) → "released"/"refunded".
    escrowStatus: {
      type: String,
      enum: ["pending", "locked", "released", "refunded", "failed"],
      default: "pending",
    },
    txHash: { type: String, trim: true, default: "" }, // hash de la tx de fondeo
    fundedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    // Hash del release on-chain de ESTE member (si aplica).
    releaseTxHash: { type: String, trim: true, default: "" },
    // Marca para revisión manual: p.ej. el fondeo on-chain se confirmó pero
    // ya no había stock físico para reservar (caso borde).
    needsReview: { type: Boolean, default: false },
  },
  { _id: true },
);

const poolSchema = new Schema(
  {
    // Producto al que pertenece el pool (obligatorio).
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    // Vendedor del producto (denormalizado para filtrar/consultar rápido).
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Quién creó el grupo (puede con el tiempo alguien distinto al vendedor).
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Compradores que se sumaron.
    members: { type: [poolMemberSchema], default: [] },

    // Objetivo de compradores para alcanzar el mejor precio.
    // Alineado al social selling actual, es 5.
    targetBuyers: { type: Number, default: 5, min: 2, max: 5 },

    // Cuándo expira el pool. Al leer, si ya pasó y sigue "open", se
    // calcula/actualiza a "expired" (expiración LAZY, sin cron).
    expiresAt: { type: Date, required: true, index: true },

    status: {
      type: String,
      enum: ["open", "filled", "expired", "cancelled"],
      default: "open",
      index: true,
    },

    // Snapshots de precio (para no depender del producto al renderizar).
    //   - baseUnitPrice:    precio del producto al crear el pool.
    //   - currentUnitPrice: precio unitario al alcanzar el nº de miembros actual.
    //   - targetUnitPrice:  precio objetivo (tier de targetBuyers).
    baseUnitPrice: { type: Number, default: 0 },
    currentUnitPrice: { type: Number, default: 0 },
    targetUnitPrice: { type: Number, default: 0 },

    // Cuándo se llenó (si llegó a "filled"), para auditoría.
    filledAt: { type: Date, default: null },

    // ──────────────────────────────────────────────────────────────
    // ESCROW ON-CHAIN (contrato NeroGroupBuy v2)
    // ──────────────────────────────────────────────────────────────
    // groupId on-chain = Pool._id.toString() (decisión confirmada).
    chainGroupId: { type: String, default: null, index: true },
    escrowAddress: { type: String, default: "" }, // dirección del contrato usado
    // Cotización (TDC, ARS/USD) snapshot al CREAR el pool. Se usa como rate de
    // referencia para el precio en USDT y para validar/consistir el fondeo.
    rateAtLock: { type: Number, default: 0 },
    // Total de unidades reservadas por los members de este pool (espejo de
    // la suma de member.units, útil para reserva de stock y auditoría).
    reservedUnits: { type: Number, default: 0 },
    // Precio final unitario fijado al cerrar el grupo (USDT).
    finalUnitPriceUsd: { type: Number, default: 0 },
    closeTxHash: { type: String, default: "" },   // tx de closeGroup on-chain
    refundTxHash: { type: String, default: "" },  // tx de refundCreator (expiración 1)
    closedAt: { type: Date, default: null },

    // ──────────────────────────────────────────────────────────────
    // SINCRONIZACIÓN DE ÓRDENES AL LIBERAR
    // Al cerrarse el grupo (release on-chain), se crea UNA orden 'paid' por
    // member. Estos campos dan idempotencia y trazabilidad del proceso.
    // ──────────────────────────────────────────────────────────────
    orderSyncStatus: {
      type: String,
      enum: ["pending", "running", "partial", "done", "failed"],
      default: "pending",
      index: true,
    },
    orderSyncStartedAt: { type: Date, default: null },
    orderSyncFinishedAt: { type: Date, default: null },
    orderSyncError: { type: String, default: "" },
    orderSyncLog: [
      {
        memberId: { type: Schema.Types.ObjectId },
        orderId: { type: Schema.Types.ObjectId, ref: "Order" },
        ok: { type: Boolean, default: false },
        error: { type: String, default: "" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// Índices compuestos para las queries típicas.
poolSchema.index({ product: 1, status: 1 });
poolSchema.index({ product: 1, status: 1, expiresAt: 1 });

export default mongoose.model("Pool", poolSchema);
