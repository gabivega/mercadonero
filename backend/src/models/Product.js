import mongoose from "mongoose";
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    brand: { type: String, default: "Genérico" },
    price: { type: Number, required: true },
    currency: { 
    type: String, 
    enum: ['ARS', 'USD'], 
    default: 'ARS' 
  },
    sale: {
      price: { type: Number, default: 0 }, // Precio con descuento
      active: { type: Boolean, default: false },
      expiresAt: { type: Date }, // Opcional: para liquidar ofertas automáticamente
    },
    warranty: {
      type: {
        type: String,
        enum: ["none", "seller", "factory"],
        default: "none",
      },
      duration: { type: String, default: "" }, // Ej: "6 meses", "1 año"
    },
    rating: { type: Number, default: 0 },
    videoUrl: { type: String, trim: true, default: "" },
    tags: [{ type: String, trim: true }], // Array de strings para el motor de búsqueda
    sku: { type: String, trim: true, default: "" },
    stock: { type: Number, default: 1 },
    // Guardamos el array de objetos de Cloudinary
    images: [
      {
        url: { type: String, required: true },
        isMain: { type: Boolean, default: false },
      },
    ],
    views: { type: Number, default: 0 },
    // Relación con el Vendedor
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerName: { type: String, required: true },
    sellerIsVerified: { type: Boolean, default: false },
    sold: {type: Number, default:0},
    views: { type: Number, default: 0 },
    condition: {
      type: String,
      enum: ["new", "used", "refurbished"],
      default: "new",
      required: true,
    },

    // Categorización jerárquica
    category: { type: String, required: true },
    subCategory: { type: String }, // Ej: 'Celulares' dentro de 'Tecnología'

    // Logística y Envío
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
        weight: Number, // en kg
        width: Number, // en cm
        height: Number,
        depth: Number,
      },
      shippingTime: {
    type: String,
    enum: ['24h', '48h', '72h', 'more'],
    default: '48h'
  },
    },
    location: {
      city: String,
      province: String,
    },
    status: {
      type: String,
      enum: ["active", "paused", "out_of_stock", "deleted"],
      default: "active",
    },
    specifications: [
      { key: String, value: String }, // Aquí podés guardar {key: "Color", value: "Azul"}
    ],
    listingType: { 
      type: String, 
      enum: ['product', 'classified'], 
      default: 'product' 
    },
  },
  { timestamps: true },
);

export default mongoose.model("Product", ProductSchema);
