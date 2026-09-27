import mongoose from "mongoose";
import { buildProductSlug } from "../utils/slugify.js";
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // ── SEO / URL AMIGABLE ───────────────────────────────────────────────
    // Slug único para construir URLs indexables: /producto/<slug>.
    // Se genera automáticamente desde el título + un sufijo corto derivado
    // del ObjectId (ver pre-save hook y utils/slugify.js).
    slug: { type: String, trim: true, index: true, unique: true, sparse: true },
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
    // ── SOCIAL SELLING (Compra en grupo / Pools) ──────────────────────
    // El vendedor lo habilita. Es EXCLUYENTE con sale.price.
    // `tiers` mapea cantidad de compradores (2..5) -> precio unitario.
        socialSelling: {
      enabled: { type: Boolean, default: false },
      durationHours: { type: Number, default: 48 }, // 24 | 48 | 72
      // Objeto plano: { "2": precio, "3": precio, "4": precio, "5": precio }.
      // Se accede en el front como tiers[2], tiers[5], etc. (las keys numéricas
      // se stringifican pero el acceso por number sigue funcionando).
      tiers: { type: Object, default: {} },
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
    // ── STOCK RESERVADO (Compra en Grupo / Social Selling) ──────────────
    // Unidades comprometidas por pools ABIERTOS (aún no convertidos en venta).
    //   - Al FONDEAR/UNIRSE a un pool  → reservedStock += units
    //   - Al EXPIRAR el pool con 1     → reservedStock -= units
    //   - Al CERRAR (release exitoso)  → stock -= units Y reservedStock -= units
    // La disponibilidad para abrir/alinear pools se calcula como:
    //   availableStock = stock - reservedStock
    reservedStock: { type: Number, default: 0, min: 0 },
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
      // ── MÉTODOS DE ENTREGA HABILITADOS POR EL VENDEDOR ──
      // homeDelivery: envío a domicilio vía courier (cotiza con Zipnova).
      // pickup: retiro en local del vendedor (SIN CARGO, no usa Zipnova).
      // pickupLocationIds: subconjunto de User.shop.pickupLocations que ESTE
      //   producto ofrece. Si está vacío y pickup=true, se asumen TODOS los
      //   puntos activos del vendedor.
      delivery: {
        homeDelivery: { type: Boolean, default: true },
        pickup: { type: Boolean, default: false },
        pickupLocationIds: [{ type: Schema.Types.ObjectId }],
      },
            dimensions: {
        weight: Number, // en kg
        width: Number, // en cm
        height: Number,
        depth: Number, // legacy
        length: Number, // en cm (usado por el form de publicación)
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
        source: { type: String, enum: ['manual', 'mercado-libre', 'provider'], default: 'manual' },
    sourceUrl: { type: String, trim: true, default: "" },
    // ── TRAZABILIDAD CON PROVEEDOR (Elit, etc.) ────────────────────────
    // Vincula la publicación con el producto original de un proveedor.
    // Permite: (a) no duplicar al reimportar, (b) sincronizar precio/stock
    // más adelante sin adivinar por nombre.
    providerRef: {
      provider: { type: String, trim: true, default: "" }, // ej: "elit"
      id: { type: Number, default: null },                 // id numérico del proveedor
      codigo_producto: { type: String, trim: true, default: "" }, // SKU del proveedor
      codigo_alfa: { type: String, trim: true, default: "" },
      // Precio de costo del proveedor al momento de importar (para calcular
      // margen y detectar cambios de precio en sync futuras).
      costPvpArs: { type: Number, default: 0 },
      lastSyncAt: { type: Date, default: null },
    },
  },
    { timestamps: true },
);

// Virtual con la disponibilidad real: stock físico menos lo reservado por
// pools de compra grupal abiertos. Se expone en toJSON/toObject.
ProductSchema.virtual("availableStock").get(function () {
  return Math.max(0, (this.stock ?? 0) - (this.reservedStock ?? 0));
});
ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

// ── GENERACIÓN AUTOMÁTICA DEL SLUG ─────────────────────────────────────
// Se ejecuta al guardar. Reglas:
//   - Si el producto es nuevo (sin slug) → se genera.
//   - Si el nombre cambió → se regenera el slug (mantiene el sufijo); esto
//     conserva la unicidad pero actualiza las keywords del título.
//   - Si no hay cambios → se deja intacto (no rompemos la URL publicada).
// El sufijo se basa en _id, disponible en documentos nuevos antes de save().
// Hook SÍNCRONO (sin `next`): en versiones modernas de Mongoose un hook
// sincrónico no debe declarar/llamar a `next`, de lo contrario se produce
// el error "next is not a function".
ProductSchema.pre("save", function () {
  const nameChanged = this.isModified("name");
  const hasNoSlug = !this.slug;
  if (hasNoSlug || nameChanged) {
    this.slug = buildProductSlug(this.name, this._id);
  }
});

export default mongoose.model("Product", ProductSchema);

