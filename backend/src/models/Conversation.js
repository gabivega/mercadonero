import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Modelo de Conversación entre usuarios.
 *
 * - Sin `product`: chat 1-a-1 privado entre comprador y vendedor
 *   de una orden ABierta (requisito de la Fase 1).
 * - Con `product`: hilo de pregunta pública sobre una publicación
 *   (el vendedor responde públicamente).
 */
const conversationSchema = new Schema(
  {
    // Participantes (normalmente 2 en chat; 1 + vendedor en preguntas)
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],

    // Si es una pregunta pública sobre una publicación, se referencia el producto.
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },

    // Tipo de conversación
    kind: {
      type: String,
      enum: ["order_chat", "product_question"],
      default: "order_chat",
    },

    // Contexto opcional: la orden que habilita el chat (para chats de orden).
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },

    // Último mensaje (para el preview en la lista)
    lastMessage: {
      text: { type: String, default: "" },
      sender: { type: Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date },
    },

    // Pregunta pública resuelta (solo product_question)
    answered: { type: Boolean, default: false },
    answeredAt: { type: Date },
  },
  { timestamps: true },
);

// Índice para búsquedas eficientes de conversaciones por participante
conversationSchema.index({ participants: 1, updatedAt: -1 });
// Evita duplicar conversaciones de producto entre los mismos participantes
conversationSchema.index(
  { product: 1, participants: 1, kind: 1 },
  { unique: true, partialFilterExpression: { product: { $ne: null } } },
);

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
