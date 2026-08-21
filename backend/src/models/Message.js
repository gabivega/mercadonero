import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Modelo de Mensaje dentro de una conversación.
 */
const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 2000 },
    // Participantes que ya leyeron este mensaje
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

// Índice compuesto para paginar mensajes de una conversación por fecha
messageSchema.index({ conversation: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
