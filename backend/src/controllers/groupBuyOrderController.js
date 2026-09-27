// backend/src/controllers/groupBuyOrderController.js
//
// CONTROLADOR DE ÓRDENES PARA COMPRAS GRUPALES (Social Selling).
//
// A diferencia de orderController.js (que maneja el ciclo transaccional de
// TODA la plataforma: bancaria + crypto + colateral + disputas), este
// controlador SOLO se ocupa de:
//
//   1) CREAR las órdenes individuales que nacen de un pool ya cerrado/liberado.
//      Cada member pasa a ser un comprador con su propia orden en estado 'paid'
//      (el pool ya fondeó el escrow on-chain, no hay pending_payment ni colateral).
//
//   2) SINCRONIZAR (idempotente) todas las órdenes de un pool tras el release
//      on-chain, creando una orden por member y llevando un log de resultados.
//
// IMPORTANTE: la orden creada acá se integra SIN PROBLEMA con el `updateOrder`
// existente en orderController.js (confirmación de recepción, envío, disputas,
// cancelación). Los únicos dos guards en updateOrder son:
//   - No volver a descontar stock si `order.groupBuy.stockConsumed === true`.
//   - No re-liberar el escrow si `order.payment.groupBuy === true`.

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Pool from "../models/Pool.js";
import { createNotification } from "../services/notificationService.js";

/**
 * Crea UNA orden individual en estado 'paid' para un member de un pool
 * que ya fue cerrado y liberado on-chain.
 *
 * Características:
 *   - Nace 'paid' (el pool ya fondeó el escrow): no pasa por pending_payment.
 *   - NO toca el colateral del vendedor.
 *   - Idempotente por (pool._id, member._id): si ya existe, la devuelve.
 *   - Consume stock + reservedStock + sold en la MISMA operación atómica.
 *
 * @param {Object} args
 * @param {import("mongoose").Document} args.pool    Pool ya hidratado (con members)
 * @param {Object} args.member                       member del pool (subdoc)
 * @param {import("mongoose").Document} args.product Producto del pool
 * @returns {Promise<import("mongoose").Document>}   Orden creada (o existente)
 */
export const createPaidOrderForPoolMember = async ({ pool, member, product }) => {
  // ── 0. Idempotencia: ¿ya existe orden para (pool, member)? ───────
  // Usamos member._id si existe; si no (pools viejos sin subdoc _id),
  // caemos al userId, que dentro de un pool es único.
  const memberKey = member._id || `user:${member.user}`;
  const existingQuery = member._id
    ? { "groupBuy.poolId": pool._id, "groupBuy.memberId": member._id }
    : { "groupBuy.poolId": pool._id, "groupBuy.chainGroupId": pool.chainGroupId, buyer: member.user };
  const existing = await Order.findOne(existingQuery);
  if (existing) {
    console.log(
      `[GroupBuy] Orden ya existía para member ${memberKey} del pool ${pool._id}. Skip.`,
    );
    return existing;
  }

  const units = Number(member.units || 1);
  if (units < 1) throw new Error("GROUP_BUY_INVALID_UNITS");

  // ── 1. Validación de stock (defensa en profundidad) ──────────────
  const freshProduct = await Product.findById(product._id);
  if (!freshProduct) throw new Error("PRODUCT_NOT_FOUND");
  if ((freshProduct.stock ?? 0) < units) {
    throw new Error("STOCK_INSUFFICIENT");
  }

  // ── 2. Precio efectivo (respeta sale activa igual que el flujo normal) ──
  let effectivePrice = freshProduct.price;
  if (freshProduct.sale?.active && freshProduct.sale?.price > 0) {
    effectivePrice = freshProduct.sale.price;
  }
  // Si el pool ya fijó un precio final unitario, lo preferimos (fue el
  // negociado por el grupo al cerrarse).
  if (pool.finalUnitPriceUsd > 0) {
    effectivePrice = pool.finalUnitPriceUsd;
  }

  const totalAmount = effectivePrice * units;

  // ── 3. Envío ──────────────────────────────────────────────────────
  const shippingCost = freshProduct.shipping?.free
    ? 0
    : freshProduct.shipping?.cost || 0;

  // ── 4. Crear la orden 'paid' ─────────────────────────────────────
  const order = new Order({
    buyer: member.user,
    seller: freshProduct.seller,
    products: [freshProduct._id],
    itemsSnapshot: [
      {
        productId: freshProduct._id,
        quantity: units,
        title: freshProduct.name,
        description: freshProduct.description,
        price: effectivePrice,
        currency: freshProduct.currency,
        condition: freshProduct.condition,
        shipping: freshProduct.shipping,
        images: (freshProduct.images || []).map((img) => img.url),
        category: freshProduct.category,
        subCategory: freshProduct.subCategory,
        brand: freshProduct.brand,
        specifications: freshProduct.specifications,
      },
    ],
    shippingAddress: member.shippingAddress || pool.shippingAddress || {},
    totalAmount: totalAmount + shippingCost,
    productsAmount: totalAmount,
    shippingAmount: shippingCost,
    status: "paid", // ← nace pagada (el pool ya fondeó el escrow)
    paymentVerifiedAt: new Date(),
    payment: {
      method: "crypto",
      token: "USDT",
      status: "funded", // el pool ya lo fondeó on-chain; el release lo cierra
      groupBuy: true,   // ← guard para NO re-liberar escrow en updateOrder
    },
    groupBuy: {
      poolId: pool._id,
      // memberId puede faltar en pools creados antes de habilitar el subdoc
      // _id. Guardamos null en ese caso (no rompemos el schema).
      memberId: member._id || null,
      chainGroupId: pool.chainGroupId,
      units,
      unitPriceUsd: effectivePrice,
      stockConsumed: false, // se pone true tras descontar stock (abajo)
    },
    isGroupBuy: true,
    statusHistory: [
      {
        status: "paid",
        changedAt: new Date(),
        comment:
          "Orden creada por compra grupal: el pool fondeó el escrow on-chain y el grupo se cerró.",
      },
    ],
    // Las órdenes de grupo no expiran por falta de pago (ya está paga).
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });

  // ── 5. Descontar stock + reservedStock + sold en una operación atómica ──
  //     El `stock: { $gte: units }` actúa como árbitro de concurrencia en Mongo.
  const stockUpdate = await Product.updateOne(
    { _id: freshProduct._id, stock: { $gte: units } },
    { $inc: { stock: -units, reservedStock: -units, sold: units } },
  );
  if (stockUpdate.modifiedCount === 0) {
    throw new Error("STOCK_INSUFFICIENT");
  }

  // Marcamos que el stock ya fue consumido por el grupo (updateOrder no lo
  // vuelve a descontar al completarse).
  order.groupBuy.stockConsumed = true;

  await order.save();

  // ── 6. Notificación in-app al comprador ───────────────────────────
  createNotification({
    recipient: member.user,
    type: "order_created",
    title: "¡Tu compra grupal se concretó!",
    message: `El grupo se llenó y se liberaron los fondos. Ya tenés la orden #${order._id
      .toString()
      .slice(-6)
      .toUpperCase()} en estado pagado.`,
    data: { orderId: order._id, totalAmount: order.totalAmount },
  }).catch((err) =>
    console.error("[GroupBuy] Falló notificación al comprador:", err),
  );

  return order;
};

/**
 * Sincroniza TODAS las órdenes de los members de un pool tras el release
 * on-chain. Crea una orden 'paid' por member y registra el resultado.
 *
 * Idempotente: usa un "claim" atómico sobre `pool.orderSyncStatus`. Si el pool
 * ya fue sincronizado ("done"), devuelve ALREADY_SYNCED. Los estados "partial"
 * permiten reintentos.
 *
 * @param {string} poolId
 * @returns {Promise<Object>} { success, status, ordersCreated, log, reason? }
 */
export const syncPoolOrdersAfterRelease = async (poolId) => {
  // ── 1. Claim atómico del sync (evita doble ejecución) ────────────
  const pool = await Pool.findOneAndUpdate(
    {
      _id: poolId,
      orderSyncStatus: { $in: ["pending", "partial", "failed"] },
    },
    { $set: { orderSyncStatus: "running", orderSyncStartedAt: new Date() } },
    { new: true },
  );

  if (!pool) {
    const current = await Pool.findById(poolId);
    if (!current) {
      return { success: false, reason: "POOL_NOT_FOUND" };
    }
    // Ya estaba "running" o "done".
    return {
      success: current.orderSyncStatus === "done",
      reason: "ALREADY_SYNCED",
      status: current.orderSyncStatus,
      pool: current,
    };
  }

  const product = await Product.findById(pool.product);
  if (!product) {
    await Pool.updateOne(
      { _id: poolId },
      { $set: { orderSyncStatus: "failed", orderSyncError: "PRODUCT_NOT_FOUND" } },
    );
    return { success: false, reason: "PRODUCT_NOT_FOUND" };
  }

  const createdOrders = [];
  const log = [];

  // ── 2. Crear orden por cada member (aislado, tolerante a fallos) ─
  for (const member of pool.members) {
    try {
      const order = await createPaidOrderForPoolMember({
        pool,
        member,
        product,
      });
      createdOrders.push(order._id);
      log.push({
        memberId: member._id || null,
        orderId: order._id,
        ok: true,
        at: new Date(),
      });
    } catch (err) {
      console.error(
        `[GroupBuy] Fallo creando orden para member ${member._id || member.user}:`,
        err.message,
      );
      log.push({
        memberId: member._id || null,
        ok: false,
        error: err.message,
        at: new Date(),
      });
    }
  }

  // ── 3. Determinar estado final ───────────────────────────────────
  const allOk = log.length > 0 && log.every((l) => l.ok);
  const someOk = log.some((l) => l.ok);
  const finalStatus = allOk ? "done" : someOk ? "partial" : "failed";

  await Pool.updateOne(
    { _id: poolId },
    {
      $set: {
        orderSyncStatus: finalStatus,
        orderSyncFinishedAt: new Date(),
      },
      $push: { orderSyncLog: { $each: log } },
    },
  );

  return {
    success: allOk,
    status: finalStatus,
    ordersCreated: createdOrders,
    log,
  };
};

export default {
  createPaidOrderForPoolMember,
  syncPoolOrdersAfterRelease,
};
