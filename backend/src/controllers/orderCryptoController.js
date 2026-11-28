// backend/src/controllers/orderCryptoController.js
//
// CONTROLADOR DE ÓRDENES CON PAGO 100% CRIPTO (Escrow NeroEscrow, multichain).
// Separado de orderController.js (FASE 1 - refactor). NO toca colateral bancario.
//
// Exporta: makeCreateCryptoOrder, resolveOrderPaymentToken, confirmEscrowFunding,
// getEscrowStatus, cancelCryptoOrder, prepareEscrowFunding, rollbackCryptoOrder,
// updateOrderPaymentChain, buyerRequestEscrowRelease, adminReleaseEscrow,
// adminCancelEscrow, adminUpdateEscrowFee, adminGetEscrowConfig,
// adminUpdateEscrowFeeWallet, adminUpdateEscrowConfig, adminListCryptoOrders,
// adminNotifyBuyerEscrow.

import Order from "../models/Order.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import {
  sendVendorCryptoPaid,
  sendOrderCompletedToBuyer,
  sendOrderCancelledToBuyer,
  sendOrderCancelledToVendor,
  sendAdminCancellationRequest,
} from "../services/sendEmail.js";
import { createNotification } from "../services/notificationService.js";
import {
  getEscrowChainConfig,
  ESCROW_DEFAULT_CHAIN_ID,
} from "../config/chains.js";
import { isAdminUser, findAdminUser } from "../middleware/isAdmin.js";

const ALLOWED_PAYMENT_TOKENS = [
  "USDT",
  "USDC",
  "USDXM",
  "DAI",
  "BNB",
  "POL",
  "ETH",
];

/** Normaliza el símbolo de pago a un valor VÁLIDO para el enum del modelo. */
export const resolveOrderPaymentToken = (token, escrowChain) => {
  const normalize = (value) =>
    ALLOWED_PAYMENT_TOKENS.includes(String(value || "").toUpperCase())
      ? String(value).toUpperCase()
      : null;
  return (
    normalize(token) ||
    normalize(escrowChain?.tokenSymbol) ||
    normalize(escrowChain?.nativeSymbol) ||
    "USDT"
  );
};

/** Helper interno: incrementa sold/stock de un producto. */
async function incProductSoldStock(productId, qty) {
  await Product.findByIdAndUpdate(productId, { $inc: { sold: qty, stock: -qty } });
}

/**
 * FACTORY de la creación de orden crypto.
 * createOrder (orderController.js) arma lo común en `ctx`; este handler hace
 * SOLO la parte específica de crypto.
 */
export const makeCreateCryptoOrder = () => {
  return async (req, res, ctx) => {
    const {
      buyer, seller, buyerId, sellerId, productIds, itemsSnapshot,
      effectiveShippingAddress, isPickup, pickupLocation, shippingDetails,
      calculatedTotal, maxShippingCost, financials, validReferrerId,
      referralPercent, token, groupBuy = null, pendingRewards = null,
    } = ctx;

    if (!buyer.walletAddress) {
      return res.status(400).json({ success: false, message: "Para pagar con criptomonedas necesitás tener una wallet Web3 vinculada. Activá tu billetera desde 'Mi Billetera' antes de continuar." });
    }
    if (!seller.walletAddress) {
      return res.status(400).json({ success: false, message: "El vendedor no tiene una wallet Web3 vinculada, por lo que no puede recibir pagos en criptomonedas." });
    }

    const escrowChain = getEscrowChainConfig(req.body.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    const escrowTokenSymbol = resolveOrderPaymentToken(token, escrowChain);

    const { getFeeBps } = await import("../services/escrowServices.js");
    const feeRead = await getFeeBps(escrowChain.chainId);
    const currentFeeBps = feeRead.success ? feeRead.feeBps : 300;

    const baseFeeUsd = parseFloat((financials.totalUsd * (currentFeeBps / 10000)).toFixed(2));
    const referralFeeUsd = parseFloat((financials.totalUsd * (referralPercent / 100)).toFixed(2));
    financials.baseFeeUsd = baseFeeUsd;
    financials.referralFeeUsd = referralFeeUsd;
    financials.referralPercent = Number(referralPercent) || 0;
    financials.platformFeeUsd = parseFloat((baseFeeUsd + referralFeeUsd).toFixed(2));
    financials.sellerNetReleaseUsd = parseFloat((financials.totalUsd - financials.platformFeeUsd).toFixed(2));

    const newOrderCrypto = new Order({
      buyer: buyerId,
      seller: sellerId,
      products: productIds,
      itemsSnapshot,
      shippingAddress: effectiveShippingAddress,
      deliveryMethod: isPickup ? "pickup" : "shipping",
      pickupLocation: isPickup ? pickupLocation || undefined : undefined,
            shippingDetails,
      // Monto REAL a fondear en el escrow = productos (netos de recompensas) + envío.
      // Si el comprador usó saldo de recompensas, `financials.escrowAmountUsd`
      // trae el efectivo a pagar; si no, es null y se paga el total completo.
      // Igual criterio que la orden bancaria: el descuento de recompensas se
      // aplica DE ENTRADA al monto que fondea el comprador (no al final).
      totalAmount:
        financials.rewardsUsedUsd > 0 && financials.escrowAmountUsd != null
          ? financials.escrowAmountUsd
          : calculatedTotal + maxShippingCost,
            productsAmount:
        financials.rewardsUsedUsd > 0 && financials.escrowAmountUsd != null
          ? Math.max(
              0,
              // ⚠️ MIXTO ARREGLADO (idéntico a createOrder bancario):
              // `escrowAmountUsd` está en USD y `maxShippingCost` en ARS. Se
              // convierte el envío a USD con el TC de la orden antes de restar.
              Number(
                (
                  financials.escrowAmountUsd -
                  (financials.usdRate > 0
                    ? maxShippingCost / financials.usdRate
                    : 0)
                ).toFixed(2),
              ),
            )
          : calculatedTotal,
      shippingAmount: maxShippingCost,
      status: "pending_payment",
      financials,
      expiresAt: null,
      referral: validReferrerId ? { referrer: validReferrerId, percent: referralPercent, creditAccrued: false } : undefined,
      payment: {
        method: "crypto",
        token: escrowTokenSymbol,
        status: "funding",
        chainId: escrowChain.chainId,
        fundingMode: escrowChain.fundingMode,
        tokenAddress: escrowChain.tokenAddress || "",
        amountUsdRetained:
          financials.rewardsUsedUsd > 0
            ? financials.escrowAmountUsd
            : financials.totalUsd + financials.shippingCostUsd,
        feeUsd: financials.platformFeeUsd,
        feeBps: currentFeeBps,
        sellerNetUsd:
          financials.rewardsUsedUsd > 0
            ? Number((financials.escrowAmountUsd - financials.platformFeeUsd).toFixed(2))
            : financials.sellerNetReleaseUsd,
      },
      // ════════════════════════════════════════════════════════════════
      // COMPRA GRUPAL: persistir la INTENCIÓN en la orden.
      // BUG QUE ESTO CORRIGE: `groupBuy` llegaba al handler pero NUNCA se
      // asignaba al documento. La orden se guardaba como venta individual
      // (isGroupBuy:false, sin groupBuy.createPoolProductId), así que al
      // fondear el guard `if (order.isGroupBuy)` era false →
      // materializeGroupBuyOrder NUNCA corría → el Pool nunca se creaba y el
      // grupo no aparecía en ningún lado. Lo persistimos acá para que:
      //   - isGroupBuy quede true (filtros/visibilidad/estado group_funded),
      //   - createPoolProductId / joinPoolId sobrevivan hasta confirmEscrowFunding,
      //   - payment.groupBuy active los guards de settle en updateOrder.
      ...(groupBuy
        ? {
            isGroupBuy: true,
            groupBuy: {
              createPoolProductId: groupBuy.createPoolProductId || null,
              joinPoolId: groupBuy.joinPoolId || null,
              units: Number(groupBuy.units || 1),
              // lockedUsd / unitPriceUsd / refundUsd se fijan al materializar
              // y al cerrar el pool (precio escalonado).
            },
          }
        : {}),
    });

    const savedCryptoOrder = await newOrderCrypto.save();

        // ── RESERVAR el descuento por recompensas (si el comprador lo usó) ──
    // Fix de integridad: antes acá se intentaba GASTAR el saldo y acreditar al
    // vendedor al CREAR la orden, pero (a) llamaba a `spendRewardsForOrder`, que
    // no existe (el export real es `commitReservedRewardsForOrder`), así que el
    // catch lo tragaba y NO se descontaba nada; y (b) el SellerCredit se
    // acreditaba acá Y otra vez en commitRewardsOnComplete (unique index por
    // orden → error confuso).
    //
    // Ahora seguimos el MISMO modelo que bank_transfer: al crear solo RESERVAMOS
    // (bloquea el saldo, sin gastarlo). El consumo real + el SellerCredit ocurren
    // recién al COMPLETAR la orden (adminCompleteOrder → commitRewardsOnComplete).
    // Si la orden se cancela/reembolsa, releaseOrderRewardsReservation devuelve
    // la reserva al comprador.
    //
    // Usamos el helper compartido de orderController para respetar el monto
    // EFECTIVAMENTE reservado (por carreras de saldo) y persistirlo en la orden
    // (financials.rewardsReservedUsd).
    if (pendingRewards && pendingRewards.rewardsUsedUsd > 0) {
      try {
        const { applyPendingRewards } = await import(
          "./orderController.js"
        );
        await applyPendingRewards(savedCryptoOrder, pendingRewards);
      } catch (rewardsErr) {
        console.error(
          `[Rewards] Fallo al reservar descuento en orden crypto ${savedCryptoOrder._id}:`,
          rewardsErr.message,
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: "Orden creada con pago en criptomonedas. Fondéa el escrow desde tu billetera para que el vendedor pueda despachar.",
      order: savedCryptoOrder,
      sellerWallet: seller.walletAddress,
      buyerWallet: buyer.walletAddress,
      escrowContract: escrowChain.contractAddress,
      chainId: escrowChain.chainId,
      fundingMode: escrowChain.fundingMode,
      tokenSymbol: escrowTokenSymbol,
    });
  };
};

/** COMPRADOR CONFIRMA que fondeó el escrow on-chain (verifica on-chain). */
export const confirmEscrowFunding = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { fundTxHash, tokenAddress, token, fundingMode } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ message: "Solo el comprador puede confirmar el fondeo del escrow" });
    }
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas." });
    }
    if (order.payment?.status === "funded") {
      return res.status(200).json({ success: true, alreadyFunded: true, message: "El escrow ya estaba marcado como fondeado.", order });
    }
    if (!["funding", "unpaid"].includes(order.payment?.status)) {
      return res.status(400).json({ success: false, message: `No se puede confirmar el fondeo en este estado de pago: ${order.payment?.status}.` });
    }
    if (!fundTxHash) {
      return res.status(400).json({ success: false, message: "Falta el hash de la transacción del fondeo." });
    }

    const escrowChainId = order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID;
    const { verifyOrderFunded } = await import("../services/escrowServices.js");
    const verification = await verifyOrderFunded(
      order._id.toString(),
      order.financials.rewardsUsedUsd > 0
        ? order.financials.escrowAmountUsd
        : order.financials.totalUsd + order.financials.shippingCostUsd,
      escrowChainId,
    );

    if (!verification.success || !verification.funded) {
      return res.status(409).json({ success: false, message: "No pudimos verificar el fondeo on-chain. ¿Estás seguro de que hiciste la transacción al contrato correcto?", error: verification.error || "El escrow no está fondeado on-chain.", fundTxHash });
    }
        if (verification.amountMatches === false) {
      return res.status(409).json({ success: false, message: "El monto retenido on-chain no coincide con el total de la orden. Verificá el importe fondeado.", escrow: verification.escrow });
    }

    // ─────────────────────────────────────────────────────────────
    // ⛔ C3: VALIDACIÓN DE IDENTIDAD DEL ESCROW (comprador, vendedor y token)
    //
    // `fundOrder` es PÚBLICA: cualquiera puede llamarla directo al contrato con
    // curl/ethers, sin pasar por nuestro frontend. Hasta acá solo comparábamos
    // `deposited` y el MONTO, así que un atacante podía:
    //   (a) fondearte con un ERC20 propio sin valor (token falso),
    //   (b) poner SU segunda billetera como `_seller` y recuperar el 97% del
    //       pago cuando se libere el escrow (vendedor falso),
    //   (c) figurar como otro comprador (buyer falso).
    // Los tres datos ya los leía `getEscrow` on-chain: hasta ahora se
    // descartaban. Los comparamos contra la ORDEN y contra la wallet del
    // vendedor, y contra el token que la red tiene declarado. Sin esta guarda,
    // "verificar el fondeo" no probaba quién pagó ni con qué.
    // ─────────────────────────────────────────────────────────────
    const escrowChainCfg = getEscrowChainConfig(escrowChainId);
    const escrowInfo = verification.escrow || {};

    // (1) TOKEN: debe ser el declarado para la red en el .env, y NO puede ser
    //     address(0). Un token nativo (address(0)) llega sólo por
    //     `fundOrderNative`, que está rota (reparte el balance total del
    //     contrato, ver C4). Nada del flujo de la app lo usa, así que se
    //     rechaza por completo: cerrar esa puerta es más barato que confiar en
    //     que nadie la toque.
    const expectedToken = String(escrowChainCfg?.tokenAddress || "").toLowerCase();
    const onchainToken = String(escrowInfo.token || "").toLowerCase();
    if (!onchainToken || onchainToken === "0x0000000000000000000000000000000000000000") {
      return res.status(409).json({
        success: false,
        code: "ESCROW_NATIVE_NOT_SUPPORTED",
        message: "El escrow se fondeó con la moneda nativa, que no está soportada. Usá el pago con stablecoin.",
      });
    }
    if (expectedToken && onchainToken !== expectedToken) {
      console.warn(`[Escrow] Token falso en orden ${order._id}: esperado ${expectedToken}, on-chain ${onchainToken}`);
      return res.status(409).json({
        success: false,
        code: "ESCROW_TOKEN_MISMATCH",
        message: "El escrow se fondeó con un token distinto al de esta red. El pago no es válido.",
      });
    }

    // (2) COMPRADOR: quien figura en el escrow debe ser la wallet del comprador
    //     de la orden. Si no, el que pagó no es el que recibe el producto.
    const buyer = await User.findById(order.buyer).select("walletAddress");
    const expectedBuyer = String(buyer?.walletAddress || order.payment?.buyerWalletAddress || "").toLowerCase();
    const onchainBuyer = String(escrowInfo.buyer || "").toLowerCase();
    if (!expectedBuyer || onchainBuyer !== expectedBuyer) {
      console.warn(`[Escrow] Buyer mismatch en orden ${order._id}: esperado ${expectedBuyer || "(sin wallet)"}, on-chain ${onchainBuyer}`);
      return res.status(409).json({
        success: false,
        code: "ESCROW_BUYER_MISMATCH",
        message: "El escrow no fue fondeado desde tu billetera. Revisá el pago antes de continuar.",
      });
    }

    // (3) VENDEDOR: si el escrow apunta a OTRA billetera como vendedor, al
    //     liberarse el dinero iría a quien no corresponde. El vendedor real se
    //     cobra desde el escrow, así que este chequeo es el que evita el robo
    //     del 97% del pago.
    const sellerDoc = await User.findById(order.seller).select("walletAddress");
    const expectedSeller = String(sellerDoc?.walletAddress || "").toLowerCase();
    const onchainSeller = String(escrowInfo.seller || "").toLowerCase();
    if (!expectedSeller || onchainSeller !== expectedSeller) {
      console.warn(`[Escrow] Seller mismatch en orden ${order._id}: esperado ${expectedSeller || "(vendedor sin wallet)"}, on-chain ${onchainSeller}`);
      return res.status(409).json({
        success: false,
        code: "ESCROW_SELLER_MISMATCH",
        message: "Los datos del escrow no coinciden con el vendedor de la orden. No podemos dar el pago por válido.",
      });
    }

    const resolvedFundingMode = fundingMode || order.payment?.fundingMode || (escrowInfo.isNative ? "native" : "token");

    order.payment.status = "funded";
    order.payment.fundTxHash = fundTxHash;
    order.payment.chainId = escrowChainId;
    order.payment.fundingMode = resolvedFundingMode;
    order.payment.escrowTokenAddress = escrowInfo.token || tokenAddress || order.payment.escrowTokenAddress || "";
    order.payment.tokenAddress = resolvedFundingMode === "native" ? "" : tokenAddress || escrowInfo.token || order.payment.tokenAddress;
    order.payment.token = resolveOrderPaymentToken(token || order.payment.token, getEscrowChainConfig(escrowChainId));
    order.payment.amountUsdRetained =
      order.financials.rewardsUsedUsd > 0
        ? order.financials.escrowAmountUsd
        : order.financials.totalUsd + order.financials.shippingCostUsd;
    order.payment.fundedAt = new Date();
    // ── ESTADO SEGÚN ORIGEN: venta individual vs grupo ────────────────
    // Compra grupal: el dinero quedó retenido on-chain, pero la VENTA NO
    // EXISTE todavía. El grupo sigue juntando compradores y, si expira con un
    // solo miembro, se reembolsa (refund). Marcarla "paid" hacía que el
    // vendedor viera una venta pagada que podía desaparecer. Pasa a "paid"
    // recién al cerrarse el pool con ≥2 miembros (finalizePoolOrdersFinalPrice).
    const fundedStatus = order.isGroupBuy ? "group_funded" : "paid";
    order.statusHistory.push({
      status: fundedStatus,
      changedAt: new Date(),
      comment: order.isGroupBuy
        ? `Escrow fondeado (${order.payment.token || "USDT"}) para un grupo de compra. Los fondos quedan retenidos hasta que el grupo se cierre.`
        : `El comprador abonó con cripto (${order.payment.token || "USDT"}). Fondos retenidos en el contrato de escrow.`,
    });
    order.status = fundedStatus;
    order.paymentVerifiedAt = new Date();

    const seller = await User.findById(order.seller);
    if (seller?.email) {
      sendVendorCryptoPaid({
        vendorEmail: seller.email,
        orderId: order._id,
        amount: order.totalAmount,
        amountUsdt: order.financials?.sellerNetReleaseUsd ?? order.payment?.sellerNetUsd ?? order.payment?.amountUsdRetained,
        products: order.itemsSnapshot || [],
        buyerName: "el comprador",
      }).catch((err) => console.error("Falló email venta crypto al vendedor:", err));
    }
    // ── AVISO AL VENDEDOR ─────────────────────────────────────────────
    // DIFERENCIADO a propósito: en un grupo NO hay venta ni hay nada que
    // despachar todavía. Si avisáramos "ya podés despachar", el vendedor
    // despacharía mercadería de un grupo que puede expirar sin llenarse.
    if (seller) {
      if (order.isGroupBuy) {
        createNotification({
          recipient: seller._id,
          type: "pool_joined",
          title: "Nuevo integrante en un grupo de compra",
          message: `Un comprador fondeó su parte en un grupo del producto #${order._id.toString().slice(-6).toUpperCase()}. El grupo sigue abierto: NO despaches hasta que se llene.`,
          data: { orderId: order._id, isGroupBuy: true },
        }).catch((err) => console.error("Falló notif grupo a vendedor:", err));
      } else {
        createNotification({
          recipient: seller._id,
          type: "payment_confirmed",
          title: "El comprador pagó la orden",
          message: `El comprador depositó el dinero en el contrato para la orden #${order._id.toString().slice(-6).toUpperCase()}. Ya podés despachar.`,
          data: { orderId: order._id, totalAmount: order.totalAmount },
        }).catch((err) => console.error("Falló notif fondeo a vendedor:", err));
      }
    }

    await order.save();

    // ── COMPRA GRUPAL: materializar el Pool AHORA que hay pago on-chain ──
    // El Pool NO existía antes de pagar (flujo "pago primero, grupo después").
    // Acá, con la orden ya fondeada, se crea el grupo (si esta orden es del
    // creador) o se suma al buyer como member (si es un join), y recién ahí se
    // notifica al vendedor. Si algo falla NO se rompe el fondeo (ya on-chain).
    if (order.isGroupBuy) {
      try {
        const { materializeGroupBuyOrder } = await import(
          "./groupBuyOrderController.js"
        );
        await materializeGroupBuyOrder(order, fundTxHash);
      } catch (poolErr) {
        console.error(
          "[GroupBuy] Falló materializar el grupo tras fondear:",
          poolErr,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: order.isGroupBuy
        ? "Escrow verificado. Tu parte quedó retenida hasta que el grupo se cierre."
        : "Escrow verificado y orden activada. El vendedor puede despachar.",
      order,
    });
  } catch (error) {
    console.error("Error al confirmar fondeo del escrow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Ver el estado on-chain del escrow de una orden (diagnóstico). */
export const getEscrowStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isParticipant = order.buyer.toString() === userId || order.seller.toString() === userId;
    const isAdmin = isAdminUser(req.user);
    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ message: "No tenés permisos para ver esta orden" });
    }

    const escrowChainId = order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID;
    const { getEscrow } = await import("../services/escrowServices.js");
    const escrow = await getEscrow(order._id.toString(), escrowChainId);

    return res.status(200).json({ success: true, order, escrow });
  } catch (error) {
    console.error("Error al obtener estado del escrow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CANCELACIÓN CON ESCROW (comprador / vendedor).
 * Fondeado → registra solicitud al admin. No fondeado → cancela en DB.
 */
export const cancelCryptoOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: "No tenés permisos para cancelar esta orden" });
    }
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas. Usá el flujo de cancelación bancaria." });
    }
    const cancellable = ["pending_payment", "verifying_payment", "paid", "funded"].includes(order.status);
    if (!cancellable) {
      return res.status(400).json({ success: false, message: `No se puede cancelar la orden en estado: ${order.status}` });
    }

    if (order.payment?.status === "funded") {
      if (order.releaseRequest?.exists && order.releaseRequest.status === "pending") {
        return res.status(400).json({ success: false, message: "Ya existe una solicitud de cancelación/reembolso en curso. Esperá la resolución del admin." });
      }
      order.releaseRequest = {
        exists: true,
        requestedBy: isBuyer ? order.buyer : order.seller,
        reason: `El ${isBuyer ? "comprador" : "vendedor"} solicita cancelar la orden con escrow fondeado. El admin debe devolver los USDT al comprador (cancel-escrow).`,
        status: "pending",
        createdAt: new Date(),
      };
      order.statusHistory.push({ status: order.status, changedAt: new Date(), comment: `El ${isBuyer ? "comprador" : "vendedor"} solicitó cancelar la orden con escrow fondeado. Reembolso pendiente de aprobación del admin.` });
      order.orderActions.push({ type: "cancel_request", initiator: isBuyer ? "buyer" : "seller", paidStatus: "paid", status: "pending", reason: "Solicitud de cancelación con escrow fondeado. Reembolso on-chain pendiente del admin.", createdBy: isBuyer ? order.buyer : order.seller });
      await order.save();

      const adminUser = await findAdminUser(User);
      if (adminUser) {
        createNotification({
          recipient: adminUser._id,
          type: "order_admin_release_request",
          title: "Cancelación de escrow pendiente",
          message: `El ${isBuyer ? "comprador" : "vendedor"} solicita cancelar la orden #${order._id.toString().slice(-6).toUpperCase()} con escrow fondeado. Revisá y ejecutá el reembolso (cancel-escrow).`,
          data: { orderId: order._id },
        }).catch(() => {});
      }
      const counterparty = isBuyer ? order.seller : order.buyer;
      createNotification({
        recipient: counterparty,
        type: "order_cancelled",
        title: "Solicitud de cancelación registrada",
        message: `Se solicitó cancelar la orden #${order._id.toString().slice(-6).toUpperCase()}. Los USDT del escrow quedan retenidos hasta que el admin procese el reembolso.`,
        data: { orderId: order._id },
      }).catch(() => {});

      return res.status(200).json({ success: true, message: "Solicitud de cancelación registrada. El admin procesará el reembolso del escrow (los fondos quedan retenidos hasta entonces).", order });
    }

    order.cancelledBy = isBuyer ? "buyer" : "seller";
    order.status = "cancelled";
    order.cancelledAt = new Date();
    if (order.payment) order.payment.status = "cancelled_refunded";
    order.statusHistory.push({ status: "cancelled", changedAt: new Date(), comment: `${isBuyer ? "El comprador" : "El vendedor"} canceló la orden antes de fondear el escrow.` });
    order.orderActions.push({ type: "cancel_executed", initiator: isBuyer ? "buyer" : "seller", paidStatus: "not_paid", status: "completed", reason: "Cancelación de orden crypto antes de fondear el escrow.", createdBy: order.buyer });
    await order.save();

    await User.findByIdAndUpdate(order.buyer, { $inc: { "accounting.cancellationsAsBuyer": 1 } });

    // LIBERAR la reserva de recompensas (si la hubiera). En crypto el saldo se
    // consume al crear la orden, pero dejamos la liberacion idempotente para
    // cubrir ordenes con modelo de reserva (no-op si no hay monto reservado).
    try {
      const { releaseOrderRewardsReservation } = await import("./orderController.js");
      await releaseOrderRewardsReservation(order, { reason: "orden crypto cancelada sin fondear" });
    } catch (rewardsErr) {
      console.error("[Rewards] Fallo liberar reserva en cancel crypto:", rewardsErr?.message);
    }

    const buyer = await User.findById(order.buyer);
    if (buyer?.email) {
      sendOrderCancelledToBuyer({ buyerEmail: buyer.email, orderId: order._id, amount: order.totalAmount, withRefund: false }).catch(() => {});
    }
    const sellerUsr = await User.findById(order.seller);
    if (sellerUsr?.email) {
      sendOrderCancelledToVendor({ vendorEmail: sellerUsr.email, orderId: order._id, amount: order.totalAmount, withRefund: false }).catch(() => {});
    }
    createNotification({
      recipient: order.seller,
      type: "order_cancelled",
      title: "Orden cancelada",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} fue cancelada antes del fondeo del escrow.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({ success: true, message: "Orden cancelada (escrow aún no fondeado).", order });
  } catch (error) {
    console.error("Error al cancelar orden crypto:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** COMPRADOR PREPARA el fondeo del escrow (start-here para el front + gas drip). */
export const prepareEscrowFunding = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ message: "Solo el comprador puede preparar el fondeo del escrow" });
    }
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas (escrow)." });
    }

    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);
    const buyerWallet = buyer?.walletAddress;
    if (!buyerWallet) {
      return res.status(400).json({ success: false, needsWallet: true, message: "Necesitas tener una wallet Web3 vinculada para fondear el escrow. Activa tu billetera desde 'Mi Billetera'." });
    }

    const escrowChain = getEscrowChainConfig(order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    const isNativeFunding = escrowChain.fundingMode === "native";
    const tokenAddress = isNativeFunding
      ? ""
      : order.payment?.tokenAddress || escrowChain.tokenAddress || process.env.USDT_TOKEN_ADDRESS || process.env.USDT_TESTNET_ADDRESS || "";
    const tokenSymbol = order.payment?.token || escrowChain.tokenSymbol;
    const requiredUsd = (order.financials?.totalUsd || 0) + (order.financials?.shippingCostUsd || 0);

    const { prepareFunding } = await import("../services/gasDripService.js");
    const gas = await prepareFunding({
      userId,
      walletAddress: buyerWallet,
      usdtAddress: tokenAddress,
      requiredUsd,
      chainId: escrowChain.chainId,
      reason: "approve",
      refId: order._id,
    });
    if (!gas.success) {
      return res.status(400).json({
        success: false,
        message: gas.error || "No se pudo preparar el gas/saldo para el fondeo.",
        insufficientUsdt: !!gas.insufficientUsdt,
        balance: gas.balanceUsd ?? 0,
      });
    }

    const fundingPayload = {
      orderId: order._id.toString(),
      chainId: escrowChain.chainId,
      contractAddress: escrowChain.contractAddress,
      fundingMode: escrowChain.fundingMode,
      isNativeFunding,
      tokenAddress,
      token: tokenSymbol,
      sellerWallet: seller?.walletAddress || null,
      buyerWallet,
      requiredUsd,
      feeBps: order.payment?.feeBps || undefined,
    };

    return res.status(200).json({
      success: true,
      ...fundingPayload,
      gasDripped: !!gas?.drip?.delivered,
      funding: fundingPayload,
      gas,
    });
  } catch (error) {
    console.error("Error al preparar fondeo del escrow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ROLLBACK de orden crypto PROVISIONAL (comprador cerro el modal sin fondear). */
export const rollbackCryptoOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ message: "Solo el comprador puede hacer rollback de esta orden" });
    }
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "El rollback solo aplica a ordenes con pago en criptomonedas." });
    }
    if (!["funding", "unpaid"].includes(order.payment?.status)) {
      return res.status(400).json({ success: false, message: `No se puede eliminar la orden: el pago esta en estado "${order.payment?.status}".` });
    }
    if (!["pending_payment", "verifying_payment"].includes(order.status)) {
      return res.status(400).json({ success: false, message: `No se puede eliminar la orden en estado "${order.status}".` });
    }

    await Order.findByIdAndDelete(orderId);

    return res.status(200).json({ success: true, message: "Orden provisional eliminada correctamente.", orderId });
  } catch (error) {
    console.error("Error al hacer rollback de orden crypto:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** CAMBIAR LA RED DE PAGO de una orden crypto PROVISIONAL (comprador). */
export const updateOrderPaymentChain = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { chainId } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ message: "Solo el comprador puede cambiar la red de pago." });
    }
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas (escrow)." });
    }
    if (!["funding", "unpaid"].includes(order.payment?.status)) {
      return res.status(400).json({ success: false, message: `No se puede cambiar la red: el pago esta en estado "${order.payment?.status}".` });
    }
    if (!["pending_payment", "verifying_payment"].includes(order.status)) {
      return res.status(400).json({ success: false, message: `No se puede cambiar la red en estado "${order.status}".` });
    }
    if (chainId == null) {
      return res.status(400).json({ success: false, message: "Falta el chainId destino." });
    }

    const escrowChain = getEscrowChainConfig(Number(chainId));
    const seller = await User.findById(order.seller);

    order.payment.chainId = escrowChain.chainId;
    order.payment.fundingMode = escrowChain.fundingMode;
    order.payment.tokenAddress = escrowChain.tokenAddress || "";
    order.payment.token = resolveOrderPaymentToken(escrowChain.tokenSymbol, escrowChain);
    order.statusHistory.push({ status: order.status, changedAt: new Date(), comment: `El comprador eligio pagar en ${escrowChain.key} (chain ${escrowChain.chainId}, ${escrowChain.tokenSymbol}).` });
    await order.save();

    return res.status(200).json({
      success: true,
      message: `Red de pago actualizada a ${escrowChain.tokenSymbol} (${escrowChain.key}).`,
      order,
      chainId: escrowChain.chainId,
      contractAddress: escrowChain.contractAddress,
      fundingMode: escrowChain.fundingMode,
      isNativeFunding: escrowChain.fundingMode === "native",
      tokenAddress: escrowChain.tokenAddress || "",
      token: escrowChain.tokenSymbol,
      sellerWallet: seller?.walletAddress || null,
    });
  } catch (error) {
    console.error("Error al cambiar la red de pago:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** COMPRADOR SOLICITA al admin la liberacion del escrow (post inactividad). */
export const buyerRequestEscrowRelease = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ message: "Solo el comprador puede solicitar la liberacion del escrow" });
    }
    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas (escrow)." });
    }
    if (order.payment?.status !== "funded") {
      return res.status(400).json({ success: false, message: `El escrow no esta fondeado (estado: ${order.payment?.status}). No hay nada que liberar.` });
    }
    if (["cancelled", "completed"].includes(order.status)) {
      return res.status(400).json({ success: false, message: `La orden ya esta ${order.status}.` });
    }
    if (order.dispute?.exists) {
      return res.status(409).json({ success: false, message: "Hay una disputa abierta en esta orden. El admin la resolvera y definira la liberacion." });
    }
    if (order.releaseRequest?.exists && order.releaseRequest.status === "pending") {
      return res.status(400).json({ success: false, message: "Ya existe una solicitud de liberacion en curso. Espera la resolucion del admin." });
    }

    order.releaseRequest = {
      exists: true,
      requestedBy: order.buyer,
      reason: reason || "Liberacion solicitada por el comprador (plazo de inactividad).",
      status: "pending",
      createdAt: new Date(),
    };
    order.orderActions.push({ type: "admin_intervention", initiator: "buyer", paidStatus: "paid", status: "pending", reason: "El comprador solicita la liberacion del escrow al admin tras el plazo de inactividad. " + (reason || ""), createdBy: order.buyer });
    await order.save();

    const adminUser = await findAdminUser(User);
    if (adminUser) {
      createNotification({
        recipient: adminUser._id,
        type: "order_admin_release_request",
        title: "Solicitud de liberacion de escrow",
        message: `El comprador solicita liberar el escrow de la orden #${order._id.toString().slice(-6).toUpperCase()}. Revisala en el panel de admin (adminReleaseEscrow).`,
        data: { orderId: order._id },
      }).catch(() => {});
      if (adminUser.email) {
        const [buyerInfo, sellerInfo] = await Promise.all([User.findById(order.buyer), User.findById(order.seller)]);
        sendAdminCancellationRequest({
          adminEmail: adminUser.email,
          orderId: order._id,
          amount: order.totalAmount,
          sellerName: sellerInfo?.username || sellerInfo?.firstName || "El vendedor",
          buyerName: buyerInfo?.firstName || buyerInfo?.username || "El comprador",
          reason: reason || "Liberacion de escrow solicitada por el comprador.",
        }).catch((err) => console.error("Fallo email de solicitud de liberacion de escrow:", err));
      }
    }

    return res.status(200).json({ success: true, message: "Solicitud enviada al admin. El escrow se liberara manualmente luego de verificar la entrega.", order });
  } catch (error) {
    console.error("Error al solicitar liberacion de escrow:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: LIBERA el escrow manualmente (fondos al vendedor, cobra fee). */
export const adminReleaseEscrow = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas (escrow)." });
    }
    if (order.payment?.status !== "funded") {
      return res.status(400).json({ success: false, message: `El escrow no esta fondeado (estado: ${order.payment?.status}).` });
    }

    const { releaseOrderEscrow } = await import("../services/escrowServices.js");
    const result = await releaseOrderEscrow(order._id.toString(), order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    if (!result.success) {
      return res.status(500).json({ success: false, message: "No se pudo liberar el escrow on-chain.", error: result.error });
    }

    order.payment.status = "released";
    order.payment.releaseTxHash = result.txHash;
    order.payment.releasedAt = new Date();
    order.status = "completed";
    order.completedAt = new Date();
    order.statusHistory.push({ status: "completed", changedAt: new Date(), comment: "Escrow liberado manualmente por el admin (fondos enviados al vendedor)." });
    order.orderActions.push({ type: "admin_intervention", initiator: "admin", paidStatus: "paid", status: "completed", reason: "El admin libero el escrow manualmente.", releaseTxHash: result.txHash, createdBy: req.user?._id });
    await order.save();

    await User.findByIdAndUpdate(order.seller, { $inc: { "accounting.completedSales": 1, "shop.totalSalesCount": 1 } });
    await User.findByIdAndUpdate(order.buyer, { $inc: { "accounting.completedPurchases": 1 } });
    for (const item of order.itemsSnapshot) {
      await incProductSoldStock(item.productId, item.quantity || 1);
    }

    const buyerThis = await User.findById(order.buyer);
    if (buyerThis?.email) {
      sendOrderCompletedToBuyer({ buyerEmail: buyerThis.email, orderId: order._id, amount: order.totalAmount }).catch(() => {});
    }

    return res.status(200).json({ success: true, message: "Escrow liberado y orden completada por el admin.", order, releaseTxHash: result.txHash });
  } catch (error) {
    console.error("Error al liberar escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: CANCELA y reembolsa el escrow al comprador. */
export const adminCancelEscrow = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas (escrow)." });
    }
    if (order.payment?.status !== "funded") {
      return res.status(400).json({ success: false, message: `El escrow no esta fondeado (estado: ${order.payment?.status}).` });
    }

    const { cancelOrderEscrow } = await import("../services/escrowServices.js");
    const result = await cancelOrderEscrow(order._id.toString(), order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    if (!result.success) {
      return res.status(500).json({ success: false, message: "No se pudo cancelar/devolver el escrow on-chain.", error: result.error });
    }

    order.payment.status = "cancelled_refunded";
    order.payment.cancelTxHash = result.txHash;
    order.payment.cancelledRefundedAt = new Date();
    order.payment.releasedAt = new Date();
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = "admin";
    order.statusHistory.push({ status: "cancelled", changedAt: new Date(), comment: "Escrow cancelado y reembolsado al comprador por el admin." });
    order.orderActions.push({ type: "admin_intervention", initiator: "admin", paidStatus: "paid", status: "completed", reason: "El admin cancelo el escrow y devolvio el 100% de los USDT al comprador.", releaseTxHash: result.txHash, createdBy: req.user?._id });
    await order.save();

    // LIBERAR la reserva de recompensas (escrow cancelado/reembolsado = orden NO completada).
    try {
      const { releaseOrderRewardsReservation } = await import("./orderController.js");
      await releaseOrderRewardsReservation(order, { reason: "escrow cancelado por admin" });
    } catch (rewardsErr) {
      console.error("[Rewards] Fallo liberar reserva en adminCancelEscrow:", rewardsErr?.message);
    }

    await User.findByIdAndUpdate(order.buyer, { $inc: { "accounting.cancellationsAsBuyer": 1 } });

    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (buyer?.email) {
      sendOrderCancelledToBuyer({ buyerEmail: buyer.email, orderId: order._id, amount: order.totalAmount, withRefund: true }).catch(() => {});
    }
    if (sellerUsr?.email) {
      sendOrderCancelledToVendor({ vendorEmail: sellerUsr.email, orderId: order._id, amount: order.totalAmount, withRefund: false }).catch(() => {});
    }
    createNotification({
      recipient: order.buyer,
      type: "order_cancelled",
      title: "Tu compra fue cancelada y tu dinero devuelto",
      message: `El admin cancelo la orden #${order._id.toString().slice(-6).toUpperCase()} y los USDT del escrow fueron devueltos a tu billetera.`,
      data: { orderId: order._id },
    }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_cancelled",
      title: "Tu venta fue cancelada (escrow reembolsado)",
      message: `El admin cancelo la orden #${order._id.toString().slice(-6).toUpperCase()} y devolvio los USDT al comprador.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({ success: true, message: "Escrow cancelado y orden cancelada por el admin. Los USDT fueron devueltos al comprador.", order, cancelTxHash: result.txHash });
  } catch (error) {
    console.error("Error al cancelar escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: SETTLE FLEXIBLE del escrow (poder absoluto, montos variables). */
export const adminSettleEscrow = async (req, res) => {
  try {
    const { orderId } = req.params;
    // Montos en USD (unidades humanas). Default 0 cada uno.
    const sellerAmount = Number(req.body?.sellerAmount ?? 0);
    const feeAmount = Number(req.body?.feeAmount ?? 0);
    const refundAmount = Number(req.body?.refundAmount ?? 0);

    if (![sellerAmount, feeAmount, refundAmount].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ success: false, message: "Los montos (sellerAmount, feeAmount, refundAmount) deben ser numeros >= 0." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.payment?.method !== "crypto") {
      return res.status(400).json({ success: false, message: "Esta orden no usa pago en criptomonedas (escrow)." });
    }
    if (order.payment?.status !== "funded") {
      return res.status(400).json({ success: false, message: "El escrow no esta fondeado (estado: " + order.payment?.status + ")." });
    }

    // La suma debe coincidir con el monto retenido on-chain.
    const retained = Number(order.payment?.amountUsdRetained || 0);
    const sum = Number((sellerAmount + feeAmount + refundAmount).toFixed(6));
    if (Math.abs(sum - retained) > 0.011) {
      return res.status(400).json({
        success: false,
        message: "La suma de montos (" + sum + ") no coincide con el monto retenido en el escrow (" + retained + ").",
      });
    }

    const { settleOrderEscrow } = await import("../services/escrowServices.js");
    const result = await settleOrderEscrow(
      order._id.toString(),
      { sellerAmount, feeAmount, refundAmount },
      order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID,
    );
    if (!result.success) {
      return res.status(500).json({ success: false, message: "No se pudo hacer el settle on-chain.", error: result.error });
    }

    // Reflejar el cierre en la orden segun el reparto.
    const fullyRefunded = sellerAmount === 0 && feeAmount === 0 && refundAmount > 0;
    order.payment.settleTxHash = result.txHash;
    order.payment.settledAt = new Date();
    order.payment.settleBreakdown = { sellerAmount, feeAmount, refundAmount };

    if (fullyRefunded) {
      order.payment.status = "cancelled_refunded";
      order.payment.cancelledRefundedAt = new Date();
      order.payment.releasedAt = new Date();
      order.status = "cancelled";
      order.cancelledAt = new Date();
      order.cancelledBy = "admin";
      order.statusHistory.push({ status: "cancelled", changedAt: new Date(), comment: "Escrow cancelado y reembolsado (settle) por el admin." });
      order.orderActions.push({ type: "admin_intervention", initiator: "admin", paidStatus: "paid", status: "completed", reason: "Settle: reembolso total al comprador.", releaseTxHash: result.txHash, createdBy: req.user?._id });
    } else {
      order.payment.status = "released";
      order.payment.releaseTxHash = result.txHash;
      order.payment.releasedAt = new Date();
      order.status = "completed";
      order.completedAt = new Date();
      order.statusHistory.push({ status: "completed", changedAt: new Date(), comment: "Escrow cerrado (settle) por el admin." });
      order.orderActions.push({ type: "admin_intervention", initiator: "admin", paidStatus: "paid", status: "completed", reason: "Settle: seller=" + sellerAmount + " fee=" + feeAmount + " refund=" + refundAmount + ".", releaseTxHash: result.txHash, createdBy: req.user?._id });
    }
    await order.save();

    // LIBERAR la reserva de recompensas SOLO si el settle dejó la orden cancelada
    // (reembolso total). Si terminó 'completed', las recompensas se consumen al
    // completar (flujo de adminCompleteOrder), no acá.
    if (order.status === "cancelled") {
      try {
        const { releaseOrderRewardsReservation } = await import("./orderController.js");
        await releaseOrderRewardsReservation(order, { reason: "settle con reembolso total" });
      } catch (rewardsErr) {
        console.error("[Rewards] Fallo liberar reserva en adminSettleEscrow:", rewardsErr?.message);
      }
    }

    createNotification({
      recipient: order.seller,
      type: "escrow_settled",
      title: "Escrow cerrado por el admin",
      message: "Se cerro el escrow de la orden #" + order._id.toString().slice(-6).toUpperCase() + " (settle). seller=" + sellerAmount + " fee=" + feeAmount + " refund=" + refundAmount + ".",
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({ success: true, message: "Settle aplicado correctamente.", order, txHash: result.txHash, breakdown: { sellerAmount, feeAmount, refundAmount } });
  } catch (error) {
    console.error("Error al hacer settle del escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: ACTUALIZA el fee global del escrow en el contrato (bps). */
export const adminUpdateEscrowFee = async (req, res) => {
  try {
    const { feeBps } = req.body;

    if (typeof feeBps !== "number" || isNaN(feeBps) || feeBps < 0 || feeBps > 5000) {
      return res.status(400).json({ success: false, message: "El fee debe ser un numero entero de puntos base entre 0 y 5000 (5000 = 50%)." });
    }

    const { setEscrowFeeBps } = await import("../services/escrowServices.js");
    const result = await setEscrowFeeBps(Math.round(feeBps), req.body.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    if (!result.success) {
      return res.status(500).json({ success: false, message: "No se pudo actualizar el fee del escrow on-chain.", error: result.error });
    }

    return res.status(200).json({ success: true, message: `Fee del escrow actualizado a ${result.feeBps} bps (${(result.feeBps / 100).toFixed(2)}%).`, feeBps: result.feeBps, txHash: result.txHash });
  } catch (error) {
    console.error("Error al actualizar fee del escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: Lee la config on-chain del escrow (fee, feeWallet, admin). */
export const adminGetEscrowConfig = async (req, res) => {
  try {
    const { getEscrowConfig } = await import("../services/escrowServices.js");
    const result = await getEscrowConfig(req.query.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    if (!result.success) {
      return res.status(500).json({ success: false, message: "No se pudo leer la config del escrow on-chain.", error: result.error });
    }
    return res.status(200).json({ success: true, config: result });
  } catch (error) {
    console.error("Error al obtener config del escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: Actualiza la feeWallet del contrato de escrow de una red. */
export const adminUpdateEscrowFeeWallet = async (req, res) => {
  try {
    const { feeWallet } = req.body;
    if (!feeWallet || !/^0x[a-fA-F0-9]{40}$/.test(feeWallet)) {
      return res.status(400).json({ success: false, message: "Direccion de feeWallet invalida (debe ser 0x + 40 hex)." });
    }

    const { setEscrowFeeWallet } = await import("../services/escrowServices.js");
    const result = await setEscrowFeeWallet(feeWallet, req.body.chainId ?? ESCROW_DEFAULT_CHAIN_ID);
    if (!result.success) {
      return res.status(500).json({ success: false, message: "No se pudo actualizar la feeWallet on-chain.", error: result.error });
    }
    return res.status(200).json({ success: true, message: "FeeWallet actualizada.", txHash: result.txHash });
  } catch (error) {
    console.error("Error al actualizar feeWallet (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: Actualiza parametros de plataforma del escrow (plazo de liberacion). */
export const adminUpdateEscrowConfig = async (req, res) => {
  try {
    const { autoReleaseDays } = req.body;
    if (autoReleaseDays != null && (typeof autoReleaseDays !== "number" || autoReleaseDays < 0)) {
      return res.status(400).json({ success: false, message: "autoReleaseDays debe ser un numero >= 0." });
    }

    const { getEscrowConfig: getDbConfig, setEscrowPlatformConfig } = await import("../services/escrowConfigService.js");
    if (typeof setEscrowPlatformConfig === "function") {
      const saved = await setEscrowPlatformConfig({ autoReleaseDays });
      return res.status(200).json({ success: true, message: "Config de escrow actualizada.", config: saved });
    }
    const current = await getDbConfig();
    return res.status(200).json({ success: true, message: "Sin cambios aplicados (setEscrowPlatformConfig no disponible).", config: current });
  } catch (error) {
    console.error("Error al actualizar config de escrow (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: Lista ordenes con pago cripto (escrow) por estado. */
export const adminListCryptoOrders = async (req, res) => {
  try {
    const { paymentStatus, status, limit = 100 } = req.query;
    const query = { "payment.method": "crypto" };
    if (paymentStatus) query["payment.status"] = paymentStatus;
    if (status) query.status = status;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 100, 300))
      .populate("buyer", "firstName username email walletAddress")
      .populate("seller", "firstName username email walletAddress");

    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error("Error al listar ordenes crypto (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/** ADMIN: Recuerda al comprador que confirme la recepcion (escrow fondeado). */
export const adminNotifyBuyerEscrow = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });
    if (order.payment?.method !== "crypto" || order.payment?.status !== "funded") {
      return res.status(400).json({ success: false, message: "La orden no tiene un escrow fondeado." });
    }

    const { sendEscrowConfirmReminderToBuyer } = await import("../services/sendEmail.js");
    const buyer = await User.findById(order.buyer);
    if (buyer?.email && typeof sendEscrowConfirmReminderToBuyer === "function") {
      sendEscrowConfirmReminderToBuyer({ buyerEmail: buyer.email, orderId: order._id, amount: order.totalAmount }).catch(() => {});
    }
    createNotification({
      recipient: order.buyer,
      type: "escrow_confirm_reminder",
      title: "Recordatorio: confirma la recepcion",
      message: `Recorda confirmar la recepcion de la orden #${order._id.toString().slice(-6).toUpperCase()} para liberar el escrow al vendedor.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({ success: true, message: "Recordatorio enviado al comprador." });
  } catch (error) {
    console.error("Error al notificar al comprador (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
