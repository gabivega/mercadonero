// services/cashbackService.js
import CashbackConfig from "../models/CashbackConfig.js";
import User from "../models/User.js";
import Order from "../models/Order.js";

/**
 * Obtiene (y crea si hace falta) el documento de configuración global.
 * Como es singleton, siempre devolvemos el primero que exista.
 */
export async function getCashbackConfig() {
  let config = await CashbackConfig.findOne({});
  if (!config) {
    try {
      config = await CashbackConfig.create({});
    } catch (e) {
      // Si ya fue creado concurrentemente, lo releemos.
      config = await CashbackConfig.findOne({});
    }
  }
  return config;
}

/**
 * Resuelve la tasa efectiva (%) y umbral mínimo para un usuario concreto,
 * teniendo en cuenta un posible override individual (para fidelización).
 */
export async function resolveCashbackParams(user) {
  const config = await getCashbackConfig();

  const enabled =
    Boolean(user?.cashback?.overrideEnabled) || Boolean(config.enabled);

  const feePercent = user?.cashback?.overrideFeePercent ?? config.feePercent;
  const minWithdrawalUsd =
    user?.cashback?.overrideMinWithdrawalUsd ?? config.minWithdrawalUsd;

  return {
    enabled,
    feePercent, // % del SUBTOTAL de productos (0..1) que se reintegra. ej: 0.025 = 2.5%
    minWithdrawalUsd,
    maxPerOrderUsd: config.maxPerOrderUsd || 0,
    allowUseInCheckout: config.allowUseInCheckout,
    allowWithdraw: config.allowWithdraw,
    globalEnabled: config.enabled,
  };
}

/**
 * CALCULA el cashback que debería generar una orden para su comprador.
 *
 * Base de cálculo: sobre el SUBTOTAL DE PRODUCTOS en USD
 * (order.financials.totalUsd, que NO incluye el envío), se reintegra un
 * porcentaje (feePercent).
 *
 *   cashbackUsd = totalUsd * feePercent
 *
 * Ejemplo (feePercent = 0.025 → 2.5%): producto de $10.000 ARS con tasa d,
 *   totalUsd       = 10.000 / d
 *   baseFeeUsd     = totalUsd * 3%   → comisión de la plataforma
 *   cashbackUsd    = totalUsd * 2.5% → reintegro al comprador
 *   neto plataforma= baseFeeUsd - cashbackUsd (0.5% efectivo)
 *
 * Si existe tope por orden (maxPerOrderUsd), se limita.
 */
export function calculateCashbackForOrder(order, params) {
  const productsUsd = Number(order.financials?.totalUsd) || 0;
  let cashback = productsUsd * params.feePercent;

  // Redondeo a 2 decimales para evitar ruido de flotantes.
  cashback = Math.round(cashback * 100) / 100;

  if (params.maxPerOrderUsd > 0 && cashback > params.maxPerOrderUsd) {
    cashback = params.maxPerOrderUsd;
  }

  return cashback;
}

/**
 * ACREDITA cashback al comprador de una orden completada.
 * Es idempotente: si la orden ya tiene cashback.cashbackAccrued === true,
 * no vuelve a acreditar (evita doble acreditación ante reintentos).
 *
 * Se invoca desde orderController cuando la orden pasa a "completed".
 */
export async function accrueCashbackForOrder(order) {
  if (!order || order.cashback?.creditAccrued) {
    return { success: false, applied: false, reason: "ya_acreditado" };
  }

  const buyer = await User.findById(order.buyer);
  if (!buyer) {
    return { success: false, applied: false, reason: "comprador_no_encontrado" };
  }

  const params = await resolveCashbackParams(buyer);
  if (!params.enabled) {
    return { success: false, applied: false, reason: "cashback_deshabilitado" };
  }

  const earnedUsd = calculateCashbackForOrder(order, params);
  if (earnedUsd <= 0) {
    return { success: false, applied: false, reason: "monto_cero" };
  }

  // Registramos en la orden los valores usados (auditoría).
  order.cashback = {
    ...order.cashback,
    earnedUsd: Math.round(earnedUsd * 100) / 100,
    feePercentUsed: params.feePercent,
    creditAccrued: true,
  };
  await order.save();

  // Acreditamos en el usuario de forma atómica.
  await User.updateOne(
    { _id: buyer._id },
    {
      $inc: {
        "cashback.balance": earnedUsd,
        "cashback.earned": earnedUsd,
      },
      $push: {
        "cashback.transactions": {
          type: "earned",
          amount: Math.round(earnedUsd * 100) / 100,
          description: `Cashback por orden #${String(order._id).slice(-6).toUpperCase()}`,
          refType: "order",
          refId: order._id,
          status: "completed",
        },
      },
    },
  );

  console.log(
    `[Cashback] Acreditado ${earnedUsd} USDT a buyer ${buyer._id} por orden ${order._id}`,
  );
  return { success: true, applied: true, earnedUsd };
}

/**
 * USA cashback para descontar el pago de una compra (checkout in-platform).
 * Devuelve el nuevo balance o error si no alcanza / no está permitido.
 */
export async function useCashbackForCheckout(user, amountUsd, refId = null) {
  const params = await resolveCashbackParams(user);
  if (!params.allowUseInCheckout) {
    return { success: false, error: "El uso de cashback en checkout está deshabilitado." };
  }
  if (amountUsd <= 0) {
    return { success: false, error: "Monto inválido." };
  }
  if (Number(user.cashback?.balance) < amountUsd) {
    return { success: false, error: "Saldo de cashback insuficiente." };
  }

  await User.updateOne(
    { _id: user._id },
    {
      $inc: { "cashback.balance": -amountUsd, "cashback.spent": amountUsd },
      $push: {
        "cashback.transactions": {
          type: "spent",
          amount: -Math.round(amountUsd * 100) / 100,
          description: "Cashback usado en checkout",
          refType: "checkout",
          refId,
          status: "completed",
        },
      },
    },
  );

  return { success: true, applied: amountUsd };
}

/**
 * RETIRA cashback fuera de la plataforma (extracción).
 * En esta etapa se registra la solicitud/operación manual; el depósito a
 * wallet web3 se resuelve aparte (admin/privy). Devolvemos el nuevo saldo.
 */
export async function withdrawCashback(user, amountUsd, refId = null) {
  const params = await resolveCashbackParams(user);
  if (!params.allowWithdraw) {
    return { success: false, error: "La extracción de cashback está deshabilitada." };
  }
  if (amountUsd < params.minWithdrawalUsd) {
    return {
      success: false,
      error: `El monto mínimo de retiro es US$ ${params.minWithdrawalUsd}.`,
    };
  }
  if (Number(user.cashback?.balance) < amountUsd) {
    return { success: false, error: "Saldo de cashback insuficiente." };
  }

  await User.updateOne(
    { _id: user._id },
    {
      $inc: { "cashback.balance": -amountUsd, "cashback.withdrawn": amountUsd },
      $push: {
        "cashback.transactions": {
          type: "withdrawn",
          amount: -Math.round(amountUsd * 100) / 100,
          description: "Retiro de cashback fuera de la plataforma",
          refType: "withdrawal",
          refId,
          status: "completed",
        },
      },
    },
  );

  return { success: true, applied: amountUsd };
}
