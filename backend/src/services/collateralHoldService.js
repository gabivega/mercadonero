// backend/src/services/collateralHoldService.js
//
// GESTIÓN DE HOLDS DE COLATERAL (estado "awaiting_collateral")
//
// Este servicio concentra toda la lógica de negocio del estado intermedio
// que aparece cuando el vendedor NO tiene saldo de garantía libre suficiente
// para cubrir una orden en el momento del checkout.
//
// En lugar de "rebotar" la orden, se crea una orden en estado
// "awaiting_collateral" y se le da al vendedor una ventana (15 min) para que
// deposite colateral. El comprador puede esperar o cancelar y buscar otro
// vendedor. Mientras el hold está activo, se reserva la capacidad para no
// sobre-prometer la garantía.
//
// Parámetros de política (configurables por código / admin más adelante):
//   - MAX_ACTIVE_HOLDS_PER_VENDOR : máx. de holds activos simultáneos (2)
//   - MAX_EXPIRED_HOLDS_PER_DAY   : máx. de vencimientos por día (3)
//   - HOLD_MS                     : duración del hold (15 min)

import Order from "../models/Order.js";
import User from "../models/User.js";
import { lockVendorCollateral, getVendorCollateral } from "./blockchainServices.js";
import { transitionToStatus } from "./orderHelpers.js";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN / POLÍTICA (parametrizable)
// ─────────────────────────────────────────────────────────────
const MAX_ACTIVE_HOLDS_PER_VENDOR = 2;
const MAX_EXPIRED_HOLDS_PER_DAY = 3;
const HOLD_MS = 15 * 60 * 1000; // 15 minutos

// Parámetros accesibles desde el controller (para notificar al comprador el
// tiempo que tendrá que esperar / para setear expiresAt).
export const COLLATERAL_HOLD_CONFIG = {
  MAX_ACTIVE_HOLDS_PER_VENDOR,
  MAX_EXPIRED_HOLDS_PER_DAY,
  HOLD_MS,
};

/**
 * Calcula el monto de colateral (USDT) que un vendedor necesita reservar
 * para su órdenes en estado intermedio de espera ("awaiting_collateral").
 * Este total restado contra su saldo on-chain disponible evita que un
 * vendedor quede prometiendo más capacidad de la que realmente tiene.
 */
export async function getVendorReservedHoldUsd(sellerId) {
  const activeHolds = await Order.find({
    seller: sellerId,
    status: "awaiting_collateral",
    "collateralHold.status": "pending",
  }).select("collateralHold.reserveUsd");

  return activeHolds.reduce(
    (acc, order) => acc + (order.collateralHold?.reserveUsd || 0),
    0,
  );
}

/**
 * Valida si el vendedor puede crear UN NUEVO hold de colateral.
 * Restricciones:
 *   - No puede tener más de MAX_ACTIVE_HOLDS_PER_VENDOR activos.
 *   - No puede haber vencido más de MAX_EXPIRED_HOLDS_PER_DAY holds hoy
 *     (disciplina para vendedores que no cumplen la demanda).
 *
 * Devuelve { ok, reason, counts } para poder diagnosticar y mostrar mensajes.
 */
export async function validateVendorHoldCapacity(sellerId) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [activeCount, expiredToday] = await Promise.all([
    Order.countDocuments({
      seller: sellerId,
      status: "awaiting_collateral",
      "collateralHold.status": "pending",
    }),
    Order.countDocuments({
      seller: sellerId,
      "collateralHold.status": "expired",
      "collateralHold.expiresAt": { $gte: dayStart },
    }),
  ]);

  if (activeCount >= MAX_ACTIVE_HOLDS_PER_VENDOR) {
    return {
      ok: false,
      code: "MAX_ACTIVE_HOLDS",
      reason: `Este vendedor ya tiene ${MAX_ACTIVE_HOLDS_PER_VENDOR} solicitudes en espera de garantía.`,
      counts: { activeCount, expiredToday },
    };
  }

  if (expiredToday >= MAX_EXPIRED_HOLDS_PER_DAY) {
    return {
      ok: false,
      code: "MAX_EXPIRED_HOLDS",
      reason: `Este vendedor agotó sus ${MAX_EXPIRED_HOLDS_PER_DAY} oportunidades diarias de cubrir garantía.`,
      counts: { activeCount, expiredToday },
    };
  }

  return { ok: true, counts: { activeCount, expiredToday } };
}

/**
 * Calcula el colateral EFECTIVO con el que cuenta un vendedor para aceptar
 * nuevas órdenes: su saldo libre on-chain menos lo ya reservado por holds
 * de colateral activos (estado "awaiting_collateral" pendiente).
 *
 * Es la fuente de verdad para decidir si una nueva orden entra en el flujo
 * normal (saldo alcanza) o debe pasar al estado de espera de colateral.
 */
export async function getVendorEffectiveAvailable(sellerId, walletAddress) {
  const onChain = await getVendorCollateral(walletAddress);
  const reservedByHolds = await getVendorReservedHoldUsd(sellerId);

  const availableOnChain = onChain.success ? onChain.available : 0;
  const effectiveAvailable = Math.max(availableOnChain - reservedByHolds, 0);

  return {
    success: true,
    availableOnChain,
    reservedByHolds,
    effectiveAvailable,
  };
}

/**
 * FUNCIÓN ÚNICA DE RESOLUCIÓN del hold: convierte una orden
 * "awaiting_collateral" en una orden real "pending_payment" bloqueando el
 * colateral on-chain.
 *
 * Es idempotente y segura ante concurrencia:
 *   - Usa findOneAndUpdate con condición de estado para que solo UNA llamada
 *     "gane" la transición (evita crear doble lock on-chain).
 *   - Si la blockchain falla, la orden vuelve a "awaiting_collateral".
 */
export async function resolveCollateralHold(orderId) {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: "awaiting_collateral",
      "collateralHold.status": "pending",
    },
    { $set: { "collateralHold.status": "fulfilled" } },
    { new: false }, // devolvemos el documento ANTES del update para tener el amountToLock
  );

  if (!order) {
    return {
      success: false,
      error: "El hold de colateral ya fue resuelto o no existe.",
    };
  }

  const seller = await order.populate("seller", "walletAddress");

  // El objeto ya está marcado fulfilled; si algo falla, lo revertimos.
  const amountToLock = order.financials.totalUsd + order.financials.shippingCostUsd;

  const blockchainResult = await lockVendorCollateral(
    order._id.toString(),
    seller.walletAddress,
    amountToLock,
  );

  if (!blockchainResult.success) {
    // Revertimos el "fulfilled" para que el hold siga esperando.
    await Order.findByIdAndUpdate(order._id, {
      $set: { "collateralHold.status": "pending" },
    });
    return {
      success: false,
      error: blockchainResult.error,
      retryable: true, // El vendedor puede seguir intentando
    };
  }

  order.collateralTxHash = blockchainResult.txHash;
  order.collateralHold.status = "fulfilled";
  order.collateralHold.fulfilledAt = new Date();

  const savedOrder = await transitionToStatus(
    order,
    "pending_payment",
    "Colateral depositado por el vendedor. Orden activada.",
  );

  return { success: true, order: savedOrder, txHash: blockchainResult.txHash };
}

/**
 * Expira un hold de colateral (ventana de 15 min sin que el vendedor
 * deposite). Registra la penalización en el accounting del vendedor.
 */
export async function expireCollateralHold(order, { penalize = true } = {}) {
  order.collateralHold.status = "expired";
  order.collateralHold.expiredAt = new Date();

  await transitionToStatus(
    order,
    "expired",
    "La solicitud de compra venció porque el vendedor no depositó colateral a tiempo.",
  );

  if (penalize) {
    // El vendedor "venció" la oportunidad de cubrir su garantía. Esto alimenta
    // el futuro sistema de reputación/cobertura y disciplina a quien no puede
    // cumplir la demanda. (No se penaliza al comprador, que no cometió falta).
    await User.findByIdAndUpdate(order.seller, {
      $inc: { "accounting.expiredCollateralHolds": 1 },
    });
  }

  return { success: true, order };
}
