// backend/src/controllers/groupBuyOrderController.js
//
// ÓRDENES PARA COMPRAS GRUPALES (Social Selling) — ESCROW VÍA NEROESCROW.
//
// Cambio de modelo (Opción A):
//   Cada member del grupo crea/fondea SU PROPIA orden crypto en el NeroEscrow
//   común (el mismo de las compras individuales). NO hay contrato de grupo
//   (NeroGroupBuy) en este flujo.
//
//   Flujo:
//     1) createPool / joinPool  → createPendingOrderForPoolMember()
//        (orden nacida 'pending_payment' / payment.status 'funding').
//     2) El comprador fondea con el MISMO modal de las compras individuales
//        (endpoints /api/order/:id/escrow/prepare-funding y /escrow/fund).
//     3) closePool (admin) → finalizePoolOrdersFinalPrice()
//        fija el precio final escalonado en cada orden y deja listo el settle.
//     4) Al confirmar recepción → adminCompleteOrder hace
//        settleOrderEscrow() con el reintegro (lockedUsd - precioFinal*units).
//
// La orden es EXACTAMENTE una orden crypto normal; los guards en updateOrder
// son:
//   - No volver a descontar stock si `order.groupBuy.stockConsumed === true`.
//   - No liberar escrow por fuera del settle si `order.payment.groupBuy === true`.

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Pool from "../models/Pool.js";
import User from "../models/User.js";
// Helpers compartidos con poolController (antes vivían privados en
// poolController y acá se usaban SIN importarlos → ReferenceError en
// materializeGroupBuyOrder que, silenciado por el catch de confirmEscrowFunding,
// dejaba el Pool sin crear cuando el comprador YA había fondeado on-chain).
import {
  priceForBuyers,
  notifyVendorPoolActivity,
} from "../services/poolHelpers.js";

/**
 * Crea la orden crypto PROVISIONAL de un member del grupo.
 *
 * - Nace 'pending_payment' / payment.status 'funding' (aún NO fondeada).
 * - NO descuenta stock (se reserva recién al confirmar el fondeo on-chain).
 * - Idempotente por (pool._id, member._id): si ya existe, la devuelve.
 * - Guarda la metadata de grupo (poolId/memberId/units/lockedUsd) para que el
 *   cierre fije el precio final y el settle calcule el reintegro escalonado.
 *
 * @param {Object} args
 * @param {import("mongoose").Document} args.pool     Pool hidratado
 * @param {Object} args.member                        member subdoc (con _id)
 * @param {import("mongoose").Document} args.product  Producto del pool
 * @param {number} args.chainId                       Red del escrow elegida
 * @param {number} args.lockedProductsUsd             USD de productos congelados (tier vigente)
 * @param {number} args.shippingUsd                   USD de envío
 * @param {string} [args.tokenSymbol]                 Token/red de pago (USDT/USDC/...)
 * @returns {Promise<import("mongoose").Document>}    Orden creada (o existente)
 */
export const createPendingOrderForPoolMember = async ({
  pool,
  member,
  product,
  chainId,
  lockedProductsUsd,
  shippingUsd = 0,
  tokenSymbol = "USDT",
  usdRate = 1,
}) => {
  // ── 0. Idempotencia: ¿ya existe orden para (pool, member)? ───────
  const memberKey = member._id || `user:${member.user}`;
  const existingQuery = member._id
    ? { "groupBuy.poolId": pool._id, "groupBuy.memberId": member._id }
    : { "groupBuy.poolId": pool._id, buyer: member.user, isGroupBuy: true };
  const existing = await Order.findOne(existingQuery);
  if (existing) {
    console.log(
      `[GroupBuy] Orden ya existía para member ${memberKey} del pool ${pool._id}. Skip.`,
    );
    return existing;
  }

  const units = Number(member.units || 1);
  if (units < 1) throw new Error("GROUP_BUY_INVALID_UNITS");

  const freshProduct = await Product.findById(product._id);
  if (!freshProduct) throw new Error("PRODUCT_NOT_FOUND");

  // Precio efectivo unitario (sale activa) para el snapshot del item.
  let effectivePrice = freshProduct.price;
  if (freshProduct.sale?.active && freshProduct.sale?.price > 0) {
    effectivePrice = freshProduct.sale.price;
  }

  const lockedProducts = Number(lockedProductsUsd) || 0;
  const shipping = Number(shippingUsd) || 0;
  const totalUsd = Number((lockedProducts + shipping).toFixed(2));

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
    totalAmount: totalUsd,
    productsAmount: lockedProducts,
    shippingAmount: shipping,
    status: "pending_payment",
    // Las órdenes de grupo NO expiran por falta de pago (compromiso inmediato).
    expiresAt: null,
    financials: {
      // ⚠️ Convención del flujo individual: totalUsd = SOLO productos;
      // shippingCostUsd = envío. El monto a fondear es la SUMA de ambos
      // (prepareEscrowFunding/confirmEscrowFunding hacen totalUsd+shipping).
      // Si mezclamos el envío en totalUsd, se contaría dos veces.
      // `usdRate` (TDC) y `sellerNetReleaseUsd` son REQUERIDOS por el schema.
      usdRate: Number(usdRate) || 1,
      totalUsd: lockedProducts,
      shippingCostUsd: shipping,
      // El fee final se recalcula al cerrar (precio escalonado). Placeholder.
      platformFeeUsd: 0,
      baseFeeUsd: 0,
      referralFeeUsd: 0,
      // Provisional: se recalcula en finalizePoolOrdersFinalPrice con el fee
      // real + reintegro escalonado. Solo evita el required del schema.
      sellerNetReleaseUsd: Number((lockedProducts + shipping).toFixed(2)),
    },
    isGroupBuy: true,
    groupBuy: {
      poolId: pool._id,
      memberId: member._id || null,
      chainGroupId: null, // no hay grupo on-chain; queda null
      units,
      unitPriceUsd: 0, // se fija al cerrar (precio final escalonado)
      lockedUsd: lockedProducts,
      refundUsd: 0, // se calcula al cerrar
      stockConsumed: false,
    },
    statusHistory: [
      {
        status: "pending_payment",
        changedAt: new Date(),
        comment:
          "Orden creada por compra grupal. Esperando el fondeo del escrow on-chain.",
      },
    ],
    payment: {
      method: "crypto",
      token: tokenSymbol,
      status: "funding",
      chainId: chainId ?? null,
      groupBuy: true, // ← guard para NO re-liberar escrow en updateOrder
      amountUsdRetained: totalUsd,
    },
  });

  await order.save();
  return order;
};

/**
 * Fija el PRECIO FINAL escalonado en todas las órdenes de un pool cerrado.
 *
 * Por cada member con orden:
 *   - unitPriceUsd = finalUnitPriceUsd
 *   - productsAmount = finalUnitPriceUsd * units  (precio final en USD)
 *   - refundUsd = max(0, lockedUsd - finalUnitPriceUsd * units)  (reintegro)
 *   - totalAmount = productsAmount + envío
 *   - financials.sellerNetUsd / platformFeeUsd a partir del fee del contrato.
 * NO mueve plata on-chain: el reintegro viaja en el `settle` al confirmar
 * recepción (adminCompleteOrder). Idempotente.
 *
 * @param {Object} args
 * @param {import("mongoose").Document} args.pool
 * @param {number} args.finalUnitPriceUsd
 * @param {number} [args.feeBps]   fee del contrato (puntos base). Si no llega, no recalcula fee.
 * @returns {Promise<{updated:number, orders:Array}>}
 */
export const finalizePoolOrdersFinalPrice = async ({
  pool,
  finalUnitPriceUsd,
  feeBps = 0,
}) => {
  const finalUnit = Number(finalUnitPriceUsd) || 0;
  const orders = [];
  let updated = 0;

  for (const member of pool.members) {
    // Buscamos la orden del member (por orderId o por la metadata de grupo).
    const filter = member.orderId
      ? { _id: member.orderId }
      : member._id
        ? { "groupBuy.poolId": pool._id, "groupBuy.memberId": member._id }
        : { "groupBuy.poolId": pool._id, buyer: member.user, isGroupBuy: true };

    const order = await Order.findOne(filter);
    if (!order) {
      console.warn(
        `[GroupBuy] No hay orden para member ${member._id || member.user} del pool ${pool._id}. Skip cierre.`,
      );
      continue;
    }

    const units = Number(order.groupBuy?.units || member.units || 1);
    const lockedUsd = Number(order.groupBuy?.lockedUsd || 0);
    const shipping = Number(order.shippingAmount || 0);
    const finalProductsUsd = Number((finalUnit * units).toFixed(6));
    const refundUsd = Math.max(
      0,
      Number((lockedUsd - finalProductsUsd).toFixed(6)),
    );

    order.groupBuy.unitPriceUsd = finalUnit;
    order.groupBuy.refundUsd = refundUsd;
    // Precio FINAL que realmente paga el comprador (neto del reintegro).
    order.productsAmount = finalProductsUsd;
    order.totalAmount = Number((finalProductsUsd + shipping).toFixed(2));
    // ⚠️ amountUsdRetained NO se toca: es el monto REALMENTE fondeado on-chain
    // (tier vigente al unirse + envío). El settle reparte ese total entre
    // vendedor + fee + reintegro, y debe cuadrar con lo retenido en el escrow.

    // Fee / neto del vendedor según el fee vigente del contrato.
    if (feeBps > 0) {
      const feeProductsUsd = Number(
        (finalProductsUsd * (feeBps / 10000)).toFixed(2),
      );
      order.financials.platformFeeUsd = feeProductsUsd;
      order.financials.sellerNetReleaseUsd = Number(
        (finalProductsUsd - feeProductsUsd + shipping).toFixed(2),
      );
    }

    order.statusHistory.push({
      status: order.status,
      changedAt: new Date(),
      comment: `Precio final del grupo fijado: US$ ${finalUnit.toFixed(2)}/u. Reintegro a favor: US$ ${refundUsd.toFixed(2)}.`,
    });

    await order.save();
    orders.push(order);
    updated += 1;
  }

  return { updated, orders };
};

/**
 * MATERIALIZA el grupo cuando la orden crypto YA está fondeada on-chain.
 *
 * Corazón del flujo "pago primero, grupo después": el Pool NO existe hasta que
 * hay un pago verificado. Se llama desde confirmEscrowFunding(order, fundTxHash)
 * justo después de marcar la orden como 'paid'.
 *
 *   - groupBuy.createPoolProductId → crea el Pool con el buyer como creador y
 *     primer member "locked", y notifica al vendedor.
 *   - groupBuy.joinPoolId → suma al buyer como member "locked", recalcula el
 *     precio actual (tier por nº de fondeados) y notifica.
 *
 * Idempotente: si el member ya existe, no duplica. NO lanza si algo falta:
 * el fondeo ya ocurrió on-chain; sólo loguea.
 *
 * @param {import("mongoose").Document} order  Orden de grupo ya 'paid'.
 * @param {string} fundTxHash                  Hash del fondeo on-chain.
 * @returns {Promise<{pool: object|null, member: object|null}>}
 */
export const materializeGroupBuyOrder = async (order, fundTxHash = "") => {
  const gb = order.groupBuy || {};
  const buyerId = order.buyer;

  const buyer = await User.findById(buyerId).select(
    "username firstName lastName avatar walletAddress",
  );
  const units = Number(gb.units || 1);

  // ── CASO CREACIÓN ───────────────────────────────────────────────
  if (gb.createPoolProductId) {
    // Idempotencia: ya materializado.
    if (gb.poolId) {
      const existing = await Pool.findById(gb.poolId);
      if (existing) return { pool: existing, member: null };
    }

    const product = await Product.findById(gb.createPoolProductId);
    if (!product) {
      console.warn(`[GroupBuy] Producto inexistente ${gb.createPoolProductId}.`);
      return { pool: null, member: null };
    }

    const ss = product.socialSelling || {};
    const tiers = ss.tiers || {};
    const targetBuyers = 5;
    const basePrice = product.sale?.active ? product.sale.price : product.price;
    const duration = ss.durationHours || 24;

    const pool = new Pool({
      product: product._id,
      seller: product.seller,
      creator: buyerId,
      members: [
        {
          user: buyerId,
          username: buyer?.username || buyer?.firstName || "vos",
          avatar: buyer?.avatar || "",
          joinedAt: new Date(),
          units,
          wallet: buyer?.walletAddress || "",
          escrowStatus: "locked",
          orderId: order._id,
          txHash: fundTxHash,
          fundedAt: new Date(),
        },
      ],
      targetBuyers,
      expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
      status: "open",
      baseUnitPrice: Number(basePrice) || 0,
      currentUnitPrice: Number(basePrice) || 0,
      targetUnitPrice: priceForBuyers(tiers, targetBuyers, basePrice),
      chainGroupId: null,
      escrowAddress: order.payment?.escrowTokenAddress || "",
      reservedUnits: units,
      rateAtLock: order.financials?.usdRate || 0,
    });

    const saved = await pool.save();

    // Vincular la orden con el pool/member recién creado.
    order.groupBuy.poolId = saved._id;
    order.groupBuy.memberId = saved.members[0]._id;
    order.groupBuy.stockConsumed = false;
    order.groupBuy.createPoolProductId = null; // intención consumida
    await order.save();

    notifyVendorPoolActivity({
      pool: { ...saved.toObject(), productName: product.name, product: product._id },
      action: "created",
      actorUser: buyer,
    });

    return { pool: saved, member: saved.members[0] };
  }

  // ── CASO UNIÓN ──────────────────────────────────────────────────
  if (gb.joinPoolId) {
    const pool = await Pool.findById(gb.joinPoolId).populate("product");
    if (!pool) {
      console.warn(`[GroupBuy] Pool inexistente ${gb.joinPoolId}.`);
      return { pool: null, member: null };
    }

    // Idempotencia: ¿ya está este buyer?
    const already = pool.members.find(
      (m) => String(m.user) === String(buyerId),
    );
    if (already) {
      order.groupBuy.poolId = pool._id;
      order.groupBuy.memberId = already._id;
      order.groupBuy.joinPoolId = null;
      await order.save();
      return { pool, member: already };
    }

    pool.members.push({
      user: buyerId,
      username: buyer?.username || buyer?.firstName || "vos",
      avatar: buyer?.avatar || "",
      joinedAt: new Date(),
      units,
      wallet: buyer?.walletAddress || "",
      escrowStatus: "locked",
      orderId: order._id,
      txHash: fundTxHash,
      fundedAt: new Date(),
    });

    // Precio actual = tier según nº de members FONDEADOS (locked/released).
    const fundedCount = pool.members.filter(
      (m) => m.escrowStatus === "locked" || m.escrowStatus === "released",
    ).length;
    const tiers = pool.product?.socialSelling?.tiers || {};
    pool.currentUnitPrice = priceForBuyers(
      tiers,
      fundedCount,
      pool.baseUnitPrice,
    );

    if (pool.members.length >= pool.targetBuyers) {
      pool.status = "filled";
      pool.filledAt = pool.filledAt || new Date();
    }

    const saved = await pool.save();
    const newMember = saved.members[saved.members.length - 1];

    order.groupBuy.poolId = saved._id;
    order.groupBuy.memberId = newMember._id;
    order.groupBuy.joinPoolId = null; // intención consumida
    await order.save();


    // ── CIERRE AUTOMÁTICO AL LLENARSE EL GRUPO ────────────────────────
    // Al entrar el comprador que completa `targetBuyers` (5), el grupo se
    // cierra SOLO: se fija el precio final escalonado en TODAS las órdenes y
    // cada una pasa de "group_funded" a "paid" (recién ahí es una venta real).
    //
    // El reintegro (lockedUsd - precioFinal*units) NO se ejecuta acá: queda
    // calculado en order.groupBuy.refundUsd y viaja on-chain en el settle del
    // escrow al confirmar recepción (adminCompleteOrder). Reinicio on-chain,
    // nunca saldo interno: evita custodia y abusos.
    //
    // Best-effort: si algo falla, el pool queda "filled" y el admin puede
    // cerrarlo a mano con closePool (misma lógica, mismo resultado).
    if (saved.status === "filled" && !saved.closedAt) {
      try {
        // finalUnit = tier del total de compradores (ya calculado arriba).
        const finalUnitPriceUsd =
          priceForBuyers(
            saved.product?.socialSelling?.tiers || {},
            saved.members.length,
            saved.baseUnitPrice,
          ) || saved.currentUnitPrice || saved.baseUnitPrice || 0;

        const fin = await finalizePoolOrdersFinalPrice({
          pool: saved,
          finalUnitPriceUsd,
          feeBps: 0, // el fee real se recalcula en el settle/closePool
        });

        for (const o of fin.orders) {
          if (o.status === "group_funded") {
            o.status = "paid";
            o.statusHistory.push({
              status: "paid",
              changedAt: new Date(),
              comment: `Grupo completo (${saved.members.length}/${saved.targetBuyers}). Precio final US$ ${Number(finalUnitPriceUsd).toFixed(2)}/u. Orden confirmada como venta.`,
            });
            await o.save();
          }
        }

        saved.closedAt = new Date();
        saved.finalUnitPriceUsd = finalUnitPriceUsd;
        await saved.save();
        console.log(
          `[GroupBuy] Pool ${saved._id} lleno y cerrado automáticamente (${fin.updated} órdenes).`,
        );
      } catch (autoCloseErr) {
        console.error(
          "[GroupBuy] Falló el cierre automático; queda para closePool manual:",
          autoCloseErr?.message || autoCloseErr,
        );
      }
    }

    notifyVendorPoolActivity({
      pool: saved,
      action: "joined",
      actorUser: buyer,
    });

    return { pool: saved, member: newMember };
  }

  console.warn("[GroupBuy] Orden de grupo sin intención (ni crear ni unir).");
  return { pool: null, member: null };
};

/**
 * Precio unitario (ARS) del TIER VIGENTE para una orden de grupo, ANTES de
 * crearla. Se usa en createOrder para fijar el monto a fondear (= tier, no el
 * precio base del producto).
 *
 *   - createPool -> tier de 1 comprador (precio base).
 *   - joinPool   -> tier de (members fondeados actuales + 1).
 *
 * @returns {Promise<number|null>} precio unitario en ARS (o null si no aplica)
 */
export const computeGroupUnitPriceArs = async ({ groupBuy, product }) => {
  if (!groupBuy || !product) return null;
  const ss = product.socialSelling || {};
  const tiers = ss.tiers || {};
  const basePrice = product.sale?.active ? product.sale.price : product.price;

  if (groupBuy.createPool) {
    return priceForBuyers(tiers, 1, basePrice);
  }

  if (groupBuy.joinPoolId) {
    const pool = await Pool.findById(groupBuy.joinPoolId).lean();
    if (!pool) return priceForBuyers(tiers, 1, basePrice);
    const fundedCount = (pool.members || []).filter(
      (m) => m.escrowStatus === "locked" || m.escrowStatus === "released",
    ).length;
    return priceForBuyers(tiers, fundedCount + 1, pool.baseUnitPrice || basePrice);
  }

  return null;
};

export default {
  createPendingOrderForPoolMember,
  finalizePoolOrdersFinalPrice,
  materializeGroupBuyOrder,
  computeGroupUnitPriceArs,
};
