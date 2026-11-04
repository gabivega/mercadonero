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
import { DEFAULT_CHAIN_ID } from "../config/chains.js";
import { transitionToStatus } from "./orderHelpers.js";
import { createNotification } from "./notificationService.js";
import { sendOrderCancelledToBuyer } from "./sendEmail.js";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN / POLÍTICA (parametrizable)
// ─────────────────────────────────────────────────────────────
// ⚠️ FASE TRANSITORIA — LÍMITE DE HOLDS DE COLATERAL (switch por env).
//
// Mientras el flujo de BUFFER (reception_confirmed → liberación manual del
// admin) no esté aceitado, el colateral de las órdenes que el comprador ya
// confirmó queda CONGELADO on-chain hasta que el admin lo libere. Eso baja el
// "saldo disponible" del vendedor y dispara FALSOS "no puede recibir más
// solicitudes en espera de garantía".
//
// Para no bloquear ventas legítimas durante esta fase, permitimos DESACTIVAR
// el límite con COLLATERAL_HOLD_LIMIT_ENABLED=false (default: true = activo).
// Cuando el buffer esté resuelto, se reactiva solo cambiando la env.
const HOLD_LIMIT_ENABLED =
  String(process.env.COLLATERAL_HOLD_LIMIT_ENABLED ?? "true").toLowerCase() !==
  "false";

const MAX_ACTIVE_HOLDS_PER_VENDOR = 2;
const MAX_EXPIRED_HOLDS_PER_DAY = 3;
const HOLD_MS = 15 * 60 * 1000; // 15 minutos

// Parámetros accesibles desde el controller (para notificar al comprador el
// tiempo que tendrá que esperar / para setear expiresAt).
export const COLLATERAL_HOLD_CONFIG = {
  MAX_ACTIVE_HOLDS_PER_VENDOR,
  MAX_EXPIRED_HOLDS_PER_DAY,
  HOLD_MS,
  LIMIT_ENABLED: HOLD_LIMIT_ENABLED,
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
  // Límite deshabilitado por env (fase transitoria del buffer). Permitimos
  // siempre el hold: el control real de capacidad sigue siendo el saldo
  // on-chain del vendedor (un hold sin saldo igualmente no se puede resolver).
  if (!HOLD_LIMIT_ENABLED) {
    return {
      ok: true,
      disabled: true,
      counts: { activeCount: 0, expiredToday: 0 },
    };
  }

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
export async function getVendorEffectiveAvailable(
  sellerId,
  walletAddress,
  chainId = null,
) {
  // MULTICHAIN: si no se especifica una red, el disponible se calcula como la
  // SUMA del saldo libre del vendedor en TODAS las redes configuradas. Si se
  // pasa un chainId, se evalúa solo esa red. Esto mantiene coherencia con la
  // selección de red de colateral de createOrder/resolveCollateralHold.
  let availableOnChain = 0;
  if (chainId == null) {
    const multi = await getVendorCollateralMultiChain(walletAddress);
    availableOnChain = multi.success ? multi.totalAvailable : 0;
  } else {
    const onChain = await getVendorCollateral(walletAddress, chainId);
    availableOnChain = onChain.success ? onChain.available : 0;
  }
  const reservedByHolds = await getVendorReservedHoldUsd(sellerId);

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

  // Buscamos al vendedor directamente por su ID (más robusto que populate:
  // garantiza traer el walletAddress vigente desde la colección User).
  const seller = await User.findById(order.seller);

  if (!seller) {
    await Order.findByIdAndUpdate(order._id, {
      $set: { "collateralHold.status": "pending" },
    });
    return { success: false, retryable: true, error: "No se encontró el vendedor de la orden." };
  }
  if (!seller.walletAddress) {
    await Order.findByIdAndUpdate(order._id, {
      $set: { "collateralHold.status": "pending" },
    });
    return {
      success: false,
      retryable: true,
      insufficientFunds: true,
      error:
        "Tu cuenta no tiene una billetera Web3 vinculada (walletAddress vacía). " +
        "Activá tu billetera desde 'Mi Billetera' y asegurate de depositar la garantía desde ESA misma billetera, luego reintentá.",
    };
  }

  const amountToLock = order.financials.totalUsd + order.financials.shippingCostUsd;

  // ─────────────────────────────────────────────────────────────
  // VERIFICACIÓN PREVIA de saldo on-chain del vendedor (MULTICHAIN).
  // El colateral puede haberse depositado en CUALQUIERA de las redes
  // configuradas (BSC / Base / Polygon Amoy): NO asumimos una red fija. Antes
  // acá se miraba SOLO `DEFAULT_CHAIN_ID`, por lo que un vendedor que
  // depositaba en otra red veía "saldo insuficiente" aunque tuviera fondos.
  // Recorremos todas las redes y elegimos la que tenga saldo libre suficiente.
  //   - Detecta si el vendedor depositó desde OTRA wallet distinta a la que
  //     quedó asociada a su cuenta (caso frecuente con Privy / varias wallets).
  //   - Devuelve un mensaje claro con el monto faltante y sugiere revisar la
  //     wallet correcta, en vez del genérico "Revisá que hayas depositado".
  // ─────────────────────────────────────────────────────────────
  const multiChainInfo = await getVendorCollateralMultiChain(
    seller.walletAddress,
  );
  const bestChain =
    multiChainInfo.success && multiChainInfo.bestChain != null
      ? multiChainInfo.bestChain
      : DEFAULT_CHAIN_ID;
  const availableOnChain =
    multiChainInfo.success && multiChainInfo.bestChain != null
      ? multiChainInfo.bestAvailable
      : 0;
  // Free total sumando TODAS las redes (para el mensaje de error).
  const totalAcrossChains = multiChainInfo.success
    ? multiChainInfo.totalAvailable
    : 0;

  if (availableOnChain < amountToLock) {
    // Revertimos el "fulfilled" para que el hold siga esperando.
    await Order.findByIdAndUpdate(order._id, {
      $set: { "collateralHold.status": "pending" },
    });
    return {
      success: false,
      retryable: true,
      insufficientFunds: true,
      error: multiChainInfo.success
        ? `No se detectó saldo suficiente en tu garantía. Necesitás US$ ${amountToLock.toFixed(2)} congelables y tu billetera registrada tiene US$ ${totalAcrossChains.toFixed(2)} disponibles (en todas las redes). Verificá que hayas depositado el USDT en la MISMA billetera asociada a tu cuenta y reintentá.`
        : "No se pudo leer tu saldo de garantía on-chain. Reintentá en unos segundos.",
    };
  }

  // Congelamos en la MISMA red donde detectamos el saldo libre suficiente.
  const chainId = bestChain;

  const blockchainResult = await lockVendorCollateral(
    order._id.toString(),
    seller.walletAddress,
    amountToLock,
    chainId,
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
  // Persistimos la red donde quedó el lock para que release/cancel/dispute
  // operen sobre la MISMA chain (evita "saldo congelado fantasma").
  order.collateralChainId = chainId;
  order.collateralHold.status = "fulfilled";
  order.collateralHold.fulfilledAt = new Date();

  // Al activar la orden (colateral on-chain congelado) el comprador recién ahora
  // tiene a la vista los datos bancarios para transferir. Le damos el plazo de
  // pago completo desde acá (15 min) — evita expirar por el tiempo consumido en
  // la espera de colateral y ayuda contra la triangulación de cuentas.
  order.expiresAt = new Date(Date.now() + 15 * 60 * 1000);

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
  // El documento puede llegar con seller/buyer POPULADOS (objetos) desde
  // getOrderById/getMyOrders, o como ObjectId crudo desde el cron. Normalizamos
  // a ObjectId para que findById/notificaciones funcionen en ambos casos.
  const sellerId = order.seller?._id || order.seller;
  const buyerId = order.buyer?._id || order.buyer;

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
    await User.findByIdAndUpdate(sellerId, {
      $inc: { "accounting.expiredCollateralHolds": 1 },
    });
  }

  // LIBERAR la reserva de recompensas: la orden venció sin completarse, así que
  // el saldo que el comprador había reservado al crear la orden vuelve a
  // "disponible". Dynamic import para evitar un ciclo de imports con el
  // controller (orderController → collateralHoldService → orderController).
  try {
    const { releaseOrderRewardsReservation } = await import(
      "../controllers/orderController.js"
    );
    await releaseOrderRewardsReservation(order, {
      reason: "hold de colateral expirado",
    });
  } catch (rewardsErr) {
    console.error(
      `[expireCollateralHold] No se pudo liberar reserva de recompensas de la orden ${order?._id}:`,
      rewardsErr?.message || rewardsErr,
    );
  }

  // Avisamos al COMPRADOR que la espera terminó (la orden venció sin depósito).
  // Sin esta notificación el comprador quedaba viendo "En espera de garantía"
  // sin saber que el plazo ya había vencido.
  const shortId = order._id.toString().slice(-6).toUpperCase();
  createNotification({
    recipient: buyerId,
    type: "order_expired",
    title: "La espera de garantía venció",
    message: `El vendedor no depositó la garantía a tiempo y la orden #${shortId} expiró. Podés buscar este producto en otro vendedor.`,
    data: { orderId: order._id },
  }).catch((err) => console.error("Falló notif de expiración al comprador:", err));

  // Email opcional al comprador (reusa el template de cancelación, sin reembolso).
  try {
    const buyer = await User.findById(buyerId);
    if (buyer?.email) {
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    }
  } catch (mailErr) {
    console.error("Falló email de expiración al comprador:", mailErr?.message || mailErr);
  }

  return { success: true, order };
}

/**
 * EXPIRACIÓN "LAZY": expira un hold vencido si corresponde, en el momento en
 * que se consulta la orden (lectura). Idempotente y silenciosa: si el hold ya
 * fue resuelto, expirado o no está vencido, no hace nada.
 *
 * Sirve como red de seguridad para que el estado se corrija aunque el cron
 * (ENABLE_ORDER_CLEANUP_CRON) no esté corriendo (p. ej. en dev o si el server
 * de cron está caído). Devuelve true si efectivamente expiró la orden.
 *
 * @param {import("mongoose").Document} order Documento de orden (se mutará si expira).
 * @returns {Promise<boolean>}
 */
export async function expireCollateralHoldIfDue(order) {
  try {
    if (
      !order ||
      order.status !== "awaiting_collateral" ||
      order.collateralHold?.status !== "pending" ||
      !order.collateralHold?.expiresAt ||
      new Date(order.collateralHold.expiresAt) >= new Date()
    ) {
      return false;
    }
    await expireCollateralHold(order);
    return true;
  } catch (err) {
    console.error(
      `[expireCollateralHoldIfDue] Falló para la orden ${order?._id}:`,
      err?.message || err,
    );
    return false;
  }
}
