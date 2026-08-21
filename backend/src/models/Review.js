import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * SISTEMA DE RATINGS Y CALIFICACIONES
 *
 * Un modelo único que cubre los 3 tipos de rating del marketplace:
 *
 *  - 'product_rating' : el comprador califica el/los PRODUCTO(s) de una orden
 *                       COMPLETADA. Usa estrellas (1 a 5) + comentario breve.
 *
 *  - 'seller_rating'  : el COMPRADOR califica al VENDEDOR con un booleano
 *                       (recomienda / no recomienda) + opinión breve. Solo en
 *                       órdenes COMPLETADAS o CANCELADAS por el vendedor.
 *
 *  - 'buyer_rating'   : el VENDEDOR califica al COMPRADOR con un booleano
 *                       (recomienda / no recomienda) + opinión breve. Solo en
 *                       órdenes COMPLETADAS o CANCELADAS por el comprador.
 *
 * Todos los ratings son OPCIONALES. Un usuario puede emitir a lo sumo UN
 * rating por (order, type, author) para evitar duplicados/abuso (ver índice).
 */
const reviewSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // Quién emite el rating (comprador o vendedor según el type)
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Al qué le apunta el rating: a un producto o a un usuario
    targetType: {
      type: String,
      enum: ["product", "user"],
      required: true,
    },

    // Cuál de los 3 tipos de rating es
    type: {
      type: String,
      enum: ["product_rating", "seller_rating", "buyer_rating"],
      required: true,
    },

    // Para 'product_rating': el producto calificado
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },

    // Para 'seller_rating' y 'buyer_rating': el usuario calificado
    targetUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // Estrellas 1-5 (solo product_rating)
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },

    // Manito arriba (true) / abajo (false) — solo seller_rating y buyer_rating
    recommends: {
      type: Boolean,
    },

    // Reseña breve (opcional)
    comment: {
      type: String,
      trim: true,
      maxLength: 600,
      default: "",
    },
  },
  { timestamps: true },
);

// Un usuario no puede calificar dos veces la misma combinación (orden + tipo).
reviewSchema.index(
  { orderId: 1, type: 1, author: 1 },
  { unique: true },
);

// Índice útil para listar los ratings de un producto/usuario
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ targetUser: 1, createdAt: -1 });

export default mongoose.model("Review", reviewSchema);
