// models/Order.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const orderSchema = new Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Array de IDs para facilitar queries rápidas de "quién compró qué"
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

    itemsSnapshot: [
      {
        // --- Vínculo y Cantidad (Esenciales) ---
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, required: true, default: 1 },

        // --- Datos capturados del producto ---
        title: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, default: "ARS" },
        condition: String,

        // --- Logística capturada ---
        shipping: {
          free: { type: Boolean, default: false },
          cost: { type: Number, default: 0 },
          isDigital: { type: Boolean, default: false },
          mode: {
            type: String,
            enum: ["shipping_service", "pickup", "both"],
            default: "both",
          },
          dimensions: {
            weight: Number,
            width: Number,
            height: Number,
            depth: Number,
          },
          shippingTime: {
            type: String,
            enum: ["24h", "48h", "72h", "more"],
            default: "48h",
          },
        },
        images: [String],
        category: String,
        subCategory: String,
        brand: String,
        specifications: [{ key: String, value: String }],
      },
    ],

    shippingAddress: {
      street: String,
      streetNumber: String,
      city: String,
      province: String,
      zipCode: String,
      addressType: String,
    },
    productsAmount: { type: Number, required: true },
    shippingAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "awaiting_collateral",
        "pending_payment",
        "verifying_payment",
        "paid",
        "shipped",
        "completed",
        "cancelled",
        "expired",
      ],
      default: "pending_payment",
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: [
            "awaiting_collateral",
            "pending_payment",
            "verifying_payment",
            "paid",
            "shipped",
            "completed",
            "cancelled",
            "expired",
          ],
          required: true,
        },
        changedAt: { type: Date, default: Date.now },
        comment: { type: String }, // Útil para cuando el admin cancela manualmente
      },
    ],
    paymentProof: { type: String },
    paymentVerifiedAt: { type: Date }, // Cuando el vendedor da el OK al pago
    completedAt: { type: Date }, // Cierre final (disparo de Smart Contract)
    releaseTxHash: { type: String }, // Hash de la transacción de liberación
    collateralTxHash: { type: String }, // Hash de la transacción de congelamiento del colateral
    shippingDetails: {
      provider: { type: String },
      trackingNumber: { type: String },
      shippedAt: { type: Date },
      deliveredAt: { type: Date },
      otherProviderDetail: { type: String }, // Por si eligen "Otro"
    },
    financials: {
      usdRate: { type: Number, required: true }, // Cotización usada al momento de la orden
      totalUsd: { type: Number, required: true }, // Valor total de la orden en USD
      platformFeeUsd: { type: Number, required: true }, // El 3% en USD
      shippingCostUsd: { type: Number, default: 0 }, // Costo de envío en USD (si aplica)
      sellerNetReleaseUsd: { type: Number, required: true }, // Lo que efectivamente recibe el vendedor
    },

    // ────────────────────────────────────────────────
    // CASHBACK (acumulación en BD) - auditoría por orden
    // ────────────────────────────────────────────────
    cashback: {
      // Monto de cashback acreditado al comprador al completarse la orden.
      earnedUsd: { type: Number, default: 0 },
      // Tasa efectiva usada (feePercent de la config global o override).
      feePercentUsed: { type: Number, default: 0 },
      // Si el comprador usó cashback para descontar el pago de ESTA orden.
      usedInCheckout: { type: Number, default: 0 }, // USD descontados con cashback
      // Si el cashback de esta orden fue acreditado (evita acreditación doble).
      creditAccrued: { type: Boolean, default: false },
    },
    expiresAt: { type: Date, required: true },

    // ────────────────────────────────────────────────
    // PAGO CON CRIPTOMONEDAS (Escrow NeroEscrow)
    // Cuando payment.method === "crypto", el comprador fondea USDT/USDC/DAI
    // en el contrato escrow y los fondos quedan retenidos hasta que el admin
    // libera (comprador confirmó recepción) o cancela (reembolso al comprador).
    // ────────────────────────────────────────────────
    payment: {
      method: {
        type: String,
        enum: ["bank_transfer", "crypto"],
        default: "bank_transfer",
      },
      token: {
        type: String,
        enum: ["USDT", "USDC", "DAI", "BNB"],
        default: "USDT",
      },
      status: {
        type: String,
        enum: ["unpaid", "funding", "funded", "released", "cancelled_refunded"],
        default: "unpaid",
      },
      tokenAddress: { type: String, default: "" },        // dirección del token usado
      amountUsdRetained: { type: Number, default: 0 },    // monto total USDT retenido (productos + envío)
      feeBps: { type: Number, default: 0 },               // fee global del contrato en puntos base al momento de la orden
      feeUsd: { type: Number, default: 0 },               // comisión del backend (feeBps sobre el total)
      sellerNetUsd: { type: Number, default: 0 },         // lo que recibe el vendedor (neto)
      fundTxHash: { type: String, default: "" },          // tx del comprador fondeando el escrow
      releaseTxHash: { type: String, default: "" },       // tx del admin liberando al vendedor
      cancelTxHash: { type: String, default: "" },        // tx del admin devolviendo al comprador
      fundedAt: { type: Date, default: null },            // cuándo se fondeó on-chain
      releasedAt: { type: Date, default: null },          // cuándo se liberó (vendió)
      cancelledRefundedAt: { type: Date, default: null }, // cuándo se reembolsó
    },

    // ────────────────────────────────────────────────
    // HOLD DE COLATERAL (estado "awaiting_collateral")
    // Cuando el vendedor no tiene saldo de garantía libre suficiente para
    // cubrir una orden, ésta entra a un estado intermedio de espera hasta que
    // el vendedor deposite (15 min) o el comprador la cancele/expire.
    // ────────────────────────────────────────────────
    collateralHold: {
      requestedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },       // Dead-line del vend, 15 min
      reserveUsd: { type: Number, default: 0 },       // Monto USDT reservado en capacidad
      reason: { type: String, default: "" },          // "insufficient_collateral"
      status: {
        type: String,
        enum: ["pending", "fulfilled", "expired", "cancelled"],
        default: "pending",
      },
      fulfilledAt: { type: Date, default: null },      // Cuando el vendedor depositó
      expiredAt: { type: Date, default: null },        // Cuando venció el plazo
      cancelledAt: { type: Date, default: null },      // Cuando se canceló la espera
      // Nota: cuando el vendedor deposita y la orden pasa a 'pending_payment',
      // status -> "fulfilled" y se libera el campo collateralTxHash con el
      // hash real del lock on-chain (guardado en collateralTxHash como hoy).
    },

    // Quién canceló (o expiró) la orden. Sirve para decidir qué ratings de
    // usuario ("seller_rating" / "buyer_rating") están habilitados cuando la
    // orden terminó cancelada. Valores: "buyer" | "seller" | "admin" | "system".
    // Usamos default: null (no "") para que el enum NO falle al crear una orden
    // que todavía no fue cancelada (Mongoose solo valida el enum si no es null).
    cancelledBy: { type: String, enum: ["buyer", "seller", "admin", "system"], default: null },

    // Solicitud de cancelación pendiente (cuando el pago ya fue abonado y
    // falta que el vendedor reembolse para cerrar la cancelación).
    pendingRequest: {
      exists: { type: Boolean, default: false },
      initiator: { type: String, enum: ["buyer", "seller"], default: "buyer" },
      paidStatus: { type: String, enum: ["not_paid", "paid"], default: "paid" },
      status: {
        type: String,
        enum: ["pending", "refunded_by_vendor", "completed"],
        default: "pending",
      },
      reason: { type: String, default: "" },
      refundBankAccount: {
        bankName: String,
        holderName: String,
        cbuCvu: String,
        alias: String,
        cuitCuil: String,
        accountType: String,
      },
      createdAt: { type: Date, default: Date.now },
    },

    // Solicitud del vendedor al admin para liberar su garantía manualmente
    // (por seguridad, el vendedor no libera su colateral por sí mismo).
    releaseRequest: {
      exists: { type: Boolean, default: false },
      requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, default: "" },
      status: {
        type: String,
        enum: ["pending", "approved_released", "declined"],
        default: "pending",
      },
      createdAt: { type: Date, default: Date.now },
    },

    // ────────────────────────────────────────────────
    // DISPUTA (comprador reporta un problema con el pedido despachado)
    // Cuando el comprador abre una disputa, la garantía del vendedor queda
    // retenida y el admin debe resolverla manualmente. Mientras exists=true,
    // el comprador NO puede marcar la orden como recibida.
    // ────────────────────────────────────────────────
    dispute: {
      exists: { type: Boolean, default: false },
      raisedBy: { type: Schema.Types.ObjectId, ref: "User" },
      issueType: { type: String, default: "" },
      description: { type: String, default: "" },
      status: {
        type: String,
        enum: ["open", "resolved_refund", "resolved_release", "dismissed"],
        default: "open",
      },
      txHash: { type: String, default: "" },
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      resolution: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
      resolvedAt: { type: Date, default: null },
    },

    // ────────────────────────────────────────────────
    // CANCELACIONES / DEVOLUCIONES / RECLAMOS
    // Registro de acciones anti-abuso. Cada evento de
    // cancelación/reembolso/reclamo se anota acá con su
    // resultado, para poder auditarlo y limitar abusos.
    // ────────────────────────────────────────────────
    orderActions: [
      {
        type: {
          type: String,
          enum: [
            "cancel_request", // Solicitud de cancelación (se registra, pendiente)
            "cancel_executed", // Cancelación efectiva (se liberó colateral / se cerró)
            "refund_request", // Comprador pidió reembolso porque ya abonó
            "refund_confirmed", // Vendedor confirmó que reembolsó
            "refund_declined", // Vendedor no reembolsará (queda para soporte/admin)
            "claim", // Reclamo del comprador (post-envío)
            "return_request", // Devolución post-despacho
            "admin_intervention", // Intervención del admin
            "dispute_opened", // Comprador reportó un problema → se abre disputa
          ],
          required: true,
        },
        initiator: {
          type: String,
          enum: ["buyer", "seller", "admin", "system"],
          required: true,
        },
        paidStatus: {
          type: String,
          enum: ["not_paid", "paid", "unknown"],
          default: "unknown",
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "completed", "declined"],
          default: "pending",
        },
        reason: { type: String, default: "" },
        // Datos bancarios que el comprador provee para recibir el reembolso
        refundBankAccount: {
          bankName: String,
          holderName: String,
          cbuCvu: String,
          alias: String,
          cuitCuil: String,
          accountType: String,
        },
        // Hash de la liberación de colateral asociada (si aplica)
        releaseTxHash: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
