// controllers/cashbackController.js
import User from "../models/User.js";
import {
  getCashbackConfig,
  resolveCashbackParams,
  useCashbackForCheckout,
  withdrawCashback,
} from "../services/cashbackService.js";

/**
 * GET /api/cashback
 * Consulta el estado del cashback del usuario autenticado (balance, histórico
 * y parámetros que le aplican, por ejemplo el umbral mínimo de retiro).
 */
export const getMyCashback = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const params = await resolveCashbackParams(user);

    res.status(200).json({
      success: true,
      cashback: {
        balance: user.cashback?.balance ?? 0,
        earned: user.cashback?.earned ?? 0,
        spent: user.cashback?.spent ?? 0,
        withdrawn: user.cashback?.withdrawn ?? 0,
        minWithdrawalUsd: params.minWithdrawalUsd,
        allowUseInCheckout: params.allowUseInCheckout,
        allowWithdraw: params.allowWithdraw,
      },
      transactions: user.cashback?.transactions?.slice(-50).reverse() || [],
    });
  } catch (error) {
    console.error("Error en getMyCashback:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/cashback/use
 * Usa cashback para descontar una compra dentro de la plataforma.
 * body: { amountUsd: number, orderId?: string }
 */
export const useCashback = async (req, res) => {
  try {
    const { amountUsd, orderId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const result = await useCashbackForCheckout(user, Number(amountUsd), orderId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const updated = await User.findById(user._id);
    res.status(200).json({
      success: true,
      message: "Cashback aplicado",
      applied: result.applied,
      balance: updated.cashback?.balance ?? 0,
    });
  } catch (error) {
    console.error("Error en useCashback:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/cashback/withdraw
 * Retira cashback fuera de la plataforma.
 * body: { amountUsd: number }
 * Nota: registra la operación; el depósito a wallet web3 se resuelve aparte.
 */
export const withdrawMyCashback = async (req, res) => {
  try {
    const { amountUsd } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const result = await withdrawCashback(user, Number(amountUsd));
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const updated = await User.findById(user._id);
    res.status(200).json({
      success: true,
      message: "Retiro de cashback procesado",
      applied: result.applied,
      balance: updated.cashback?.balance ?? 0,
    });
  } catch (error) {
    console.error("Error en withdrawMyCashback:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ────────────────────────────────────────────────
// RUTAS DE ADMIN
// ────────────────────────────────────────────────

/**
 * GET /api/admin/cashback/config
 * Obtiene la configuración global vigente.
 */
export const adminGetCashbackConfig = async (_req, res) => {
  try {
    const config = await getCashbackConfig();
    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error("Error en adminGetCashbackConfig:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/admin/cashback/config
 * Actualiza la configuración global.
 * body: partial de campos (enabled, feePercent, minWithdrawalUsd, etc.)
 */
export const adminUpdateCashbackConfig = async (req, res) => {
  try {
    const allowed = [
      "enabled",
      "feePercent",
      "minWithdrawalUsd",
      "maxPerOrderUsd",
      "allowUseInCheckout",
      "allowWithdraw",
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    let config = await getCashbackConfig();
    for (const k of Object.keys(updates)) config[k] = updates[k];
    config.updatedBy = req.user?._id;
    await config.save();

    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error("Error en adminUpdateCashbackConfig:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/admin/cashback/user/:userId
 * Ajusta el cashback de un usuario concreto:
 *   - override individual (fidelización) o
 *   - ajuste manual de saldo (bonificación / corrección).
 * body: { overrideEnabled?, overrideFeePercent?, overrideMinWithdrawalUsd?,
 *         adjustBalance?: number }
 */
export const adminAdjustUserCashback = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    const cashbackPatch = {};
    const transactionRefs = [];

    // Override individual
    for (const k of ["overrideEnabled", "overrideFeePercent", "overrideMinWithdrawalUsd"]) {
      if (req.body[k] !== undefined) cashbackPatch[`cashback.${k}`] = req.body[k];
    }

    // Ajuste manual de saldo (puede ser positivo o negativo)
    if (req.body.adjustBalance !== undefined && req.body.adjustBalance !== 0) {
      const delta = Number(req.body.adjustBalance);
      cashbackPatch["$inc"] = { "cashback.balance": delta };
      if (delta > 0) cashbackPatch["$inc"]["cashback.earned"] = delta;
      const txnType = delta > 0 ? "earned" : "spent";
      transactionRefs.push({
        type: txnType,
        amount: Math.round(delta * 100) / 100,
        description: req.body.note || "Ajuste manual de admin",
        refType: "admin",
        status: "completed",
      });
    }

    const update = { $set: {} };
    for (const [k, v] of Object.entries(cashbackPatch)) {
      if (k === "$inc") update.$inc = { ...update.$inc, ...v };
      else update.$set[k] = v;
    }
    if (transactionRefs.length) {
      update.$push = { "cashback.transactions": { $each: transactionRefs } };
    }

    await User.updateOne({ _id: user._id }, update);

    const updated = await User.findById(user._id).select("username email cashback");
    res.status(200).json({ success: true, user: updated });
  } catch (error) {
    console.error("Error en adminAdjustUserCashback:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
