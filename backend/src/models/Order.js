// models/Order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
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
    paymentProof: { type: String },
    shippingDetails: {
      provider: { type: String },
      trackingNumber: { type: String },
      shippedAt: { type: Date },
      otherProviderDetail: { type: String }, // Por si eligen "Otro"
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
