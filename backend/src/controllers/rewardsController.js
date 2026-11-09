// controllers/rewardsController.js
import User from "../models/User.js";
import {
  getRewardsBalanceSummary,
  computeReferrerWithdrawable,
  getSellerPendingCreditTotal,
  getSellerPendingCredits,
  claimSellerCredit,
  quoteRewardsForOrder,
} from "../services/rewardsService.js";
// Interruptor maestro: uso de recompensas en checkout (ver config/rewards.js).
import { REWARDS_CHECKOUT_ENABLED } from "../config/rewards.js";

/**
 * POST /api/rewards/quote
 * Cotiza cuánto saldo de recompensas puede aplicar el comprador a un pedido
 * (SOLO sobre el subtotal de productos, nunca sobre el envío). No descuenta
 * nada: es para mostrar el descuento en el checkout antes de crear la orden.
 *
 * body: { productsTotalUsd: number }
 */
export const quoteRewardsForCheckout = async (req, res) => {
  try {
    const productsTotalUsd = Number(req.body?.productsTotalUsd) || 0;
    const shippingUsd = Number(req.body?.shippingUsd) || 0;
    const platformFeeUsd = Number(req.body?.platformFeeUsd) || 0;
    if (productsTotalUsd < 0) {
      return res
        .status(400)
        .json({ success: false, message: "productsTotalUsd inválido." });
    }

    // ⚠️ Incluir reservedUsd: quoteRewardsForOrder descuenta lo reservado
    // (balance - reservedUsd) para NO volver a ofrecer saldo ya comprometido
    // en otra orden abierta. Sin reservedUsd el checkout ofrecía saldo
    // reservado y permitía el doble uso.
    const user = await User.findById(req.user._id).select(

      "cashback.balance cashback.reservedUsd referral.balance referral.reservedUsd referral.transactions",
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    const quote = quoteRewardsForOrder({
      user,
      productsTotalUsd,
      shippingUsd,
      platformFeeUsd,
    });

    // ⚠️ Uso de recompensas en checkout DESHABILITADO (ver config/rewards.js).
    // Devolvemos el saldo disponible real en `usable` (para que la UI lo muestre)
    // pero con rewardsUsedUsd = 0 y sin descuento: el checkout NO aplica saldo.
    // Así la previsualización nunca ofrece un descuento que createOrder ignorará.
    if (!REWARDS_CHECKOUT_ENABLED) {
      return res.status(200).json({
        success: true,
        checkoutEnabled: false,
        usable: quote.usable, // { cashbackUsd, referralUsd, totalUsableUsd }
        cap: 0,
        rewardsUsedUsd: 0,
        breakdown: { cashbackUsd: 0, referralUsd: 0 },
        cashAmountUsd: productsTotalUsd + shippingUsd,
        feeUsd: quote.feeUsd,
        sellerFromEscrowUsd: 0,
        sellerCreditUsd: 0,
        leftoverUsableUsd: quote.usable?.totalUsableUsd ?? 0,
      });
    }

    res.status(200).json({
      success: true,
      checkoutEnabled: true,
      usable: quote.usable, // { cashbackUsd, referralUsd, totalUsableUsd }
      cap: quote.cap, // tope aplicable en ESTE pedido (subtotal productos)
      rewardsUsedUsd: quote.rewardsUsedUsd, // lo que se aplicaría
      breakdown: quote.breakdown, // { cashbackUsd, referralUsd }
      cashAmountUsd: quote.cashAmountUsd, // lo que paga en efectivo/escrow
      feeUsd: quote.feeUsd,
      sellerFromEscrowUsd: quote.sellerFromEscrowUsd,
      sellerCreditUsd: quote.sellerCreditUsd, // lo que se le acredita al seller
      leftoverUsableUsd: quote.leftoverUsableUsd,
    });
  } catch (error) {
    console.error("Error en quoteRewardsForCheckout:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/rewards/summary
 * Devuelve el saldo de recompensas del usuario autenticado (para el checkout y
 * el panel). Distingue:
 *   - Saldo USABLE por el COMPRADOR: cashback + reintegro de referidos
 *     (se usan en checkout como una sola cosa). NO es retirable.
 *   - GANANCIA del REFERIDOR: lo único retirable a wallet.
 */
export const getMyRewardsSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "cashback.balance referral.balance referral.transactions",
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

        const rewards = await getRewardsBalanceSummary(user._id);
    const referrerWithdrawableUsd = computeReferrerWithdrawable(user);
    const sellerCredit = await getSellerPendingCreditTotal(user._id);
        // Detalle de créditos pendientes (uno por orden que usó saldo). Se usa en
    // la billetera del vendedor para mostrar de dónde viene cada monto.
    const sellerCreditItems = await getSellerPendingCredits(user._id);
    // Reclamable = solo créditos de órdenes COMPLETADAS (ver claimSellerCredit).
    const sellerCreditClaimableUsd = sellerCreditItems
      .filter((c) => c.claimable)
      .reduce((s, c) => s + (Number(c.amountUsd) || 0), 0);

    res.status(200).json({
      success: true,
      // Saldo unificado que el comprador puede gastar en checkout.
      usable: rewards, // { cashbackUsd, referralUsd, totalUsableUsd }
      // Lo único retirable a wallet (ganancia como referidor).
      referrerWithdrawableUsd,
      // Lo que la plataforma le debe al seller por compras pagadas con saldo.
      sellerCreditPendingUsd: sellerCredit.totalUsd,
      sellerCreditPendingCount: sellerCredit.count,
      // Lo que YA puede reclamar (órdenes completadas).
      sellerCreditClaimableUsd: Math.round(sellerCreditClaimableUsd * 100) / 100,
      // Detalle por orden (para la sección de vendedor).
      sellerCreditItems,
    });
  } catch (error) {
    console.error("Error en getMyRewardsSummary:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/rewards/seller-claim
 * El VENDEDOR reclama su saldo a favor (créditos por compras pagadas con
 * recompensas). En esta etapa es off-chain y manual: marca los créditos como
 * "claimed" (la plataforma ya le transfirió). Devuelve el total aplicado.
 *
 * body: { ref?: string }  referencia del pago manual (hash / nro operación).
 */
export const claimMySellerCredit = async (req, res) => {
  try {
    const { ref = "" } = req.body || {};

    const result = await claimSellerCredit(req.user._id, {
      ref: String(ref || ""),
      claimedBy: null, // el propio seller solicita el claim
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.status(200).json({
      success: true,
      message: "Saldo a favor reclamado. La plataforma procesará la transferencia.",
      applied: result.applied,
      count: result.count,
    });
  } catch (error) {
    console.error("Error en claimMySellerCredit:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
