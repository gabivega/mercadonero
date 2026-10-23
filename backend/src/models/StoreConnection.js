import mongoose from 'mongoose';
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// StoreConnection
//
// Vincula UNA cuenta de Mercado Nero con UNA tienda externa (por ahora sólo
// Tiendanube), para que el usuario pueda importar su catálogo con un click.
//
// Reglas de seguridad (clave del feature):
//   - `owner`  es ÚNICO: un usuario sólo puede tener UNA conexión activa.
//   - `domain` es ÚNICO global: una tienda no puede estar conectada por dos
//     cuentas distintas → nadie puede "traerse" la tienda de otro.
//   - El backend SIEMPRE lee el dominio desde acá (nunca del body del request),
//     así aunque manipulen el front no pueden apuntar a otra tienda.
//
// Habilitación: la crea el ADMIN. Nace en `pending` y pasa a `verified` cuando
// el admin valida la propiedad vía OTP por email (manual, sin meta-tags).
// ─────────────────────────────────────────────────────────────────────────────

// Normaliza un dominio escrito de mil formas a un formato canónico:
//   "https://www.RedSports.com.ar/" → "redsports.com.ar"
export function normalizeDomain(input = '') {
  let d = String(input).trim().toLowerCase();
  // Quitar protocolo y path.
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  // Quitar "www.".
  d = d.replace(/^www\./, '');
  // Quitar puerto.
  d = d.replace(/:\d+$/, '');
  return d;
}

const StoreConnectionSchema = new Schema(
  {
    // Dueño de la conexión (una sola por usuario).
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Proveedor externo. Hoy sólo Tiendanube; queda preparado para más.
    provider: {
      type: String,
      enum: ['tiendanube'],
      default: 'tiendanube',
    },

    // Dominio de la tienda (canónico, sin protocolo ni www).
    // UNIQUE GLOBAL: una tienda no puede estar conectada por dos cuentas.
    domain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    // URL base para el scraper (https://<domain>). Se reconstruye del domain.
    baseUrl: { type: String, trim: true, default: '' },

    // Estado de la conexión.
    status: {
      type: String,
      enum: ['pending', 'verified', 'suspended'],
      default: 'pending',
      index: true,
    },

    // ── Verificación de propiedad (OTP por email, manual) ──
    verification: {
      method: {
        type: String,
        enum: ['email-otp', 'admin-manual'],
        default: 'email-otp',
      },
      // Email autorizado/público de la tienda donde se envía el OTP.
      email: { type: String, trim: true, lowercase: true, default: '' },
      // Código OTP vigente (se borra al verificar). No se expone al front.
      otpHash: { type: String, default: '' },
      otpExpiresAt: { type: Date, default: null },
      otpAttempts: { type: Number, default: 0 },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      note: { type: String, trim: true, default: '' },
    },

    // ── Plan / límites (freemium, se definen luego) ──
    // `null` en un límite = SIN límite. Hoy arrancamos sin límites.
    plan: { type: String, enum: ['free', 'premium', 'admin'], default: 'free' },
    limits: {
      // Máximo de productos importables en total (null = ilimitado).
      maxProducts: { type: Number, default: null },
      // Máximo de import masivo por día (null = ilimitado).
      maxBulkRunsPerDay: { type: Number, default: null },
      // Sincronización de stock/precios habilitada.
      syncEnabled: { type: Boolean, default: true },
    },

    // ── Uso / contadores (para aplicar límites más adelante) ──
    usage: {
      totalImported: { type: Number, default: 0 },
      bulkRunsToday: { type: Number, default: 0 },
      bulkRunsDate: { type: String, default: '' }, // YYYY-MM-DD
      lastImportAt: { type: Date, default: null },
    },

    // ── Sync ──
    sync: {
      lastSyncAt: { type: Date, default: null },
      lastSyncSummary: {
        updated: { type: Number, default: 0 },
        unchanged: { type: Number, default: 0 },
        notFound: { type: Number, default: 0 },
        errors: { type: Number, default: 0 },
      },
    },

    // Quién la creó (admin) y observaciones.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

// Reconstruye baseUrl desde el domain antes de validar/guardar.
StoreConnectionSchema.pre('validate', function () {
  if (this.domain) {
    this.domain = normalizeDomain(this.domain);
    this.baseUrl = `https://${this.domain}`;
  }
});

// Método helper: ¿está lista para importar?
StoreConnectionSchema.methods.isReady = function () {
  return this.status === 'verified';
};

export default mongoose.model('StoreConnection', StoreConnectionSchema);
