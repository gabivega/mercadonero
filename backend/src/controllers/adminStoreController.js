import crypto from 'crypto';
import User from '../models/User.js';
import StoreConnection, { normalizeDomain } from '../models/StoreConnection.js';
import { tiendanubeHealth } from '../services/tiendanubeService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Controller de ADMIN para habilitar/gestionar StoreConnection.
//
// Flujo de habilitación:
//   1) createStoreConnection: el admin carga email del usuario + dominio.
//      → se crea en `pending` (o se marca un dominio ya existente).
//   2) sendOtp: el admin dispara un OTP al email autorizado de la tienda.
//      (en MVP el OTP se devuelve al admin en la respuesta para que lo
//       comunique manualmente; más adelante se manda por email real).
//   3) verifyOtp: el admin ingresa el OTP ← el usuario. → `verified`.
//   Alternativa: verifyManually (sin OTP), para casos puntuales.
// ─────────────────────────────────────────────────────────────────────────────

// Hash simple del OTP (no guardamos el código en claro).
const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

/**
 * GET /api/admin/store-connections
 * Lista todas las conexiones (con datos del usuario).
 */
export const listStoreConnections = async (req, res) => {
  try {
    const items = await StoreConnection.find()
      .populate('owner', 'email name username shop.name isVerified')
      .sort({ createdAt: -1 })
      .lean();

    // Nunca exponer el hash del OTP.
    const safe = items.map((c) => {
      if (c.verification) delete c.verification.otpHash;
      return c;
    });

    return res.json({ success: true, items: safe, total: safe.length });
  } catch (error) {
    console.error('[admin][store-conn][list]', error.message);
    return res.status(500).json({ success: false, message: 'Error al listar conexiones.' });
  }
};

/**
 * POST /api/admin/store-connections
 * Crea (o actualiza) la conexión de un usuario por email + dominio.
 * Body: { email, domain, provider?, plan?, notes?, verificationEmail? }
 */
export const createStoreConnection = async (req, res) => {
  try {
    const { email, domain, plan = 'free', notes = '', verificationEmail } = req.body || {};

    if (!email || !domain) {
      return res.status(400).json({ success: false, message: 'Email y dominio son obligatorios.' });
    }

    const normDomain = normalizeDomain(domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normDomain)) {
      return res.status(400).json({ success: false, message: 'El dominio no es válido.' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No existe un usuario con ese email. Pedile que se registre primero.',
      });
    }

    // Un dominio no puede estar en dos conexiones.
    const domainTaken = await StoreConnection.findOne({
      domain: normDomain,
      owner: { $ne: user._id },
    });
    if (domainTaken) {
      return res.status(409).json({
        success: false,
        message: 'Ese dominio ya está conectado a otra cuenta.',
      });
    }

    // Upsert por owner (un user = una conexión).
    let conn = await StoreConnection.findOne({ owner: user._id });
    if (conn) {
      conn.domain = normDomain;
      conn.baseUrl = `https://${normDomain}`;
      conn.plan = plan;
      conn.notes = notes;
      conn.status = 'pending';
      conn.verification.verifiedAt = null;
      if (verificationEmail) conn.verification.email = String(verificationEmail).toLowerCase().trim();
    } else {
      conn = new StoreConnection({
        owner: user._id,
        provider: 'tiendanube',
        domain: normDomain,
        plan,
        notes,
        status: 'pending',
        createdBy: req.user._id,
        verification: {
          method: 'email-otp',
          email: verificationEmail ? String(verificationEmail).toLowerCase().trim() : '',
        },
      });
    }

    await conn.save();
    return res.status(201).json({ success: true, connection: conn });
  } catch (error) {
    console.error('[admin][store-conn][create]', error.message);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Dominio o usuario ya conectado.' });
    }
    return res.status(500).json({ success: false, message: error.message || 'Error al crear la conexión.' });
  }
};

/**
 * POST /api/admin/store-connections/:id/send-otp
 * Genera un OTP (6 dígitos) para verificar la propiedad del dominio.
 *
 * En MVP el código se DEVUELVE al admin (que lo comunica manualmente). El email
 * autorizado se guarda para el futuro envío real.
 */
export const sendVerificationOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationEmail } = req.body || {};

    const conn = await StoreConnection.findById(id);
    if (!conn) {
      return res.status(404).json({ success: false, message: 'Conexión no encontrada.' });
    }

    if (verificationEmail) {
      conn.verification.email = String(verificationEmail).toLowerCase().trim();
    }

    // Verificamos que el dominio responda (sitemap) antes de emitir OTP.
    try {
      await tiendanubeHealth({ baseUrl: conn.baseUrl });
    } catch {
      return res.status(422).json({
        success: false,
        message: 'No se pudo acceder al sitemap del dominio. Revisá que sea una tienda Tiendanube válida.',
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    conn.verification.method = 'email-otp';
    conn.verification.otpHash = hashOtp(code);
    conn.verification.otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    conn.verification.otpAttempts = 0;
    await conn.save();

    return res.json({
      success: true,
      message: 'OTP generado. Comunicáselo al titular de la tienda.',
      // ⚠️ En MVP devolvemos el código al admin para pasarlo manualmente.
      // TODO: enviarlo por email a conn.verification.email.
      otp: code,
      expiresAt: conn.verification.otpExpiresAt,
      sentTo: conn.verification.email || '(sin email autorizado)',
    });
  } catch (error) {
    console.error('[admin][store-conn][send-otp]', error.message);
    return res.status(500).json({ success: false, message: 'Error al generar el OTP.' });
  }
};

/**
 * POST /api/admin/store-connections/:id/verify
 * Body: { otp? , manual?: boolean }
 * Con `manual: true` verifica sin OTP (override del admin).
 */
export const verifyStoreConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp, manual = false } = req.body || {};

    const conn = await StoreConnection.findById(id);
    if (!conn) {
      return res.status(404).json({ success: false, message: 'Conexión no encontrada.' });
    }

    if (!manual) {
      if (!otp) {
        return res.status(400).json({ success: false, message: 'Falta el OTP.' });
      }
      if (!conn.verification.otpHash) {
        return res.status(400).json({ success: false, message: 'No hay un OTP vigente.' });
      }
      if (conn.verification.otpExpiresAt && new Date() > conn.verification.otpExpiresAt) {
        return res.status(400).json({ success: false, message: 'El OTP expiró. Generá uno nuevo.' });
      }
      if (hashOtp(otp) !== conn.verification.otpHash) {
        conn.verification.otpAttempts += 1;
        await conn.save();
        return res.status(400).json({ success: false, message: 'El OTP es incorrecto.' });
      }
    }

    conn.status = 'verified';
    conn.verification.verifiedAt = new Date();
    conn.verification.verifiedBy = req.user._id;
    conn.verification.otpHash = '';
    conn.verification.otpExpiresAt = null;
    conn.verification.method = manual ? 'admin-manual' : 'email-otp';
    await conn.save();

    return res.json({ success: true, connection: conn });
  } catch (error) {
    console.error('[admin][store-conn][verify]', error.message);
    return res.status(500).json({ success: false, message: 'Error al verificar.' });
  }
};

/**
 * PATCH /api/admin/store-connections/:id
 * Actualiza status/plan/límites/notas.
 * Body: { status?, plan?, limits?: { maxProducts, maxBulkRunsPerDay, syncEnabled } }
 */
export const updateStoreConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, plan, limits, notes } = req.body || {};

    const conn = await StoreConnection.findById(id);
    if (!conn) {
      return res.status(404).json({ success: false, message: 'Conexión no encontrada.' });
    }

    if (status) conn.status = status;
    if (plan) conn.plan = plan;
    if (notes !== undefined) conn.notes = notes;
    if (limits) {
      if (limits.maxProducts !== undefined) conn.limits.maxProducts = limits.maxProducts;
      if (limits.maxBulkRunsPerDay !== undefined) {
        conn.limits.maxBulkRunsPerDay = limits.maxBulkRunsPerDay;
      }
      if (limits.syncEnabled !== undefined) conn.limits.syncEnabled = limits.syncEnabled;
    }

    await conn.save();
    return res.json({ success: true, connection: conn });
  } catch (error) {
    console.error('[admin][store-conn][update]', error.message);
    return res.status(500).json({ success: false, message: 'Error al actualizar.' });
  }
};

/**
 * DELETE /api/admin/store-connections/:id
 * Elimina la conexión (los productos importados NO se borran).
 */
export const deleteStoreConnection = async (req, res) => {
  try {
    const { id } = req.params;
    await StoreConnection.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Conexión eliminada.' });
  } catch (error) {
    console.error('[admin][store-conn][delete]', error.message);
    return res.status(500).json({ success: false, message: 'Error al eliminar.' });
  }
};
