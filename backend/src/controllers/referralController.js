// controllers/referralController.js
import User from "../models/User.js";
import Referral from "../models/Referral.js";
import {
  getReferralConfig,
  withdrawReferral,
} from "../services/referralService.js";

/**
 * GET /api/referral
 * Devuelve el estado de referidos del usuario autenticado (balance, histórico
 * de movimientos) y los parámetros globales que le aplican (tope de %, etc.).
 */
export const getMyReferral = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    const config = await getReferralConfig();

    // Cantidad de veces que este usuario fue REFERIDOR (órdenes referidas).
    const referralsCount = await Referral.countDocuments({
      referrer: user._id,
      status: "credited",
    });

    res.status(200).json({
      success: true,
      referral: {
        balance: user.referral?.balance ?? 0,
        earned: user.referral?.earned ?? 0,
        spent: user.referral?.spent ?? 0,
        withdrawn: user.referral?.withdrawn ?? 0,
        referralsCount,
        // Tope y default que rigen el alta de productos.
        maxPercent: config.maxPercent,
        defaultPercent: config.defaultPercent,
        enabled: config.enabled,
        // Reglas de retiro (para el modal de la billetera de recompensas).
        minWithdrawalUsd: config.minWithdrawalUsd,
        allowWithdraw: config.allowWithdraw,
      },
      transactions: user.referral?.transactions?.slice(-50).reverse() || [],
    });
  } catch (error) {
    console.error("Error en getMyReferral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referral/withdraw
 * Retira saldo de referidos fuera de la plataforma (a la wallet del usuario).
 * body: { amountUsd: number }
 *
 * Igual que el cashback: descuenta el saldo al instante (sin aprobación) y
 * registra el movimiento. El envío on-chain se resuelve aparte.
 */
export const withdrawMyReferral = async (req, res) => {
  try {
    const { amountUsd } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const result = await withdrawReferral(user, Number(amountUsd));
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const updated = await User.findById(user._id);
    res.status(200).json({
      success: true,
      message: "Retiro de referidos procesado",
      applied: result.applied,
      balance: updated.referral?.balance ?? 0,
    });
  } catch (error) {
    console.error("Error en withdrawMyReferral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ────────────────────────────────────────────────
// RUTAS DE ADMIN
// ────────────────────────────────────────────────
/**
 * GET /api/admin/referral/config
 * Obtiene la configuración global de referidos.
 */
export const adminGetReferralConfig = async (_req, res) => {
  try {
    const config = await getReferralConfig();
    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error("Error en adminGetReferralConfig:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/admin/referral/config
 * Actualiza la configuración global de referidos.
 * body: partial (enabled, defaultPercent, maxPercent, maxRewardUsdPerOrder).
 */
export const adminUpdateReferralConfig = async (req, res) => {
  try {
    const allowed = [
      "enabled",
      "defaultPercent",
      "maxPercent",
      "maxRewardUsdPerOrder",
      "platformFeePercent",
      "minWithdrawalUsd",
      "allowWithdraw",
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    let config = await getReferralConfig();

    // Validación de coherencia de porcentajes.
    const nextMax = updates.maxPercent ?? config.maxPercent;
    const nextDefault = updates.defaultPercent ?? config.defaultPercent;
    if (nextDefault > nextMax) {
      return res.status(400).json({
        success: false,
        message: "El % por defecto no puede superar el % máximo.",
      });
    }
    if (nextMax > 50) {
      return res.status(400).json({
        success: false,
        message: "El % máximo de referido no puede superar 50%.",
      });
    }

    for (const k of Object.keys(updates)) config[k] = updates[k];
    config.updatedBy = req.user?._id;
    await config.save();

    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error("Error en adminUpdateReferralConfig:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
