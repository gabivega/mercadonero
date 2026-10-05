// services/referralService.js
import ReferralConfig from "../models/ReferralConfig.js";
import Referral from "../models/Referral.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

/**
 * Obtiene (y crea si hace falta) el documento de configuración global de
 * referidos. Como es singleton, devolvemos el primero que exista.
 */
export async function getReferralConfig() {
  let config = await ReferralConfig.findOne({});
  if (!config) {
    try {
      config = await ReferralConfig.create({});
    } catch (e) {
      // Si ya fue creado concurrentemente, lo releemos.
      config = await ReferralConfig.findOne({});
    }
  }
  return config;
}

/**
 * Normaliza y valida el % de referido que quiere ofrecer un vendedor en un
 * producto, según los topes de la config global.
 *
 * @returns { enabled: boolean, percent: number, error?: string }
 */
export async function resolveProductReferral(rawReferral, { listingType } = {}) {
  // Solo aplica a productos de pago (los clasificados no van por colateral).
  if (listingType === "classified" || !rawReferral?.enabled) {
    return { enabled: false, percent: 0 };
  }

  const config = await getReferralConfig();
  if (!config.enabled) {
    // Referidos deshabilitados a nivel plataforma: lo tratamos como apagado.
    return { enabled: false, percent: 0 };
  }

  const percent = Number(rawReferral.percent);

  if (!Number.isFinite(percent) || percent <= 0) {
    return {
      enabled: false,
      percent: 0,
      error: "El porcentaje de referido debe ser mayor a 0.",
    };
  }

  if (percent > config.maxPercent) {
    return {
      enabled: false,
      percent: 0,
      error: `El porcentaje de referido no puede superar el ${config.maxPercent}%.`,
    };
  }

  return { enabled: true, percent: Math.round(percent * 100) / 100 };
}

/**
 * CALCULA el reparto del reward 50/50 para una orden con referidor.
 *
 * Base de cálculo: SUBTOTAL USD de la orden (productos, SIN envío). Usamos
 * `order.financials.totalUsd`, que ya refleja el precio efectivo (oferta
 * aplicada) por cantidad.
 *
 *   totalUsd    = baseUsd * (percent / 100)
 *   referrerUsd = totalUsd / 2
 *   buyerUsd    = totalUsd / 2
 *
 * Respeta el tope global `maxRewardUsdPerOrder` (si > 0).
 */
export function calculateReferralSplit(order, percent, config = {}) {
  const baseUsd = Number(order?.financials?.totalUsd) || 0;
  let totalUsd = baseUsd * (Number(percent) / 100);

  // Redondeo a 2 decimales para evitar ruido de flotantes.
  totalUsd = Math.round(totalUsd * 100) / 100;

  if (config.maxRewardUsdPerOrder > 0 && totalUsd > config.maxRewardUsdPerOrder) {
    totalUsd = config.maxRewardUsdPerOrder;
  }

  // Reparto 50/50 (el half del referidor se redondea; el del comprador se
  // deriva como diferencia para que la suma coincida exactamente).
  const referrerUsd = Math.round((totalUsd / 2) * 100) / 100;
  const buyerUsd = Math.round((totalUsd - referrerUsd) * 100) / 100;

  return { baseUsd, totalUsd, referrerUsd, buyerUsd };
}

/**
 * RESUELVE el referidor entrante al crear una orden, a partir del
 * `referrerId` que manda el front (capturado de `?ref=`).
 *
 * Devuelve el ObjectId del referidor válido, o null si no aplica. NO lanza:
 * la atribución es best-effort y NUNCA debe romper el flujo de compra.
 *
 * Reglas:
 *   - Debe venir un valor (id de usuario).
 *   - Debe existir un usuario con ese _id.
 *   - No puede ser el propio comprador (anti-auto-referido).
 *   - Debe haber EXACTAMENTE un producto con referido activo? No: la orden
 *     puede tener varios productos; tomamos el referido del PRIMER producto
 *     con referral habilitado (los pools son excluyentes con referidos).
 *
 * @returns { referrerId: ObjectId|null, percent: number }
 */
export async function resolveOrderReferrer(rawReferrerId, { buyerId, itemsSnapshot = [] } = {}) {
  try {
    if (!rawReferrerId) return { referrerId: null, percent: 0 };

    // Validamos formato de ObjectId para no romper queries.
    const isValid = /^[a-fA-F0-9]{24}$/.test(String(rawReferrerId));
    if (!isValid) return { referrerId: null, percent: 0 };

    // Anti-auto-referido.
    if (buyerId && String(rawReferrerId) === String(buyerId)) {
      return { referrerId: null, percent: 0 };
    }

    // El referidor debe existir.
    const referrer = await User.findById(rawReferrerId).select("_id");
    if (!referrer) return { referrerId: null, percent: 0 };

    // El porcentaje sale del primer producto de la orden que tenga referido
    // activo. Si la orden mezcla productos, el % del primero habilitado manda
    // (es un caso límite; normalmente una orden es de un vendedor/producto).
    const productIds = itemsSnapshot.map((it) => it.productId).filter(Boolean);
    let percent = 0;
    if (productIds.length) {
      const product = await Product.findOne({
        _id: { $in: productIds },
        "referral.enabled": true,
      }).select("referral");
      if (product?.referral?.enabled && product.referral.percent > 0) {
        percent = Number(product.referral.percent);
      }
    }

    // Si ningún producto ofrece referido, no atribuimos nada.
    if (percent <= 0) return { referrerId: null, percent: 0 };

    return { referrerId: referrer._id, percent };
  } catch (e) {
    console.error("[Referral] Error resolviendo referidor de la orden:", e.message);
    return { referrerId: null, percent: 0 };
  }
}

/**
 * ACREDITA la recompensa de referido de una orden COMPLETADA.
 *
 * Idempotente: si ya existe un Referral con `creditAccrued === true` para la
 * orden, no vuelve a acreditar. Igual que el cashback, se llama al pasar la
 * orden a "completed".
 *
 * Espera que la orden tenga `order.referral` con:
 *   { referrer, percent }  (el buyer se toma de order.buyer)
 *
 * @returns { success, applied, reason?, split? }
 */
export async function accrueReferralForOrder(order) {
  if (!order || !order.referral?.referrer) {
    return { success: false, applied: false, reason: "sin_referidor" };
  }

  // Idempotencia por orden (índice único también lo protege a nivel DB).
  const existing = await Referral.findOne({ order: order._id });
  if (existing?.creditAccrued) {
    return { success: false, applied: false, reason: "ya_acreditado" };
  }

  const config = await getReferralConfig();
  if (!config.enabled) {
    return { success: false, applied: false, reason: "referidos_deshabilitados" };
  }

  const referrerId = order.referral.referrer;
  const buyerId = order.buyer;

  // Anti-abuso: el referidor no puede ser el propio comprador.
  if (String(referrerId) === String(buyerId)) {
    return { success: false, applied: false, reason: "auto_referido" };
  }

  const [referrer, buyer] = await Promise.all([
    User.findById(referrerId),
    User.findById(buyerId),
  ]);
  if (!referrer || !buyer) {
    return { success: false, applied: false, reason: "usuario_no_encontrado" };
  }

  // Validamos el % contra los topes vigentes al momento de acreditar.
  const percent = Number(order.referral.percent) || 0;
  if (percent <= 0 || percent > config.maxPercent) {
    return { success: false, applied: false, reason: "porcentaje_invalido" };
  }

  const split = calculateReferralSplit(order, percent, config);
  if (split.totalUsd <= 0) {
    return { success: false, applied: false, reason: "monto_cero" };
  }

  const orderTag = String(order._id).slice(-6).toUpperCase();

  // Acreditamos al REFERIDOR y al COMPRADOR de forma atómica ($inc).
  await User.updateOne(
    { _id: referrer._id },
    {
      $inc: {
        "referral.balance": split.referrerUsd,
        "referral.earned": split.referrerUsd,
      },
      $push: {
        "referral.transactions": {
          type: "earned",
          amount: split.referrerUsd,
          description: `Referido por orden #${orderTag}`,
          refType: "order",
          refId: order._id,
          status: "completed",
        },
      },
    },
  );

  await User.updateOne(
    { _id: buyer._id },
    {
      $inc: {
        "referral.balance": split.buyerUsd,
        "referral.earned": split.buyerUsd,
      },
      $push: {
        "referral.transactions": {
          type: "earned",
          amount: split.buyerUsd,
          description: `Reintegro por referido en orden #${orderTag}`,
          refType: "order",
          refId: order._id,
          status: "completed",
        },
      },
    },
  );

  // Persistimos/registramos el Referral (idempotente vía upsert).
  await Referral.findOneAndUpdate(
    { order: order._id },
    {
      $set: {
        product: order.products?.[0] || null,
        buyer: buyer._id,
        referrer: referrer._id,
        percent,
        baseUsd: split.baseUsd,
        totalUsd: split.totalUsd,
        referrerUsd: split.referrerUsd,
        buyerUsd: split.buyerUsd,
        creditAccrued: true,
        status: "credited",
        creditedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  console.log(
    `[Referral] Orden ${order._id}: reward US$ ${split.totalUsd} (referidor ${split.referrerUsd} / comprador ${split.buyerUsd}).`,
  );

  // Persistimos los montos acreditados en la propia orden para poder mostrarlos
  // en la ficha (OrderDetail) sin consultar la colección Referral. No hace falta
  // bloquear la orden: es un update acotado del subdoc `referral`.
  try {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "referral.totalUsd": split.totalUsd,
          "referral.referrerUsd": split.referrerUsd,
          "referral.buyerUsd": split.buyerUsd,
          "referral.creditAccrued": true,
        },
      },
    );
  } catch (e) {
    console.error("[Referral] No se pudieron guardar los montos en la orden:", e.message);
  }

  return { success: true, applied: true, split };
}

/**
 * RETIRA saldo de referidos fuera de la plataforma (extracción a la wallet).
 *
 * Espejo de `withdrawCashback`: descuenta el saldo de forma ATÓMICA al
 * instante (sin aprobación manual), respetando:
 *   - `allowWithdraw` de la config global (el admin puede cortarlo sin
 *     desactivar todo el programa de referidos).
 *   - `minWithdrawalUsd` (umbral mínimo de retiro).
 *   - Saldo suficiente del usuario.
 *
 * El depósito on-chain a la wallet del usuario se resuelve aparte; acá solo
 * registramos la operación y actualizamos los saldos off-chain.
 *
 * @returns { success, applied?, error? }
 */
export async function withdrawReferral(user, amountUsd, refId = null) {
  const config = await getReferralConfig();

  // El retiro solo tiene sentido si el programa está activo y permitido.
  if (!config.enabled) {
    return { success: false, error: "El programa de referidos está deshabilitado." };
  }
  if (!config.allowWithdraw) {
    return { success: false, error: "La extracción de referidos está deshabilitada." };
  }

  const amount = Number(amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Monto inválido." };
  }
  if (amount < config.minWithdrawalUsd) {
    return {
      success: false,
      error: `El monto mínimo de retiro es US$ ${config.minWithdrawalUsd}.`,
    };
  }
  if (Number(user.referral?.balance) < amount) {
    return { success: false, error: "Saldo de referidos insuficiente." };
  }

  const rounded = Math.round(amount * 100) / 100;

  await User.updateOne(
    { _id: user._id },
    {
      $inc: {
        "referral.balance": -rounded,
        "referral.withdrawn": rounded,
      },
      $push: {
        "referral.transactions": {
          type: "withdrawn",
          amount: -rounded,
          description: "Retiro de referidos fuera de la plataforma",
          refType: "withdrawal",
          refId,
          status: "completed",
        },
      },
    },
  );

  return { success: true, applied: rounded };
}
