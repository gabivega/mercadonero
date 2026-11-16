// backend/src/services/poolHelpers.js
//
// HELPERS COMPARTIDOS de Compra Grupal (pools).
//
// ¿Por qué existe este archivo?
//   `priceForBuyers` y `notifyVendorPoolActivity` vivían privados dentro de
//   `poolController.js`. `groupBuyOrderController.js` los usaba (en
//   materializeGroupBuyOrder) SIN importarlos → ReferenceError en runtime.
//   Como esa llamada ocurre dentro de confirmEscrowFunding con catch que solo
//   loguea, el error quedaba "silenciado": el comprador fondeaba on-chain, la
//   orden se marcaba 'paid' y el Pool NUNCA se creaba (nadie aparecía en el
//   grupo). Centralizarlos acá evita el import circular
//   poolController ⇄ groupBuyOrderController y el bug.
//
// ⚠️ SI CAMBIÁS LA LÓGICA DE TIERS, hacelo ACÁ. poolController y
//    groupBuyOrderController la consumen desde este módulo.

import User from "../models/User.js";
import { createNotification } from "./notificationService.js";
import { sendPoolActivityToVendor } from "./sendEmail.js";

/**
 * Precio unitario (ARS) para un pool según la cantidad de PERSONAS
 * (compradores). Usa los tiers del producto; si no hay tier exacto para esa
 * cantidad, cae al mayor tier definido <= buyersCount; si tampoco hay, al
 * precio base.
 *
 * @param {Object} tiers       product.socialSelling.tiers (ej: {2: 900, 5: 800})
 * @param {number} buyersCount cantidad de compradores
 * @param {number} basePrice   precio base del producto (ARS)
 * @returns {number}           precio unitario en ARS
 */
export const priceForBuyers = (tiers, buyersCount, basePrice) => {
  if (tiers && tiers[buyersCount] != null) return Number(tiers[buyersCount]);
  // Si no hay tier exacto, probamos el mayor tier definido <= buyersCount.
  if (tiers) {
    const keys = Object.keys(tiers)
      .map((k) => Number(k))
      .filter((k) => Number.isFinite(k) && k <= buyersCount)
      .sort((a, b) => b - a);
    if (keys.length > 0) return Number(tiers[keys[0]]);
  }
  return Number(basePrice) || 0;
};

/**
 * Avisa al vendedor (in-app + email) que hubo actividad en un grupo de compra.
 * NUNCA debe romper el flujo principal: todo va con catch silencioso.
 *
 * @param {object} opts
 * @param {object} opts.pool      Pool ya guardado (con product poblado o no)
 * @param {"created"|"joined"} opts.action
 * @param {object} opts.actorUser Usuario comprador (con firstName/lastName/username)
 */
export const notifyVendorPoolActivity = async ({ pool, action, actorUser }) => {
  try {
    const productName =
      pool.product?.name || pool.productName || "tu producto";
    const buyerName =
      [actorUser?.firstName, actorUser?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      actorUser?.username ||
      "Un comprador";

    const isCreated = action === "created";
    const verb = isCreated ? "creó" : "se sumó a";
    const buyerId = actorUser?._id || actorUser;

    // ── Notificación in-app al vendedor ──
    createNotification({
      recipient: pool.seller,
      type: isCreated ? "pool_created" : "pool_joined",
      title: isCreated
        ? "Nuevo grupo de compra"
        : "Nuevo integrante en un grupo",
      message: isCreated
        ? `${buyerName} ${verb} un grupo para "${productName}".`
        : `${buyerName} ${verb} un grupo de "${productName}".`,
      data: {
        poolId: pool._id,
        productId: pool.product?._id || pool.product,
        buyerId,
        membersCount: pool.members?.length || 0,
      },
    }).catch((err) => console.error("Falló notificación de grupo:", err));

    // ── Email al vendedor (best-effort) ──
    const vendor = await User.findById(pool.seller).select(
      "email firstName shop",
    );
    if (vendor?.email) {
      sendPoolActivityToVendor({
        vendorEmail: vendor.email,
        action,
        productName,
        buyerName,
        membersCount: pool.members?.length || 0,
        targetBuyers: pool.targetBuyers,
        currentUnitPrice: pool.currentUnitPrice,
      }).catch((err) => console.error("Falló email de grupo:", err));
    }
  } catch (error) {
    console.error("[notifyVendorPoolActivity] Error:", error);
  }
};

export default { priceForBuyers, notifyVendorPoolActivity };
