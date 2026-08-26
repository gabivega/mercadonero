import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Esquema de Transacciones:
 * Para guardar un historial rápido en el perfil del usuario
 * sin tener que consultar la blockchain cada vez.
 */
const transactionSchema = new Schema({
  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  txHash: {
    type: String,
    trim: true,
  }, // Referencia al hash en BSCScan
  description: {
    type: String,
  }, // Ej: "Pago de producto #1234"
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/**
 * Esquema de Wallet:
 * Manejado por Privy, pero sincronizado aquí para consultas rápidas.
 */
const walletSchema = new Schema({
  address: {
    type: String,
    lowercase: true,
    trim: true,
  },
  balance: {
    type: Number,
    default: 0,
  }, // Cache de balance en USDT o BNB
  transactions: [transactionSchema],
});

/**
 * Esquema de Usuario Principal
 */
const userSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // ID Único proporcionado por Privy (did:privy:...)
    privyDid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    dni: { type: String, trim: true, default: "" },
    phone: {
      type: String,
    },
    isSeller: {
      type: Boolean,
      default: false,
    },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    bio: { type: String, maxLength: 300, default: "" },
    avatar: { type: String, default: "" },
    username: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true, // IMPORTANTE: Para que /store/Gabi y /store/gabi sean lo mismo
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    // Indica si el usuario completó sus datos básicos obligatorios de compra
    // (nombre, apellido, DNI y teléfono). Se usa para bloquear el checkout
    // hasta que complete el onboarding.
    profileCompleted: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 0,
    },
    // DATOS BANCARIOS
    // models/User.js (o Profile.js)
    bankAccounts: [
      {
        bankName: { type: String, required: true },
        accountType: {
          type: String,
          enum: ["Caja de Ahorros", "Cuenta Corriente"],
          default: "Caja de Ahorros",
        },
        holderName: { type: String, required: true }, // Titular
        cuitCuil: { type: String, required: true },
        cbuCvu: { type: String, required: true, unique: true },
        alias: { type: String, required: true },
        isDefault: { type: Boolean, default: false },
      },
    ],
    // Datos de Envío
    addresses: [
      {
        country: String,
        province: String,
        city: String,
        street: String,
        streetNumber: String,
        zipCode: String, // String para soportar formatos internacionales y ceros a la izquierda
        apartment: String,
        floor: String,
        isDefault: { type: Boolean, default: false },
        betweenStreets: { type: String, default: "" },
        references: { type: String, default: "" },
        addressType: {
          type: String,
          enum: ["home", "work", "other"],
          default: "home",
        },
      },
    ],

    // --- DATOS DE VENDEDOR (TIENDA) ---
    shop: {
      active: { type: Boolean, default: false }, // Solo true si completó el onboarding
      name: { type: String, trim: true, default: "" },
      description: { type: String, maxLength: 500, default: "" },
      logo: { type: String, default: "" },
      banner: { type: String, default: "" },
      dispatchTime: {
        type: String,
        enum: ["24hs", "48hs", "72hs", "+72hs"],
        default: "24hs",
      },
      rating: { type: Number, default: 0 }, // Rating como vendedor
      totalSalesCount: { type: Number, default: 0 },

      // Ubicación de despacho (puede ser distinta a la personal)
      location: {
        city: { type: String, default: "" },
        province: { type: String, default: "" },
      },

      // Relaciones movidas adentro
      sales: [{ type: Schema.Types.ObjectId, ref: "Order" }],
      reviews: [
        {
          reviewer: { type: Schema.Types.ObjectId, ref: "User" },
          comment: String,
          rating: Number,
          date: { type: Date, default: Date.now },
        },
      ],

      // DATOS BANCARIOS (Array por si tiene más de uno, ej: CVU y CBU)
      bankAccounts: [
        {
          bankName: { type: String, required: true },
          accountNumber: String,
          cbu: { type: String, required: true }, // O CVU
          cuit: { type: String, required: true },
          // Razón Social. El onboarding de vendedor NO la recopila, así que
          // no es obligatoria para poder guardar la cuenta desde ese flujo.
          businessName: { type: String, default: "" },
          isDefault: { type: Boolean, default: true },
        },
      ],

      // Facturación
      taxCondition: {
        type: String,
        enum: [
          "Monotributista",
          "Responsable Inscripto",
          "Exento",
          "Consumidor Final",
        ],
        default: "Consumidor Final",
      },
      products: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    },

    // Wallet Integrada
    // wallet: walletSchema,
    walletAddress: { type: String, unique: true, sparse: true },

    // ────────────────────────────────────────────────
    // CASHBACK (acumulado en BD, sin tocar blockchain)
    // ────────────────────────────────────────────────
    cashback: {
      balance: { type: Number, default: 0 },   // Saldo acumulado disponible (USD)
      earned: { type: Number, default: 0 },     // Total acumulado histórico (USD)
      spent: { type: Number, default: 0 },      // Total usado en compras (USD)
      withdrawn: { type: Number, default: 0 },  // Total retirado fuera de la plataforma (USD)

      // Override por usuario: si se setea, anula la config global para ESTE user.
      // Puede servir para fidelizar usuarios de pago, dar un % distinto, etc.
      overrideEnabled: { type: Boolean, default: false },
      overrideFeePercent: { type: Number },     // % de comisión a reintegrar (si override)
      overrideMinWithdrawalUsd: { type: Number },

      // Historial opcional de movimientos de cashback (para auditoría/UI).
      // Se puede alimentar desde el cashbackService.
      transactions: [
        {
          type: {
            type: String,
            enum: ["earned", "spent", "withdrawn", "adjustment"],
            required: true,
          },
          amount: { type: Number, required: true },
          description: { type: String, default: "" },
          refType: { type: String, enum: ["order", "withdrawal", "admin", "checkout"], default: "order" },
          refId: { type: mongoose.Schema.Types.ObjectId },
          status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "completed",
          },
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },

    // Relaciones con otros modelos del Marketplace
    favorites: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    purchases: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    posts: [{ type: Schema.Types.ObjectId, ref: "Post" }],
    reviews: [{ type: Schema.Types.ObjectId, ref: "Review" }],

    // ────────────────────────────────────────────────
    // CONTADORES ANTI-ABUSO
    // Registran cuántas cancelaciones / reembolsos /
    // reclamos inició el usuario, para poder limitar y
    // penalizar usos abusivos del sistema.
    // ────────────────────────────────────────────────
    accounting: {
      // Como comprador
      cancellationsAsBuyer: { type: Number, default: 0 },
      refundsRequested: { type: Number, default: 0 },
      claimsOpened: { type: Number, default: 0 },
      returnsRequested: { type: Number, default: 0 },
      // Órdenes generadas por el comprador que expiraron sin pagar
      expiredOrdersAsBuyer: { type: Number, default: 0 },
      // Como vendedor
      cancellationsAsSeller: { type: Number, default: 0 },
      refundsPending: { type: Number, default: 0 }, // Reembolsos que el vendedor debe procesar
      // Órdenes que NO se concretan por falta de colateral del vendedor.
      // Alimentan el futuro sistema de reputación/cobertura y son insumo para
      // que el admin decida qué hacer (penalización o no).
      expiredCollateralHolds: { type: Number, default: 0 },        // venció el plazo sin depositar
      collateralRejectedBySeller: { type: Number, default: 0 },    // el vendedor rechazó la orden
      collateralHoldCancelledByBuyer: { type: Number, default: 0 }, // el comprador canceló la espera
      // Totales de órdenes (para cálculo de % de abuso)
      completedPurchases: { type: Number, default: 0 },
      completedSales: { type: Number, default: 0 },
      // Flags de restricción (se activan si se supera el umbral de abuso)
      restricted: { type: Boolean, default: false },
      restrictionReason: { type: String, default: "" },
    },
  },
  {
    // Crea automáticamente los campos createdAt y updatedAt
    timestamps: true,
  },
);

// Índices para mejorar el rendimiento de búsqueda
userSchema.index({ email: 1 });
userSchema.index({ "wallet.address": 1 });

const User = mongoose.model("User", userSchema);

export default User;
