// controllers/referralController.js
import User from "../models/User.js";
import Referral from "../models/Referral.js";
import {
  getReferralConfig,
  withdrawReferral,
} from "../services/referralService.js";

// Helper: ¿el usuario completó sus datos básicos obligatorios?
// (mismo criterio que usa el checkout y el onboarding).
const hasBasicProfile = (user) =>
  Boolean(
    user?.profileCompleted ||
      (user?.firstName && user?.lastName && user?.dni && user?.phone),
  );

/**
 * GET /api/referral/status
 * Estado del usuario frente al programa de referidores (para gatear la vista).
 * Devuelve el `referralStatus` y si tiene el perfil básico completo.
 */
export const getMyReferralStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "referralStatus referralRequestedAt referralReviewedAt referralStatusReason profileCompleted firstName lastName dni phone",
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    res.status(200).json({
      success: true,
      status: {
        referralStatus: user.referralStatus || "none",
        requestedAt: user.referralRequestedAt || null,
        reviewedAt: user.referralReviewedAt || null,
        reason: user.referralStatusReason || "",
        profileCompleted: hasBasicProfile(user),
      },
    });
  } catch (error) {
    console.error("Error en getMyReferralStatus:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referral/request
 * El usuario autenticado SOLICITA ser referidor. Requiere perfil completo.
 * Idempotente: si ya está "pending" o "approved" no hace nada; si está
 * "none" o "rejected" lo pasa a "pending" para revisión del admin.
 */
export const requestReferral = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    // 1) Debe tener el onboarding básico completo.
    if (!hasBasicProfile(user)) {
      return res.status(403).json({
        success: false,
        code: "PROFILE_INCOMPLETE",
        message:
          "Completá tus datos básicos (nombre, apellido, DNI y teléfono) antes de solicitar ser referidor.",
      });
    }

    // 2) Ya aprobado o pendiente: no volvemos a encolar.
    if (user.referralStatus === "approved") {
      return res.status(200).json({
        success: true,
        referralStatus: "approved",
        message: "Ya sos referidor activo.",
      });
    }
    if (user.referralStatus === "pending") {
      return res.status(200).json({
        success: true,
        referralStatus: "pending",
        message: "Tu solicitud ya está en revisión.",
      });
    }

    // 3) Creamos/reabrimos la solicitud.
    user.referralStatus = "pending";
    user.referralRequestedAt = new Date();
    user.referralStatusReason = "";
    await user.save();

    res.status(200).json({
      success: true,
      referralStatus: "pending",
      message: "Solicitud enviada. Te avisaremos cuando la aprobemos.",
    });
  } catch (error) {
    console.error("Error en requestReferral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

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
        // Reparto del reward: % que se lleva el referidor (default 75).
        // El front lo usa para previsualizar cuánto gana cada parte.
        referrerSharePercent:
          Number.isFinite(Number(config.referrerSharePercent))
            ? Number(config.referrerSharePercent)
            : 75,
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
      "referrerSharePercent",
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

    // Validación del reparto referidor/comprador (debe ser 0-100).
    if (updates.referrerSharePercent !== undefined) {
      const share = Number(updates.referrerSharePercent);
      if (!Number.isFinite(share) || share < 0 || share > 100) {
        return res.status(400).json({
          success: false,
          message: "El % del referidor debe estar entre 0 y 100.",
        });
      }
      updates.referrerSharePercent = share;
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

// ────────────────────────────────────────────────
// ADMIN · SOLICITUDES DE REFERIDOR
// ────────────────────────────────────────────────
/**
 * GET /api/admin/referral/requests?status=pending|approved|rejected|all&search=
 * Lista las solicitudes de referidor para revisión manual.
 */
export const adminGetReferralRequests = async (req, res) => {
  try {
    const { status = "pending", search = "" } = req.query;

    const match = {};
    if (status !== "all") {
      match.referralStatus = status;
    } else {
      // "all" = todas las que alguna vez pidieron o fueron aprobadas/rechazadas.
      match.referralStatus = { $in: ["pending", "approved", "rejected"] };
    }
    if (search) {
      const reg = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      match.$or = [
        { email: reg },
        { username: reg },
        { firstName: reg },
        { lastName: reg },
      ];
    }

    const [users, pendingCount, approvedCount, rejectedCount] =
      await Promise.all([
        User.find(match)
          .select(
            "username firstName lastName email avatar referralStatus referralRequestedAt referralReviewedAt referralStatusReason createdAt referral.balance referral.earned",
          )
          .sort({ referralRequestedAt: -1, createdAt: -1 })
          .limit(200)
          .lean(),
        User.countDocuments({ referralStatus: "pending" }),
        User.countDocuments({ referralStatus: "approved" }),
        User.countDocuments({ referralStatus: "rejected" }),
      ]);

    res.status(200).json({
      success: true,
      requests: users.map((u) => ({
        _id: u._id,
        username: u.username,
        fullName: [u.firstName, u.lastName].filter(Boolean).join(" ").trim(),
        email: u.email,
        avatar: u.avatar,
        referralStatus: u.referralStatus,
        requestedAt: u.referralRequestedAt,
        reviewedAt: u.referralReviewedAt,
        reason: u.referralStatusReason || "",
        balance: u.referral?.balance ?? 0,
        earned: u.referral?.earned ?? 0,
      })),
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    console.error("Error en adminGetReferralRequests:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/admin/referral/requests/:id
 * Aprueba o rechaza una solicitud de referidor.
 * Body: { action: "approve" | "reject", reason? }.
 * El motivo es obligatorio al rechazar.
 */
export const adminReviewReferralRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason = "" } = req.body || {};

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Acción inválida. Usá 'approve' o 'reject'.",
      });
    }
    if (action === "reject" && !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: "El motivo de rechazo es obligatorio.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }

    user.referralStatus = action === "approve" ? "approved" : "rejected";
    user.referralReviewedAt = new Date();
    user.referralReviewedBy = req.user._id;
    user.referralStatusReason =
      action === "reject" ? String(reason).trim() : "";
    await user.save();

    res.status(200).json({
      success: true,
      message:
        action === "approve"
          ? "Referidor aprobado."
          : "Solicitud rechazada.",
      request: {
        _id: user._id,
        referralStatus: user.referralStatus,
        reviewedAt: user.referralReviewedAt,
        reason: user.referralStatusReason,
      },
    });
  } catch (error) {
    console.error("Error en adminReviewReferralRequest:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
