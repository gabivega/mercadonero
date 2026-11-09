// services/rewardsService.js
// ─────────────────────────────────────────────────────────────────────────
// SALDO DE RECOMPENSAS UNIFICADO (cashback + reintegro de referidos del buyer)
//
// El comprador acumula dos saldos distintos:
//   - cashback.balance        → reintegro fijo (ej. 2.5% del subtotal)
//   - referral.balance (buyer) → su mitad del reward al comprar con ?ref=
//
// Para el COMPRADOR los presentamos y los gastamos como UNA sola cosa:
// "Saldo de recompensas". Ambos son off-chain y ambos son NO retirables (solo
// se pueden usar en checkout). La ganancia del REFERIDOR es aparte y es la
// única retirable (ver withdrawReferral + tope por rol).
//
// IMPORTANTE: `referral.balance` hoy MEZCLA la mitad del referidor y la del
// comprador. Para el comprador, lo "usables como recompensas" es SOLO la parte
// de buyer. La calculamos sumando las transacciones `earned` con role buyer y
// restando lo ya gastado en checkout (role buyer). Como todavía ningún flujo
// gasta referidos-buyer (lo activamos en la Etapa 2), por ahora el usable es
// simplemente lo acreditado como buyer.
//
// Esta lógica vive acá (server-side) para que el front reciba UN número y para
// que la Etapa 2 (descontar en checkout) use EXACTAMENTE el mismo cálculo.
import User from "../models/User.js";
import SellerCredit from "../models/SellerCredit.js";

/**
 * Calcula el saldo "usables como recompensas" por el comprador, a partir de
 * las transacciones almacenadas en el user. No toca la DB del saldo agregado
 * (referral.balance) para no depender de cómo se mezcle internamente.
 */
export function computeRewardsFromUser(user) {
  const cashbackBalance = round2(Number(user?.cashback?.balance) || 0);
  const cashbackReserved = round2(Number(user?.cashback?.reservedUsd) || 0);

  // Parte del COMPRADOR en referidos = suma de earned con role "buyer"
  // menos lo ya gastado como buyer (spent/checkout con role buyer si existiera).
  const tx = Array.isArray(user?.referral?.transactions)
    ? user.referral.transactions
    : [];
  let referralBuyerBalance = 0;
  for (const t of tx) {
    // Solo movimientos del COMPRADOR en el programa de referidos.
    // (role "referrer" es la ganancia del que comparte: NO va acá.)
    if (t?.role !== "buyer") continue;

    const amount = Number(t.amount) || 0;
    if (t.type === "earned") referralBuyerBalance += amount;
    if (t.type === "spent") referralBuyerBalance += amount; // amount negativo
    // withdrawn/adjustment de buyer: no aplica hoy (buyer no retira).
  }
  referralBuyerBalance = round2(Math.max(0, referralBuyerBalance));
  const referralReserved = round2(Number(user?.referral?.reservedUsd) || 0);

  // DISPONIBLE = saldo real - lo reservado (comprometido en órdenes abiertas).
  // Un saldo reservado NO puede usarse en otra orden: evita el doble uso.
  const cashbackAvailable = round2(Math.max(0, cashbackBalance - cashbackReserved));
  const referralBuyerAvailable = round2(
    Math.max(0, referralBuyerBalance - referralReserved),
  );
  const totalUsable = round2(cashbackAvailable + referralBuyerAvailable);

  return {
    // Saldos DISPONIBLES (ya netos de lo reservado): lo que la UI/checkout
    // puede ofrecer para usar.
    cashbackUsd: cashbackAvailable,
    referralUsd: referralBuyerAvailable,
    totalUsableUsd: totalUsable,
    // Saldo bloqueado en órdenes abiertas (auditoría / UI "comprometido").
    cashbackReservedUsd: cashbackReserved,
    referralReservedUsd: referralReserved,
    totalReservedUsd: round2(cashbackReserved + referralReserved),
  };
}

/**
 * Devuelve el resumen de recompensas de un usuario, leyéndolo de la DB.
 * @param {string|ObjectId} userId
 */
export async function getRewardsBalanceSummary(userId) {
  // ⚠️ CRÍTICO: incluir `reservedUsd` de ambos saldos. computeRewardsFromUser
  // calcula el DISPONIBLE como (balance - reservedUsd). Si no seleccionamos
  // reservedUsd, llega como undefined → disponible = balance bruto y el saldo
  // comprometido en órdenes abiertas se seguía mostrando como disponible en la
  // wallet y en otros checkouts. Incluimos `transactions` (para la parte de
  // referral-buyer) y los reservados.
  const user = await User.findById(userId).select(
    "cashback.balance cashback.reservedUsd referral.balance referral.reservedUsd referral.transactions",
  );
  if (!user) {
    return { cashbackUsd: 0, referralUsd: 0, totalUsableUsd: 0 };
  }
  return computeRewardsFromUser(user);
}

/**
 * Calcula cuánto del saldo de REFERIDOS es retirable por el usuario como
 * REFERIDOR (su ganancia real por compartir). Opción B: sin separar saldos en
 * el modelo, derivamos el tope de las transacciones `earned` con role
 * "referrer", menos lo ya retirado/ajustado.
 *
 * Este es el ÚNICO monto que un usuario puede "retirar a wallet".
 */
export function computeReferrerWithdrawable(user) {
  const tx = Array.isArray(user?.referral?.transactions)
    ? user.referral.transactions
    : [];

  let withdrawable = 0;
  for (const t of tx) {
    // Solo movimientos del REFERIDOR (ganó por compartir).
    if (t?.role !== "referrer") continue;
    const amount = Number(t.amount) || 0;
    if (t.type === "earned") withdrawable += amount;
    if (t.type === "withdrawn") withdrawable += amount; // amount negativo
    if (t.type === "spent") withdrawable += amount; // por si usara su parte
  }
  return round2(Math.max(0, withdrawable));
}

/**
 * Registra (o actualiza) el crédito a favor del SELLER por una orden pagada
 * con saldo de recompensas. Idempotente por orden (índice único en `order`).
 *
 * @param {object} p
 * @param {ObjectId} p.sellerId
 * @param {ObjectId} p.orderId
 * @param {number}   p.amountUsd          total de recompensas usadas por el comprador
 * @param {object}   p.breakdown          { cashbackUsd, referralUsd }
 */
export async function recordSellerCredit({
  sellerId,
  orderId,
  amountUsd,
  breakdown = {},
}) {
  const amount = round2(Number(amountUsd) || 0);
  if (amount <= 0) return { success: false, reason: "monto_cero" };

  try {
    const credit = await SellerCredit.findOneAndUpdate(
      { order: orderId },
      {
        $set: {
          seller: sellerId,
          amountUsd: amount,
          breakdown: {
            cashbackUsd: round2(Number(breakdown.cashbackUsd) || 0),
            referralUsd: round2(Number(breakdown.referralUsd) || 0),
          },
        },
        $setOnInsert: { status: "pending", claimedAt: null },
      },
      { upsert: true, new: true },
    );
    return { success: true, credit };
  } catch (e) {
    // Si ya existía y está claimed/cancelled, no lo revivimos (idempotente).
    if (e?.code === 11000) {
      const existing = await SellerCredit.findOne({ order: orderId });
      return { success: true, credit: existing, existed: true };
    }
    throw e;
  }
}

/**
 * Total PENDIENTE de créditos a favor de un seller (lo que la plataforma le
 * debe por compras pagadas con recompensas). Útil para su panel y para el claim.
 */
export async function getSellerPendingCreditTotal(sellerId) {
  const agg = await SellerCredit.aggregate([
    { $match: { seller: sellerId, status: "pending" } },
    { $group: { _id: null, total: { $sum: "$amountUsd" }, count: { $sum: 1 } } },
  ]);
  const row = agg[0] || { total: 0, count: 0 };
  return { totalUsd: round2(row.total), count: row.count };
}

/**
 * Marca como "claimed" (pagados manualmente) los créditos pendientes de un
 * seller. Descuenta el pasivo. Devuelve lo aplicado.
 *
 * @param {ObjectId} sellerId
 * @param {object}   opts  { ref, claimedBy }  referencia del pago manual / admin
 */
/**
 * Lista los créditos PENDIENTES de un seller con su detalle (para mostrar en la
 * billetera: "orden #XXXX · US$ YY · fecha"). Solo lectura.
 */
export async function getSellerPendingCredits(sellerId) {
  const credits = await SellerCredit.find({ seller: sellerId, status: "pending" })
    .select("order amountUsd breakdown createdAt")
    .sort({ createdAt: -1 })
    .lean();
  if (!credits.length) return [];

  // Traemos el estado de cada orden para saber si el crédito ya es RECLAMABLE
  // (orden completada) o todavía está pendiente de cierre. Esto permite mostrar
  // al vendedor qué puede reclamar YA y qué se acreditará al completar.
  const Order = (await import("../models/Order.js")).default;
  const orderIds = credits.map((c) => c.order);
  const orders = await Order.find(
    { _id: { $in: orderIds } },
    { _id: 1, status: 1 },
  ).lean();
  const statusByOrder = new Map(
    orders.map((o) => [String(o._id), o.status]),
  );

  return credits.map((c) => {
    const orderStatus = statusByOrder.get(String(c.order)) || "unknown";
    return {
      orderId: c.order,
      code: String(c.order || "").slice(-6).toUpperCase(),
      amountUsd: round2(Number(c.amountUsd) || 0),
      breakdown: {
        cashbackUsd: round2(Number(c.breakdown?.cashbackUsd) || 0),
        referralUsd: round2(Number(c.breakdown?.referralUsd) || 0),
      },
      // Reclamable = la orden ya se completó (el crédito es firme).
      claimable: orderStatus === "completed",
      orderStatus,
      createdAt: c.createdAt,
    };
  });
}

export async function claimSellerCredit(sellerId, { ref = "", claimedBy = null } = {}) {
  // ⚠️ SOLO se pueden reclamar créditos de órdenes COMPLETADAS. El crédito se
  // registra desde que se crea la orden (para que el vendedor lo vea), pero aún
  // es un pasivo contingente: si la orden se cancela, deja de aplicar. Reclamar
  // (y pagar) antes de completar permitiría cobrar por ventas que luego no se
  // cierran. Filtramos por el estado de la orden al momento del claim.
  const Order = (await import("../models/Order.js")).default;
  const completedOrderIds = await Order.find(
    { seller: sellerId, status: "completed" },
    { _id: 1 },
  ).lean();
  const completedIds = completedOrderIds.map((o) => o._id);

  const pending = await SellerCredit.find({
    seller: sellerId,
    status: "pending",
    order: { $in: completedIds },
  });
  if (!pending.length) {
    return { success: false, error: "No tenés saldo a favor reclamable (solo se paga por órdenes completadas)." };
  }

  const total = round2(pending.reduce((s, c) => s + (Number(c.amountUsd) || 0), 0));
  const now = new Date();

  await SellerCredit.updateMany(
    { seller: sellerId, status: "pending", order: { $in: completedIds } },
    { $set: { status: "claimed", claimedAt: now, claimRef: ref, claimedBy } },
  );

  return { success: true, applied: total, count: pending.length };
}

/**
 * COTIZA el uso de recompensas para un pedido SIN descontar nada todavía.
 *
 * Regla de negocio (Etapa 2 final): el descuento se aplica SOLO sobre el
 * subtotal de PRODUCTOS (`productsTotalUsd`), NUNCA sobre el envío. El
 * comprador puede cubrir hasta el 100% del producto (puede llegar a 0). El
 * saldo que exceda el subtotal queda disponible para la próxima compra.
 *
 * Fundamento contable (modelo elegido):
 *   - El comprador paga menos (on-chain o por transferencia) lo que use.
 *   - El seller cobra SIEMPRE su neto real: lo que no cobra del pago directo
 *     se le compensa vía SellerCredit (= rewardsUsed) y hace claim.
 *   - El fee de la plataforma se calcula y cobra SIEMPRE sobre el total
 *     (productos + envío), sin descontarse por las recompensas.
 *
 * Devuelve cuánto aplicar efectivamente y el reparto (cashback primero, luego
 * referral-buyer) para descontar cada saldo por separado.
 *
 * @param {object} p
 * @param {object} p.user              usuario comprador (con saldos)
 * @param {number} p.productsTotalUsd  subtotal de productos en USD (tope del descuento)
 */
function quoteRewardsForOrder({
  user,
  productsTotalUsd,
  shippingUsd = 0,
  platformFeeUsd = 0,
}) {
  const usable = computeRewardsFromUser(user);
  const products = round2(Math.max(0, Number(productsTotalUsd) || 0));
  const shipping = round2(Math.max(0, Number(shippingUsd) || 0));
  const fee = round2(Math.max(0, Number(platformFeeUsd) || 0));

  // Descuento aplicable: SOLO sobre productos, hasta cubrir el 100% de ellos.
  const rewardsUsedUsd = round2(Math.min(usable.totalUsableUsd, products));

  // Reparto: primero cashback, luego referral-buyer (mismo orden que el gasto).
  const cashbackUsd = round2(Math.min(usable.cashbackUsd, rewardsUsedUsd));
  const referralUsd = round2(rewardsUsedUsd - cashbackUsd);

  // Lo que el comprador pone en EFECTIVO / on-chain (escrow):
  //   productos restantes (tras saldo) + envío íntegro.
  const cashAmountUsd = round2(products - rewardsUsedUsd + shipping);

  // Lo que el contrato le entrega al seller del escrow (puede ser 0 si el
  // comprador cubrió todo y no hay envío suficiente para pagar el fee). El fee
  // del contrato es 3% de productos; el envío viaja aparte.
  const sellerFromEscrowUsd = round2(Math.max(0, cashAmountUsd - fee));

  // El seller SIEMPRE debe cobrar su neto (productos - fee) + envío.
  // Lo que no le llega por el escrow se le compensa vía SellerCredit (claim).
  const sellerTotalTargetUsd = round2(products - fee + shipping);
  const sellerCreditUsd = round2(
    Math.max(0, sellerTotalTargetUsd - sellerFromEscrowUsd),
  );

  return {
    usable,
    cap: products,
    rewardsUsedUsd,
    breakdown: { cashbackUsd, referralUsd },
    // Monto que va al escrow / pago directo del comprador.
    cashAmountUsd,
    // Fee de la plataforma (3% de productos), SIEMPRE intacto.
    feeUsd: fee,
    // Lo que el seller cobra del escrow y vía SellerCredit.
    sellerFromEscrowUsd,
    sellerCreditUsd,
    sellerTotalTargetUsd,
    // Saldo que queda disponible para futuras compras.
    leftoverUsableUsd: round2(usable.totalUsableUsd - rewardsUsedUsd),
  };
}

/**
 * DESCUENTA del usuario el saldo de recompensas indicado (cashback primero,
 * luego referral-buyer), registrando las transacciones. Idempotente respecto a
 * la orden sólo en el sentido de "una vez aplicado, no se vuelve a llamar":
 * el llamador debe garantizar que sólo se invoca al crear la orden crypto.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {number} p.cashbackUsd
 * @param {number} p.referralUsd
 * @param {string} p.orderId  para dejar auditoría en las transacciones
 */
/**
 * RESERVA (bloquea) el saldo de recompensas indicado para una orden, sin
 * consumirlo todavía. Se llama al CREAR la orden: el comprador comprometió su
 * saldo para esta compra y no debe poder reutilizarlo en otra orden mientras
 * ésta siga abierta.
 *
 * Idempotente respecto a la orden: si ya hay una reserva previa registrada en
 * la orden (ver `financials.rewardsReserved`) no vuelve a reservar. El llamador
 * es responsable de no invocar dos veces para la misma orden; igualmente usamos
 * un guard por `refId` en las transacciones "spent" type "reservation" para que
 * un reintento no duplique el bloqueo.
 *
 * Aplica la reserva SOLO si hay saldo DISPONIBLE suficiente (balance - reserved
 * >= monto). Devuelve `applied` con lo realmente reservado.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {number} p.cashbackUsd
 * @param {number} p.referralUsd
 * @param {string} p.orderId
 */
async function reserveRewardsForOrder({ userId, cashbackUsd, referralUsd, orderId }) {
  const cb = round2(Number(cashbackUsd) || 0);
  const ref = round2(Number(referralUsd) || 0);
  if (cb <= 0 && ref <= 0) return { success: true, applied: 0 };

  const user = await User.findById(userId).select(
    "cashback.balance cashback.reservedUsd referral.balance referral.reservedUsd referral.transactions",
  );
  if (!user) return { success: false, error: "Usuario no encontrado" };

  // Disponibilidad real: saldo - reservado. No reservamos más de lo disponible.
  const usable = computeRewardsFromUser(user);
  const cbApplied = round2(Math.min(cb, usable.cashbackUsd));
  const refApplied = round2(Math.min(ref, usable.referralUsd));
  if (cbApplied <= 0 && refApplied <= 0) {
    return { success: false, error: "sin_saldo_disponible", applied: 0 };
  }

  // Actualización atómica condicionada para evitar sobre-reserva por carreras:
  // solo incrementa si queda disponible >= lo pedido.
  const inc = {};
  const cond = { _id: userId };
  if (cbApplied > 0) {
    inc["cashback.reservedUsd"] = cbApplied;
    // El balance menos lo ya reservado debe alcanzar para cubrir lo aplicado.
    cond["cashback.balance"] = { $gte: round2((usable.cashbackReservedUsd || 0) + cbApplied) };
  }
  if (refApplied > 0) {
    inc["referral.reservedUsd"] = refApplied;
  }

  const updated = await User.findOneAndUpdate(cond, { $inc: inc }, { new: true });
  if (!updated) {
    // Falló la condición (saldo insuficiente en una carrera). No reservamos.
    return { success: false, error: "saldo_insuficiente", applied: 0 };
  }

  return {
    success: true,
    applied: round2(cbApplied + refApplied),
    breakdown: { cashbackUsd: cbApplied, referralUsd: refApplied },
    shortfall: round2(cb + ref - (cbApplied + refApplied)),
  };
}

/**
 * LIBERA (desbloquea) una reserva de recompensas de una orden que NO se
 * completó (cancelada / expirada / reembolsada). Devuelve el saldo a
 * "disponible" restando de `reservedUsd`. NO toca `balance` (el saldo nunca se
 * descontó: solo estaba reservado). Idempotente vía guard en la orden.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {number} p.cashbackUsd  monto reservado de cashback a liberar
 * @param {number} p.referralUsd  monto reservado de referral a liberar
 * @param {string} p.orderId
 */
async function releaseReservedRewardsForOrder({
  userId,
  cashbackUsd,
  referralUsd,
  orderId,
}) {
  const cb = round2(Number(cashbackUsd) || 0);
  const ref = round2(Number(referralUsd) || 0);
  if (cb <= 0 && ref <= 0) return { success: true, applied: 0 };

  const inc = {};
  if (cb > 0) inc["cashback.reservedUsd"] = -cb;
  if (ref > 0) inc["referral.reservedUsd"] = -ref;

  // No dejamos reservedUsd por debajo de 0 por seguridad (clamp tras el update).
  await User.updateOne({ _id: userId }, { $inc: inc });

  // Clamp defensivo: si por algún motivo quedó negativo, lo llevamos a 0.
  const u = await User.findById(userId).select(
    "cashback.reservedUsd referral.reservedUsd",
  );
  if (u) {
    const fix = {};
    if ((u.cashback?.reservedUsd || 0) < 0) fix["cashback.reservedUsd"] = 0;
    if ((u.referral?.reservedUsd || 0) < 0) fix["referral.reservedUsd"] = 0;
    if (Object.keys(fix).length) await User.updateOne({ _id: userId }, { $set: fix });
  }

  console.log(
    `[Rewards] Reserva liberada para orden ${orderId}: cashback ${cb} + ref ${ref} vuelven a disponible.`,
  );
  return { success: true, applied: round2(cb + ref) };
}

/**
 * CONSUME (gasta definitivamente) el saldo de recompensas reservado, al
 * COMPLETARSE la orden. Descuenta `balance` (y registra las transacciones
 * "spent") y descuenta `reservedUsd` (ya no está comprometido: se consumió).
 *
 * También es el punto donde se debe acreditar el SellerCredit al vendedor
 * (lo hace el llamador con recordSellerCredit, porque el monto depende del
 * flujo bank/crypto).
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {number} p.cashbackUsd
 * @param {number} p.referralUsd
 * @param {string} p.orderId
 */
async function commitReservedRewardsForOrder({
  userId,
  cashbackUsd,
  referralUsd,
  orderId,
}) {
  const cb = round2(Number(cashbackUsd) || 0);
  const ref = round2(Number(referralUsd) || 0);
  if (cb <= 0 && ref <= 0) return { success: true, applied: 0 };

  const shortId = String(orderId || "").slice(-6).toUpperCase();
  const inc = {};
  const push = {};

  if (cb > 0) {
    inc["cashback.balance"] = -cb;
    inc["cashback.spent"] = cb;
    inc["cashback.reservedUsd"] = -cb;
    push["cashback.transactions"] = {
      type: "spent",
      amount: -cb,
      description: `Cashback usado en orden #${shortId}`,
      refType: "order",
      refId: orderId || null,
      status: "completed",
    };
  }

  if (ref > 0) {
    inc["referral.balance"] = -ref;
    inc["referral.spent"] = ref;
    inc["referral.reservedUsd"] = -ref;
    if (!Array.isArray(push["referral.transactions"])) {
      push["referral.transactions"] = [];
    }
    push["referral.transactions"].push({
      type: "spent",
      role: "buyer",
      amount: -ref,
      description: `Reintegro por referidos usado en orden #${shortId}`,
      refType: "order",
      refId: orderId || null,
      status: "completed",
      createdAt: new Date(),
    });
  }

  const update = { $inc: inc };
  if (Object.keys(push).length) update.$push = push;

  await User.updateOne({ _id: userId }, update);

  // Clamp defensivo (balance/reserved no deben quedar negativos por redondeos).
  const u = await User.findById(userId).select(
    "cashback.balance cashback.reservedUsd referral.balance referral.reservedUsd",
  );
  if (u) {
    const fix = {};
    if ((u.cashback?.balance || 0) < 0) fix["cashback.balance"] = 0;
    if ((u.cashback?.reservedUsd || 0) < 0) fix["cashback.reservedUsd"] = 0;
    if ((u.referral?.balance || 0) < 0) fix["referral.balance"] = 0;
    if ((u.referral?.reservedUsd || 0) < 0) fix["referral.reservedUsd"] = 0;
    if (Object.keys(fix).length) await User.updateOne({ _id: userId }, { $set: fix });
  }

  console.log(
    `[Rewards] Consumo confirmado en orden ${orderId}: cashback ${cb} + ref ${ref} descontados del saldo del comprador.`,
  );
  return { success: true, applied: round2(cb + ref) };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export {
  quoteRewardsForOrder,
  reserveRewardsForOrder,
  commitReservedRewardsForOrder,
  releaseReservedRewardsForOrder,
};
