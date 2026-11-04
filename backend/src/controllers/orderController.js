import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { calculateOrderFinancials } from "../../../frontend/src/Utils/OrderUtils.js";
import {
  lockVendorCollateral,
  releaseVendorCollateral,
  cancelVendorCollateral,
  getOrderLock,
  getVendorCollateral,
  getVendorCollateralMultiChain,
  triggerOrderDispute,
} from "../services/blockchainServices.js";
import { DEFAULT_CHAIN_ID, getChainConfig } from "../config/chains.js";
// Config del ESCROW de pagos crypto (multichain + modo de fondeo nativo). Se
// mantiene separada del registro de colateral para no mezclar conceptos.
import {
  ESCROW_DEFAULT_CHAIN_ID,
} from "../config/chains.js";


import User from "../models/User.js";
import { quoteShipment } from "../services/zipnovaService.js";
import {
    sendOrderCreatedToBuyer,
    sendOrderCreatedToVendor,
      sendPaymentConfirmedToVendor,
  sendShippingDetailsToBuyer,
  sendPickupReadyToBuyer,
  sendOrderCompletedToVendor,
  sendOrderCompletedToBuyer,
    sendRefundRequestedToVendor,
    sendOrderCancelledToBuyer,
  sendOrderCancelledToVendor,
    sendAdminCancellationRequest,
  sendVendorCollateralHoldRequested,
  sendBuyerPaymentDisputeAskProof,
  sendPaymentProofUploaded,
  sendPaymentDisputeResolvedInBuyerFavor,
    sendAdminOrderIssueReport,
    sendDisputeOpenedToBuyer,
    sendDisputeOpenedToVendor,
} from "../services/sendEmail.js";
import {
  createNotification,
} from "../services/notificationService.js";
import { accrueCashbackForOrder } from "../services/cashbackService.js";
import {
  resolveOrderReferrer,
  accrueReferralForOrder,
} from "../services/referralService.js";
import { transitionToStatus } from "../services/orderHelpers.js";
import {
  validateVendorHoldCapacity,
  resolveCollateralHold,
  expireCollateralHold,
  expireCollateralHoldIfDue,
  COLLATERAL_HOLD_CONFIG,
} from "../services/collateralHoldService.js";
// Helper centralizado de permisos admin (role en DB | email en ADMIN_EMAILS | ADMIN_PRIVY_ID).
import { isAdminUser, findAdminUser } from "../middleware/isAdmin.js";
import { makeCreateCryptoOrder } from "./orderCryptoController.js";
// Interruptor maestro del uso de recompensas en checkout (se sigue acumulando,
// pero no se gasta hasta habilitarlo). Ver config/rewards.js.
import { REWARDS_CHECKOUT_ENABLED } from "../config/rewards.js";

// ─────────────────────────────────────────────────────────────
// BUFFER DE SEGURIDAD ANTES DE LIBERAR LA GARANTÍA (FASE 1 - MANUAL)
// Cuando el comprador marca la orden como recibida, NO se libera la garantía
// ni pasa directo a "completed": pasa a "reception_confirmed" y arranca un
// período de buffer durante el cual puede reclamar (producto dañado/equivocado)
// sin que la garantía ya esté liberada. En esta etapa la liberación es 100%
// MANUAL (el admin aprieta el botón tras cumplirse el buffer). Este valor queda
// preparado para la Fase 2 (auto-release por cron) sin retrabajo.
// Configurable por env; default 24h.
// ─────────────────────────────────────────────────────────────
const RELEASE_BUFFER_HOURS = Number(process.env.RELEASE_BUFFER_HOURS || 24);

/**
 * Normaliza el PUNTO DE ENTREGA elegido por el comprador al subdocumento
 * `shippingDetails.pickupPoint` del modelo Order.
 *
 * El front (CheckoutShippingSelector) manda el punto ya normalizado por
 * `normalizePickupPoint` ({ id, name, street, streetNumber, city, state,
 * zipcode, openHours, phone }). Por robustez también aceptamos el shape crudo
 * de Zipnova ({ point_id, description, location: {...} }).
 *
 * Devuelve `undefined` si no hay punto (entrega a domicilio normal) o si el
 * snapshot quedó vacío, para no persistir basura.
 *
 * ¿Por qué lo guardamos? Para que el VENDEDOR sepa a qué sucursal despachar
 * (Correo Argentino / OCA, etc.) cuando el comprador elige RETIRAR EN SUCURSAL,
 * aunque todavía NO generemos el envío vía API de Zipnova (carga manual).
 */
const buildPickupPointSnapshot = (pickupPoint) => {
  if (!pickupPoint || typeof pickupPoint !== "object") return undefined;
  const loc = pickupPoint.location || pickupPoint.address || {};
  const pointId =
    pickupPoint.id ??
    pickupPoint.point_id ??
    (loc.street ? `${loc.street}-${loc.street_number}` : null);
  const snapshot = {
    pointId: pointId != null ? String(pointId) : null,
    name: pickupPoint.name || pickupPoint.description || "",
    street: pickupPoint.street || loc.street || "",
    streetNumber:
      pickupPoint.streetNumber ||
      loc.street_number ||
      pickupPoint.street_number ||
      "",
    city: pickupPoint.city || loc.city || "",
    state: pickupPoint.state || loc.state || "",
    zipcode: pickupPoint.zipcode || loc.zipcode || "",
    openHours:
      pickupPoint.openHours ||
      pickupPoint.open_hours ||
      pickupPoint.opening_hours ||
      "",
    phone: pickupPoint.phone || "",
  };
  // Si no hay NINGÚN dato útil, no guardamos un snapshot vacío.
  const hasData =
    snapshot.name || snapshot.street || snapshot.city || snapshot.pointId;
  return hasData ? snapshot : undefined;
};

/**
 * Construye el subdocumento `shippingDetails` a persistir en la orden a partir
 * de la metadata de la cotización (req._shippingQuoteMeta) y del punto de
 * entrega elegido por el comprador (shippingQuote.pickupPoint).
 *
 * Guardamos TODO lo que el comprador eligió (carrier, servicio, precio y punto
 * de entrega) para que el VENDEDOR pueda cargar el envío manualmente en el
 * dashboard de Zipnova. NO generamos el envío por API todavía.
 *
 * Devuelve `undefined` cuando no hay nada logístico que guardar (retiro en
 * sucursal del local, o modo "fixed"/"arrange" sin punto de entrega).
 */
const buildShippingDetails = (isPickup, shippingQuote, meta) => {
  if (isPickup) return undefined;
  const pickupPoint = buildPickupPointSnapshot(shippingQuote?.pickupPoint);

  // En modo "fixed"/"arrange" no hay cotización (meta undefined) y, si además
  // no hay punto de entrega, no hay nada logístico que persistir.
  if (!meta && !pickupPoint) return undefined;

  return {
    provider: meta?.carrierName,
    serviceName: meta?.serviceName,
    // otherProviderDetail mantenía el servicio elegido; ahora que tenemos
    // `serviceName` dedicado, lo usamos para el nombre del punto de entrega
    // (o lo dejamos undefined si no aplica).
    otherProviderDetail: pickupPoint?.name || undefined,
    quotedPrice: meta?.price != null ? Number(meta.price) : undefined,
    pickupPoint,
  };
};

// FASE 1 (refactor): handler de creación crypto (delegado a orderCryptoController).
const createCryptoOrderHandler = makeCreateCryptoOrder();

/**
 * SÍMBOLOS DE PAGO PERMITIDOS en `Order.payment.token`.
 *
 * ⚠️ DEBE coincidir EXACTAMENTE con el `enum` del subdocumento `payment.token`
 * del modelo Order (backend/src/models/Order.js). Si acá agregamos un símbolo
 * que el enum del modelo no tiene, la validación lo va a rechazar igual.
 *
 * ¿Por qué validamos acá? `payment.token` NO es un campo libre: el modelo lo
 * valida contra un enum. Si el front/env manda un símbolo fuera de la lista,
 * Mongoose lanzaba:
 *   ValidationError: `X` is not a valid enum value for path `payment.token`
 * y la orden NO se creaba. Ahora, ante un símbolo desconocido, caemos al
 * símbolo por defecto de la red (config de escrow) en vez de romper el checkout.
 *
 * ⚠️ IMPORTANTE: la lista INCLUYE "USDXM" (stable de prueba de Polygon Amoy).
 * Si nos olvidamos de agregarlo acá, `resolveOrderPaymentToken("USDXM", ...)`
 * lo descarta y cae al fallback nativo → la orden se guardaba con "POL" en vez
 * de "USDXM". El enum del modelo Order YA lo soporta (payload válido); este
 * whitelist es la ÚNICA validación de símbolos que debe alinearse con él.
 */
const ALLOWED_PAYMENT_TOKENS = [
  "USDT",
  "USDC",
  "USDXM",
  "DAI",
  "BNB",
  "POL",
  "ETH",
];

/**
 * Normaliza el símbolo de pago a un valor VÁLIDO para el enum del modelo.
 * - Si viene un símbolo permitido (case-insensitive) → lo devuelve en MAYÚSCULAS.
 * - Si viene vacío o desconocido → devuelve `escrowChain.tokenSymbol` (o "USDT").
 * - Si el fallback tampoco fuera válido (config rara) → "USDT" (último recurso).
 */
const resolveOrderPaymentToken = (token, escrowChain) => {
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

/**
 * RESERVA (bloquea) el saldo de recompensas al CREAR la orden, SIN consumirlo.
 *
 * Cambio de modelo (fix de integridad): antes acá se gastaba el saldo del
 * comprador y se acreditaba el SellerCredit al persistir la orden. Eso tenía
 * dos fallas graves:
 *   1) Si la orden fallaba/cancelaba/expiraba, el saldo YA se había consumido y
 *      no se revertía → la plata "desaparecía" de la plataforma.
 *   2) El saldo podía reutilizarse en otra orden simultánea (doble uso).
 *
 * Ahora, al crear la orden solo RESERVAMOS (reservedUsd) el saldo comprometido:
 *   - No puede usarse en otra orden (bloqueo anti-abuso).
 *   - No se descuenta del balance ni se acredita al vendedor todavía.
 * El CONSUMO real (descontar balance + SellerCredit) ocurre SOLO cuando el admin
 * completa la orden (ver commitRewardsOnComplete en adminCompleteOrder). Si la
 * orden no se completa, se libera la reserva (releaseOrderRewardsReservation).
 *
 * Persistimos en la orden cuánto quedó reservado (financials.rewardsReserved)
 * para poder liberar/consumir exactamente ese monto de forma idempotente.
 *
 * @param {Object} order           documento de orden YA guardado (con _id)
 * @param {Object|null} pendingRewards  { buyerId, sellerId, rewardsUsedUsd, breakdown }
 */
const applyPendingRewards = async (order, pendingRewards) => {
  if (!pendingRewards || !order?._id) return;
  if (Number(pendingRewards.rewardsUsedUsd) <= 0) return;
  try {
    const { reserveRewardsForOrder } = await import(
      "../services/rewardsService.js"
    );

    const res = await reserveRewardsForOrder({
      userId: pendingRewards.buyerId,
      cashbackUsd: pendingRewards.breakdown.cashbackUsd,
      referralUsd: pendingRewards.breakdown.referralUsd,
      orderId: order._id,
    });

    // Persistimos la reserva efectiva en la orden (para liberar/consumir luego).
    // Si la reserva aplicó menos de lo pedido (saldo insuficiente por carrera),
    // ajustamos también el monto efectivo a pagar para que el cuadre sea real.
    if (res.success) {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            "financials.rewardsReservedUsd": res.applied,
            "financials.rewardsReservedBreakdown": res.breakdown,
          },
        },
      );
      order.financials = order.financials || {};
      order.financials.rewardsReservedUsd = res.applied;
      order.financials.rewardsReservedBreakdown = res.breakdown;
      console.log(
        `[Rewards] Reservado US$ ${res.applied} en orden ${order._id} ` +
          `(cashback ${res.breakdown.cashbackUsd} + ref ${res.breakdown.referralUsd}). ` +
          `Se consumirá recién al completar; si no, se libera.`,
      );
    } else {
      console.error(
        `[Rewards] No se pudo reservar saldo en orden ${order._id}: ${res.error}`,
      );
    }
  } catch (err) {
    console.error(
      `[Rewards] Fallo al reservar descuento en orden ${order?._id}:`,
      err.message,
    );
  }
};

/**
 * CONSUME el saldo de recompensas reservado y acredita el SellerCredit al
 * vendedor, al COMPLETARSE la orden (solo se llama desde adminCompleteOrder).
 *
 * Es idempotente respecto a la orden:
 *   - El consumo del comprador se dispara UNA sola vez (guard por
 *     `financials.rewardsCommitted` en la orden).
 *   - El SellerCredit usa índice único por `order` (recordSellerCredit).
 *
 * Reparto de monto del SellerCredit:
 *   - BANK: el fee ya se descuenta del colateral del vendedor → crédito = 100%
 *     de las recompensas usadas (rewardsUsedUsd).
 *   - CRYPTO: parte del monto lo cubre el escrow y parte el crédito. El crédito
 *     lo deja el flujo crypto en `financials.sellerCreditUsd`. Si no está, se
 *     usa rewardsUsedUsd como respaldo.
 *
 * @param {Object} order  documento de orden (ya con _id, buyer, seller)
 */
const commitRewardsOnComplete = async (order) => {
  if (!order?._id) return;
  const rewardsReserved =
    Number(order.financials?.rewardsReservedUsd) ||
    Number(order.financials?.rewardsUsedUsd) ||
    0;
  if (rewardsReserved <= 0) return; // la orden no usó recompensas
  if (order.financials?.rewardsCommitted === true) return; // idempotencia

  const breakdown =
    order.financials?.rewardsReservedBreakdown ||
    order.financials?.rewardsBreakdown || {
      cashbackUsd: 0,
      referralUsd: 0,
    };

  try {
    const { commitReservedRewardsForOrder, recordSellerCredit } = await import(
      "../services/rewardsService.js"
    );

    // 1) Descontar definitivamente el saldo reservado del comprador.
    await commitReservedRewardsForOrder({
      userId: order.buyer,
      cashbackUsd: breakdown.cashbackUsd,
      referralUsd: breakdown.referralUsd,
      orderId: order._id,
    });

    // 2) Acreditar al vendedor el crédito (pasivo que reclama aparte).
    const isCrypto = order.payment?.method === "crypto";
    const sellerCreditUsd = isCrypto
      ? Number(order.financials?.sellerCreditUsd) || rewardsReserved
      : rewardsReserved; // BANK: crédito = 100% de recompensas usadas

    await recordSellerCredit({
      sellerId: order.seller,
      orderId: order._id,
      amountUsd: sellerCreditUsd,
      breakdown,
    });

    // 3) Marcar en la orden que ya se consumió (idempotencia).
    await Order.updateOne(
      { _id: order._id },
      { $set: { "financials.rewardsCommitted": true } },
    );
    if (order.financials) order.financials.rewardsCommitted = true;

    console.log(
      `[Rewards] Orden ${order._id} COMPLETADA: saldo del comprador consumido ` +
        `(US$ ${rewardsReserved}) y SellerCredit US$ ${sellerCreditUsd} acreditado al vendedor.`,
    );
  } catch (err) {
    // No bloqueante: la orden ya se completó on-chain. Se puede reintentar
    // manualmente; dejamos traza del monto para auditoría.
    console.error(
      `[Rewards] Fallo al consumir recompensas al completar la orden ${order?._id}:`,
      err.message,
    );
  }
};

/**
 * LIBERA la reserva de recompensas de una orden que NO se completó
 * (cancelada / expirada / reembolsada / hold cancelado). Devuelve el saldo
 * comprometido a "disponible".
 *
 * Idempotente respecto a la orden: si ya se liberó (o ya se consumió al
 * completar) no hace nada, gracias al flag `financials.rewardsReservationReleased`.
 *
 * @param {Object} order  documento de orden (con buyer y financials)
 * @param {Object} [opts]  { reason }
 */
const releaseOrderRewardsReservation = async (order, opts = {}) => {
  if (!order?._id) return;
  const rewardsReserved =
    Number(order.financials?.rewardsReservedUsd) ||
    Number(order.financials?.rewardsUsedUsd) ||
    0;
  if (rewardsReserved <= 0) return;
  // Si ya se consumió al completar, no liberamos.
  if (order.financials?.rewardsCommitted === true) return;
  // Si ya se liberó, no repetimos.
  if (order.financials?.rewardsReservationReleased === true) return;

  const breakdown =
    order.financials?.rewardsReservedBreakdown ||
    order.financials?.rewardsBreakdown || {
      cashbackUsd: 0,
      referralUsd: 0,
    };

  try {
    const { releaseReservedRewardsForOrder, recordSellerCredit } = await import(
      "../services/rewardsService.js"
    );

    // 1) Devolver el saldo reservado a "disponible" del comprador.
    await releaseReservedRewardsForOrder({
      userId: order.buyer,
      cashbackUsd: breakdown.cashbackUsd,
      referralUsd: breakdown.referralUsd,
      orderId: order._id,
    });

    // 2) Cancelar el SellerCredit si se hubiera creado (no debería, pero por
    //    si quedó de un flujo viejo que lo acreditaba al crear).
    try {
      const SellerCredit = (await import("../models/SellerCredit.js")).default;
      await SellerCredit.updateOne(
        { order: order._id, status: "pending" },
        { $set: { status: "cancelled" } },
      );
    } catch (creditErr) {
      console.warn(
        `[Rewards] No se pudo cancelar SellerCredit de orden ${order._id}:`,
        creditErr.message,
      );
    }

    // 3) Marcar en la orden que la reserva ya se liberó (idempotencia).
    await Order.updateOne(
      { _id: order._id },
      { $set: { "financials.rewardsReservationReleased": true } },
    );
    if (order.financials) order.financials.rewardsReservationReleased = true;

    console.log(
      `[Rewards] Orden ${order._id} NO completada (${opts.reason || "cancelada"}): ` +
        `reserva de US$ ${rewardsReserved} liberada al comprador.`,
    );
  } catch (err) {
    console.error(
      `[Rewards] Fallo al liberar reserva de recompensas de orden ${order?._id}:`,
      err.message,
    );
  }
};

const createOrder = async (req, res) => {
  try {                                const { sellerId, items, shippingAddress, paymentMethod = "bank_transfer", token = "USDT", deliveryMethod = "shipping", pickupLocation = null, referrerId = null, shippingQuote = null } = req.body;
    const buyerId = req.user._id;

    // Método de entrega efectivo: "shipping" (default) o "pickup" (retiro en
    // sucursal, GRATIS). Normalizamos por seguridad (solo esos dos valores).
    const isPickup = deliveryMethod === "pickup";

        const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ message: "Comprador no encontrado" });
    }

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN DE ONBOARDING DEL COMPRADOR
    // El checkout del front ya bloquea la compra, pero por seguridad
    // también rechazamos acá en el servidor si alguien hace un bypass
    // y envía la creación de la orden sin haber completado sus datos.
    // ─────────────────────────────────────────────────────────────
    const hasMandatoryData =
      buyer.firstName && buyer.lastName && buyer.dni && buyer.phone;
    const hasCompletedOnboarding =
      buyer.profileCompleted === true || hasMandatoryData;

    if (!hasCompletedOnboarding) {
      return res.status(400).json({
        success: false,
        message:
          "Faltan datos obligatorios del comprador. Completá tu perfil (nombre, apellido, DNI y teléfono) antes de continuar con la compra.",
      });
    }

        let maxShippingCost = 0;
    let calculatedTotal = 0;

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN DEL VENDEDOR
    // Verificamos que el vendedor exista y no sea el propio comprador
    // (un usuario no puede comprarse a sí mismo).
    // ─────────────────────────────────────────────────────────────
    const seller = await User.findById(sellerId);
    if (!seller) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no existe en la plataforma.",
      });
    }
    if (seller._id.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "No podés comprarte un producto a vos mismo.",
      });
    }

    // 1. Obtener los IDs de los productos para buscarlos en la DB
    const productIds = items.map((item) => item.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } });

    // 2. Construir el itemsSnapshot validando datos reales
    const itemsSnapshot = items.map((cartItem) => {
      const actualProduct = dbProducts.find(
        (p) => p._id.toString() === cartItem.productId,
      );

      if (!actualProduct) {
        throw new Error(`Producto ${cartItem.productId} no encontrado`);
      }

      // ─────────────────────────────────────────────────────────────
      // 🛡️ VALIDACIÓN CRÍTICA DE PERTENENCIA
      // Nos aseguramos de que cada producto realmente pertenezca al
      // vendedor indicado en la URL/request. Esto evita que un atacante
      // haga bypass del front y asocie productos de un vendedor B a una
      // orden del vendedor A.
      // ─────────────────────────────────────────────────────────────
            if (actualProduct.seller.toString() !== sellerId.toString()) {
        throw new Error(
          `El producto "${actualProduct.name}" no pertenece al vendedor indicado.`,
        );
      }

      // ─────────────────────────────────────────────────────────────
      // VALIDACIÓN DE MÉTODO DE PAGO ACEPTADO POR EL PRODUCTO
      // Cada producto declara qué medios acepta (payment.acceptsTransfer /
      // payment.acceptsCrypto). Bloqueamos si el método elegido no está
      // aceptado por TODOS los productos del carrito (bypass del front).
      // ─────────────────────────────────────────────────────────────
      const acceptsTransfer = actualProduct.payment?.acceptsTransfer !== false; // default true
      const acceptsCrypto = actualProduct.payment?.acceptsCrypto === true; // default false
      if (paymentMethod === "crypto" && !acceptsCrypto) {
        throw new Error(
          `El producto "${actualProduct.name}" no acepta pago con criptomonedas.`,
        );
      }
      if (paymentMethod === "bank_transfer" && !acceptsTransfer) {
        throw new Error(
          `El producto "${actualProduct.name}" no acepta transferencia bancaria.`,
        );
      }

      let effectivePrice = actualProduct.price;

      if (actualProduct.sale?.active && actualProduct.sale?.price > 0) {
        effectivePrice = actualProduct.sale.price;
      }

      const itemTotal = effectivePrice * cartItem.quantity;
      calculatedTotal += itemTotal;


            const shippingCost = actualProduct.shipping?.free
        ? 0
        : actualProduct.shipping?.cost || 0;
      // Si el comprador eligió RETIRO EN SUCURSAL, no se cobra envío (GRATIS).
      if (!isPickup && shippingCost > maxShippingCost) {
        maxShippingCost = shippingCost;
      }

      return {
        productId: actualProduct._id,
        quantity: cartItem.quantity,
        title: actualProduct.name,
        description: actualProduct.description,
        price: effectivePrice,
        currency: actualProduct.currency,
        condition: actualProduct.condition,
        shipping: actualProduct.shipping,
        images: actualProduct.images.map((img) => img.url),
        category: actualProduct.category,
        subCategory: actualProduct.subCategory,
        brand: actualProduct.brand,
        specifications: actualProduct.specifications,
      };
        });

        // ─────────────────────────────────────────────────────────────
    // AFILIACIÓN / REFERRAL
    // El comprador pudo llegar por un enlace ?ref=... Llegamos hasta acá con un
    // referrerId crudo del body. Lo validamos contra la config del programa
    // (referidor existente y distinto del comprador) y obtenemos el % ofrecido
    // por el producto. Si no es válido, referrerId queda en null.
    // ─────────────────────────────────────────────────────────────
                const { referrerId: validReferrerId, percent: referralPercent } =
      await resolveOrderReferrer(referrerId, {
        buyerId,
        itemsSnapshot,
      });

        // ─────────────────────────────────────────────────────────────
    // ENVÍO DINÁMICO (ZIPNOVA) — RECÁLCULO SEGURO EN EL SERVIDOR
    // El front cotiza con Zipnova y manda el envío elegido en `shippingQuote`.
    // NUNCA confiamos en el precio que envía el cliente: volvemos a cotizar
    // acá con los datos reales de los productos y elegimos la opción más
    // parecida a la que eligió el comprador (por precio). Si la cotización
    // falla, hacemos fallback al costo fijo (maxShippingCost) ya calculado.
    //
    // Reglas:
    //  • Retiro en sucursal → GRATIS ($0).
    //  • Todos los productos con envío gratis/digitales → GRATIS ($0).
    //  • Envío a domicilio → cotizamos por Zipnova y usamos la opción elegida.
    // ─────────────────────────────────────────────────────────────
    const allFreeShipping = itemsSnapshot.every(
      (it) => it.shipping?.free || it.shipping?.isDigital,
    );

    // ─────────────────────────────────────────────────────────────
    // MODO DE ENVÍO A DOMICILIO DEL PEDIDO
    //   "zipnova" → cotización dinámica de la plataforma (default).
    //   "fixed"   → precio fijo propio del vendedor (shipping.cost).
    //   "arrange" → a convenir (sin costo en el checkout).
    // La cotización de Zipnova SOLO aplica en modo "zipnova". Si CUALQUIER
    // producto pide cotización, cotizamos (regla de intersección segura); si
    // no hay ninguno zipnova, NUNCA llamamos a Zipnova ni pisamos el costo fijo.
    // (Productos viejos sin el campo → se asume "zipnova" por compatibilidad.)
    // ─────────────────────────────────────────────────────────────
    const homeDeliveryMode = itemsSnapshot.some(
      (it) => (it.shipping?.delivery?.homeDeliveryMode || "zipnova") === "zipnova",
    )
      ? "zipnova"
      : itemsSnapshot.some(
            (it) => it.shipping?.delivery?.homeDeliveryMode === "fixed",
          )
        ? "fixed"
        : "arrange";

    // Solo cotizamos con Zipnova si el modo del pedido lo requiere.
    if (!isPickup && !allFreeShipping && homeDeliveryMode === "zipnova") {
      const declaredValue = calculatedTotal;
      const zipItems = itemsSnapshot.flatMap((it) =>
        Array.from({ length: it.quantity || 1 }, () => {
          const dim = it.shipping?.dimensions || {};
          const weightKg = Number(dim.weight);
          const length = Number(dim.length || dim.depth);
          return {
            sku: it.sku || undefined,
            description: it.title || undefined,
            weight: weightKg > 0 ? Math.ceil(weightKg * 1000) : 500,
            height: Number(dim.height) > 0 ? Math.ceil(Number(dim.height)) : 10,
            width: Number(dim.width) > 0 ? Math.ceil(Number(dim.width)) : 15,
            length: length > 0 ? Math.ceil(length) : 20,
          };
        }),
      );

            // Dirección de destino del envío (la que manda el front). El snapshot
      // definitivo `effectiveShippingAddress` se calcula más abajo; para la
      // cotización usamos directamente `shippingAddress` (no aplica pickup acá).
      const destAddress = shippingAddress || {};
      const quoteRes = await quoteShipment({
        declared_value: declaredValue,
        destination: {
          zipcode: String(destAddress.zipCode || "").trim(),
          city: destAddress.city,
          state: destAddress.province,
          street: destAddress.street,
          street_number: destAddress.streetNumber,
        },
        items: zipItems,
        type_packaging: "dynamic",
        sort_by: "price",
      });

      if (quoteRes.success) {
        const raw =
          quoteRes.data?.all_results ||
          quoteRes.data?.results ||
          (Array.isArray(quoteRes.data) ? quoteRes.data : []);

        const options = (raw || [])
          .map((r) => ({
            price: Number(r?.amounts?.price_incl_tax || 0),
            carrierName: r?.carrier?.name || r?.carrier?.code || "Logística",
            serviceName: r?.service_type?.name || r?.service_type?.code || "",
          }))
          .filter((o) => Number.isFinite(o.price) && o.price > 0)
          .sort((a, b) => a.price - b.price);

        if (options.length > 0) {
          // Elegimos la opción más cercana al precio que seleccionó el
          // comprador (evita que un cliente malicioso fije $0).
          const wanted = Number(shippingQuote?.price);
          let chosen = options[0]; // más barata por defecto
          if (Number.isFinite(wanted) && wanted > 0) {
            chosen = options.reduce((best, o) =>
              Math.abs(o.price - wanted) < Math.abs(best.price - wanted)
                ? o
                : best,
            );
          }
          maxShippingCost = Math.round(chosen.price);
          req._shippingQuoteMeta = chosen; // auditoría (no persiste aún)
        } else {
          // Sin opciones para esa ubicación: mantenemos el fallback fijo.
          console.warn(
            "[Shipping] Zipnova no devolvió opciones para la orden. Se usa el costo fijo de respaldo.",
          );
        }
      } else {
        console.warn(
          "[Shipping] Falló la cotización de Zipnova en createOrder. Se usa el costo fijo de respaldo.",
          quoteRes.error,
        );
      }
    }

    // ── COMPRA GRUPAL (crypto): precio escalonado por tier ──────────────
    // Si la orden es de grupo, el precio unitario NO es product.price sino el
    // del TIER VIGENTE (según cuántos miembros fondeados tendría el grupo):
    //   - createPool → 1 comprador (precio base).
    //   - joinPool   → (members fondeados del pool) + 1.
    // Lo calculamos acá, ANTES de financials, para que el monto a fonear sea
    // exactamente el del tier (y coincida con lockedUsd al materializar).
    if (paymentMethod === "crypto" && req.body.groupBuy) {
      try {
        const { computeGroupUnitPriceArs } = await import(
          "./groupBuyOrderController.js"
        );
        const tierArs = await computeGroupUnitPriceArs({
          groupBuy: req.body.groupBuy,
          product: dbProducts[0], // grupo = 1 solo producto
        });
        if (tierArs != null && tierArs > 0) {
          const qty = itemsSnapshot.reduce(
            (a, it) => a + (it.quantity || 1),
            0,
          );
          // Reemplazamos el total del producto por el del tier vigente.
          calculatedTotal = Number((tierArs * qty).toFixed(2));
          // Corregimos el snapshot para que refleje el precio real pagado.
          itemsSnapshot.forEach((it) => {
            it.price = tierArs;
          });
        }
      } catch (tierErr) {
        console.warn(
          "[GroupBuy] No se pudo calcular el tier vigente, se usa precio base:",
          tierErr?.message,
        );
      }
    }

    // La comisión TOTAL incluye el reward de referidos (si la orden nació
    // referida): platformFeeUsd = baseFeeUsd(3%) + referralFeeUsd(%). Esto
    // garantiza que un solo saque on-chain cubra ambos, sin tocar el contrato.
    const financials = await calculateOrderFinancials(
      calculatedTotal,
      maxShippingCost,
      referralPercent,
    );
    console.log("[Server] Financials:", financials);

    // ─────────────────────────────────────────────────────────────
    // DESCUENTO POR SALDO DE RECOMPENSAS (cashback + referral-buyer)
    // Opcional (el comprador lo elige en el checkout con `useRewards`).
    //
    // Reglas (definidas con el negocio):
    //  • Se aplica SOLO sobre el subtotal de PRODUCTOS (financials.totalUsd),
    //    NUNCA sobre el envío. Puede cubrir hasta el 100% del producto (0).
    //  • El fee de la plataforma se calcula y cobra SIEMPRE sobre el total
    //    (productos + envío), SIN descontarse por las recompensas.
    //  • El seller NO pierde plata: lo que no le llega en el pago directo (o
    //    en escrow) se le compensa vía SellerCredit (= rewardsUsed), que reclama
    //    aparte. Ver rewardsService.recordSellerCredit / claimSellerCredit.
    //  • El saldo se RESERVA (bloquea) del comprador AL PERSISTIR la orden
    //    (ver applyPendingRewards más abajo), para que no pueda reutilizarse en
    //    otra compra. NO se consume todavía: el consumo real + el SellerCredit
    //    al vendedor se hacen SOLO cuando el admin COMPLETA la orden
    //    (ver commitRewardsOnComplete en adminCompleteOrder). Si la orden no se
    //    completa, la reserva se libera (releaseOrderRewardsReservation).
    //
    // Financiamiento: el saldo (asiento contable off-chain) ya lo tiene la
    // plataforma; el comprador paga menos "dinero nuevo". El fee intacto +
    // el SellerCredit mantienen al seller entero.
    // ─────────────────────────────────────────────────────────────
    // `pendingRewards` viaja por el pipeline y se RESERVA al guardar la
    // orden (crypto y bank) vía applyPendingRewards(order). El consumo real
    // ocurre recién al completar la orden.
    let pendingRewards = null;
    // ⚠️ INTERRUPTOR MAESTRO: uso de recompensas en checkout DESHABILITADO.
    // Por decisión de negocio, el saldo de recompensas (cashback + referral-buyer)
    // NO se puede gastar en el checkout por ahora. Se sigue ACUMULANDO y
    // mostrando en la wallet, pero no se descuenta de ninguna orden.
    // Esto es la fuente de verdad: aunque el front mande `useRewards: true`
    // (o se haga un bypass del cliente), acá NO se aplica ningún descuento ni se
    // reserva saldo. El flag se controla en config/rewards.js.
    const useRewards = REWARDS_CHECKOUT_ENABLED && req.body?.useRewards === true;
    // PENDIENTE: las compras GRUPALES (crypto) tienen su propio reparto
    // escalonado (settle: seller + fee + reintegro) que asume escrow = totalUsd.
    // Mezclar recompensas romperia ese cuadre, asi que por ahora NO se aplican
    // ahi. Cuando habilitemos compras grupales, integrar el descuento al settle.
    const rewardsAllowedForOrder = !(paymentMethod === 'crypto' && req.body?.groupBuy);
    if (useRewards && rewardsAllowedForOrder) {
      try {
        const { quoteRewardsForOrder } = await import(
          "../services/rewardsService.js"
        );

        const quote = quoteRewardsForOrder({
          user: buyer,
          productsTotalUsd: financials.totalUsd,
          shippingUsd: financials.shippingCostUsd,
          platformFeeUsd: financials.platformFeeUsd,
        });

        if (quote.rewardsUsedUsd > 0) {
          // Persistimos el desglose en financials (auditoría + settle).
          financials.rewardsUsedUsd = quote.rewardsUsedUsd;
          financials.rewardsBreakdown = quote.breakdown;
          // Monto efectivo que pone el comprador en "dinero nuevo":
          // productos - recompensas + envío (el envío SIEMPRE se paga).
          financials.escrowAmountUsd = quote.cashAmountUsd;
          // Crédito REAL a favor del seller (= lo que no cobró del escrow).
          financials.sellerCreditUsd = quote.sellerCreditUsd;

          pendingRewards = {
            buyerId,
            sellerId,
            rewardsUsedUsd: quote.rewardsUsedUsd,
            sellerCreditUsd: quote.sellerCreditUsd,
            breakdown: quote.breakdown,
          };

          console.log(
            `[Rewards] Descuento a aplicar al persistir: US$ ${quote.rewardsUsedUsd} ` +
              `(cashback ${quote.breakdown.cashbackUsd} + ref ${quote.breakdown.referralUsd}). ` +
              `Efectivo/escrow comprador: US$ ${quote.cashAmountUsd}. ` +
              `SellerCredit: US$ ${quote.sellerCreditUsd}. Fee intacto US$ ${quote.feeUsd}.`,
          );
        }
      } catch (rewardsErr) {
        // No bloqueamos la compra si falla el cálculo: se sigue sin aplicar.
        console.error(
          "[Rewards] Fallo al cotizar descuento (se ignora):",
          rewardsErr.message,
        );
        delete financials.rewardsUsedUsd;
        delete financials.rewardsBreakdown;
        delete financials.escrowAmountUsd;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // DIRECCIÓN EN LA ORDEN
    // Si es RETIRO EN SUCURSAL, guardamos los datos del punto como
    // `shippingAddress` (para que los mails/paneles existentes lo muestren) y
    // además el snapshot completo en `pickupLocation`. Si es envío, usamos la
    // dirección de envío que mandó el front.
    // ─────────────────────────────────────────────────────────────
    const pickupAddress = isPickup && pickupLocation
      ? {
          street: pickupLocation.street || "",
          streetNumber: pickupLocation.streetNumber || "",
          city: pickupLocation.city || "",
          province: pickupLocation.state || "",
          zipCode: pickupLocation.zipcode || "",
          addressType: "Retiro en sucursal",
        }
      : null;
    const effectiveShippingAddress = pickupAddress || shippingAddress || {};

    // 3. Definir expiración (Parametrizable)
    const MINUTES_TO_EXPIRATION = 15; // Plazo para pagar/notificar el pago (anti-triangulación)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + MINUTES_TO_EXPIRATION);

        // ==========================================
    // 🛡️ NUEVA LÓGICA: SECCIÓN DE BLOCKCHAIN 🛡️
    // ==========================================

    // ════════════════════════════════════════════════════════════
    // FLUJO PAGO CON CRIPTOMONEDAS (Escrow NeroEscrow)
    // El comprador fondeará USDT en el contrato escrow y los fondos quedan
    // retenidos hasta que el admin libere (comprador confirmó recepción).
    // NO se exige colateral al vendedor: el escrow retiene el pago del comprador.
    // ════════════════════════════════════════════════════════════
    if (paymentMethod === "crypto") {
      // FASE 1 (refactor): la creación crypto se delega a orderCryptoController
      // (factory makeCreateCryptoOrder). Aquí solo armamos el contexto común ya
      // resuelto para no duplicar el pipeline (items, financials, envío, referral).
      const cryptoCtx = {
        buyer,
        seller,
        buyerId,
        sellerId,
        productIds,
        itemsSnapshot,
        effectiveShippingAddress,
        isPickup,
        pickupLocation,
        shippingDetails: buildShippingDetails(isPickup, shippingQuote, req._shippingQuoteMeta),
        calculatedTotal,
        maxShippingCost,
        financials,
        validReferrerId,
        referralPercent,
        token,
        // Metadata de compra grupal (opcional). Si viene, la orden nace
        // marcada como grupo y, al fondearse, el backend crea/actualiza el
        // Pool correspondiente (ver confirmEscrowFunding).
        groupBuy: req.body.groupBuy || null,
        // Descuento por recompensas (opcional). El handler crypto lo
        // materializa tras guardar la orden.
        pendingRewards,
      };
      return createCryptoOrderHandler(req, res, cryptoCtx);
    }

    // ════════════════════════════════════════════════════════════
    // FLUJO TRANSFERENCIA BANCARIA (COLATERAL EXISTENTE)
    // ════════════════════════════════════════════════════════════
    // A. Buscamos la wallet de Privy del vendedor en la DB
    // (seller ya fue cargado y validado más arriba)
    if (!seller.walletAddress) {
      // Suponiendo que guardas la address en 'walletAddress'
      return res.status(400).json({
        success: false,
        message:
          "El vendedor no tiene una wallet válida vinculada a la plataforma.",
      });
    }


        // B. Definimos qué ID va a tener esta orden para mandárselo al contrato.
    // Como todavía no guardamos la orden en Mongoose, generamos un ObjectId temporal.
    // O si usas otro generador de IDs (como uuid), ponelo acá. Lo importante es que sea único.
        const newOrder = new Order({
      buyer: buyerId,
      seller: sellerId,
      products: productIds,
      itemsSnapshot,
            shippingAddress: effectiveShippingAddress,
      deliveryMethod: isPickup ? "pickup" : "shipping",
      pickupLocation: isPickup ? (pickupLocation || undefined) : undefined,
      // Guardamos carrier/servicio/precio elegido + PUNTO DE ENTREGA (sucursal
      // donde el comprador retira, si aplica) para que el vendedor despache
      // correctamente, incluso en cargas manuales de Zipnova.
      shippingDetails: buildShippingDetails(
        isPickup,
        shippingQuote,
        req._shippingQuoteMeta,
      ),
      // Monto REAL a transferir = productos (netos de recompensas) + envío.
      // Si el comprador usó saldo de recompensas, `financials.escrowAmountUsd`
      // trae el efectivo a pagar; si no, es null y se paga el total completo.
      totalAmount:
        financials.rewardsUsedUsd > 0 && financials.escrowAmountUsd != null
          ? financials.escrowAmountUsd
          : calculatedTotal + maxShippingCost,
      productsAmount:
        financials.rewardsUsedUsd > 0 && financials.escrowAmountUsd != null
          ? Math.max(
              0,
              Number(
                (financials.escrowAmountUsd - maxShippingCost).toFixed(2),
              ),
            )
          : calculatedTotal,
      shippingAmount: maxShippingCost,
            status: "pending_payment", // Se ajusta más abajo si pasa a "awaiting_collateral"
      financials,
      expiresAt: expiresAt,
            referral: validReferrerId
        ? {
            referrer: validReferrerId,
            percent: referralPercent,
            creditAccrued: false,
          }
        : undefined,
    });

    // 2. Extraemos ese ID real que generó Mongoose para usarlo en la Blockchain
    const orderIdForBlockchain = newOrder._id.toString();
    // El monto a congelar como garantía.
    // Podés elegir congelar el 'calculatedTotal' (precio de los productos)
    // o el total completo con envío. Usemos productos como ejemplo:
    const amountToLock = financials.totalUsd + financials.shippingCostUsd;

    // ────────────────────────────────────────────────────────────────
    // ⭐ SELECCIÓN DE RED DE COLATERAL (MULTICHAIN)
    // El colateral de un vendedor vive POR RED: la misma wallet puede tener
    // saldo en BSC, Base y/o Polygon Amoy, en distintos contratos. ANTES esta
    // sección usaba una única red fija (DEFAULT_CHAIN_ID = BSC 97), por lo que
    // si el vendedor depositaba en OTRA red (ej. Polygon Amoy con Crossmint)
    // acá se leía BSC → available = 0 → la orden caía SIEMPRE en
    // "awaiting_collateral" aunque tuviera saldo. Ahora recorremos TODAS las
    // redes configuradas y elegimos la que tenga SALDO LIBRE suficiente para
    // cubrir la garantía. Persistimos esa red en la orden para que
    // release/cancel/dispute operen SIEMPRE sobre la misma.
    //
    //  - Si alguna red alcanza          → flujo normal (lock + pending_payment)
    //  - Si NINGUNA alcanza             → entra a "awaiting_collateral"
    //    (se le da 15 min al vendedor para depositar, el comprador decide).
    // ────────────────────────────────────────────────────────────────
    // Fuente de verdad = blockchain: `available` ya descuenta los locks
    // on-chain de todas las órdenes activas de esa red.
    const multiChainNow = await getVendorCollateralMultiChain(
      seller.walletAddress,
    );

    // Elegimos la red con mayor saldo libre disponible, siempre que alcance el
    // monto requerido. (bestChain/bestAvailable lo calcula el propio servicio).
    const collateralChainId =
      multiChainNow.success &&
      multiChainNow.bestChain != null &&
      multiChainNow.bestAvailable >= amountToLock
        ? multiChainNow.bestChain
        : DEFAULT_CHAIN_ID;

    const availableOnChain =
      multiChainNow.success && multiChainNow.bestChain != null
        ? multiChainNow.bestAvailable
        : 0;

    console.log(
      `[Server] Colateral multichain del vendedor ${seller.walletAddress}: ` +
        `bestChain=${multiChainNow.bestChain} bestAvailable=${availableOnChain} | ` +
        `requerido=${amountToLock} → red elegida: ${collateralChainId}`,
    );

    if (
      multiChainNow.success &&
      multiChainNow.bestChain != null &&
      availableOnChain >= amountToLock
    ) {
      // ── FLUJO NORMAL: hay colateral suficiente en alguna red ──
      const blockchainResult = await lockVendorCollateral(
        orderIdForBlockchain,
        seller.walletAddress,
        amountToLock,
        collateralChainId,
      );

      // Si la blockchain falla (error real del contrato, no insuficiencia),
      // abortamos y no se crea nada en la DB.
      if (!blockchainResult.success) {
        console.error(
          "[Server] Fallo al bloquear colateral del vendedor",
          seller.walletAddress,
          "| amountToLock:",
          amountToLock,
          "| error:",
          blockchainResult.error,
        );
        return res.status(400).json({
          success: false,
          message:
            "No se pudo procesar la orden: el sistema no pudo congelar la garantía del vendedor en el contrato inteligente.",
          error:
            blockchainResult.error ||
            "Error desconocido al bloquear colateral en blockchain",
                    detail: {
            vendorWallet: seller.walletAddress,
            // Dirección del contrato de colateral de la red REALMENTE elegida
            // (multichain), no una hardcodeada. Se resuelve desde la config.
            contractAddress: getChainConfig(collateralChainId).contractAddress,
            amountToLockUsd: amountToLock,
            availableOnChain,
            chainId: collateralChainId,
            // Desglose por red para diagnóstico (por qué se eligió esa chain).
            perChain: multiChainNow.byChain || {},
          },
        });
      }

      // ── GUARDADO (flujo normal) ──
      newOrder.collateralTxHash = blockchainResult.txHash;
      newOrder.collateralChainId = collateralChainId;
      newOrder.status = "pending_payment";

      const savedOrder = await newOrder.save();

      // RESERVAR el descuento por recompensas (si el comprador lo usó):
      // bloquea su saldo para esta orden (sin consumirlo). Se consumirá al
      // completar; si la orden se cancela/expira, se libera.
      await applyPendingRewards(savedOrder, pendingRewards);

      // Notificaciones (normal)
      sendOrderCreatedToBuyer({
        buyerEmail: buyer.email,
        orderId: newOrder._id,
        amount: newOrder.totalAmount,
        products: newOrder.itemsSnapshot,
        seller: seller.username,
      }).catch((err) => console.error("Falló notificación a comprador:", err));

      sendOrderCreatedToVendor({
        vendorEmail: seller.email,
        orderId: newOrder._id,
        amount: newOrder.totalAmount,
        products: newOrder.itemsSnapshot,
        buyerName: buyer.firstName || buyer.username || "El comprador",
      }).catch((err) => console.error("Falló notificación a vendedor:", err));

      createNotification({
        recipient: sellerId,
        type: "order_created",
        title: "¡Nueva orden de compra!",
        message: `${buyer.firstName || buyer.username || "El comprador"} inició la orden #${newOrder._id.toString().slice(-6).toUpperCase()}.`,
        data: { orderId: newOrder._id, totalAmount: newOrder.totalAmount },
      }).catch((err) => console.error("Falló notif in-app a vendedor:", err));

      return res.status(201).json({
        success: true,
        message: "Orden creada con éxito y colateral congelado en Blockchain",
        order: savedOrder,
      });
    }

    // ────────────────────────────────────────────────────────────────
    // D. COLATERAL INSUFICIENTE → estado intermedio "awaiting_collateral"
    // No rebotamos la orden: le damos al vendedor 15 min para depositar y
    // al comprador la opción de esperar o cancelar.
    // ────────────────────────────────────────────────────────────────
    const holdCheck = await validateVendorHoldCapacity(seller._id);
    if (!holdCheck.ok) {
      // El vendedor ya agotó sus holds disponibles (2 activos o 3 vencidos/día).
      return res.status(409).json({
        success: false,
        code: holdCheck.code,
        message:
          "El vendedor no puede recibir más solicitudes en espera de garantía en este momento.",
        reason: holdCheck.reason,
      });
    }

    const holdExpiresAt = new Date(Date.now() + COLLATERAL_HOLD_CONFIG.HOLD_MS);

    newOrder.status = "awaiting_collateral";
    // Red "de referencia" para la orden mientras espera el depósito. OJO: al
    // resolver el hold (resolveCollateralHold) NO confiamos en este valor: se
    // vuelve a detectar multichain en qué red depositó el vendedor y el lock se
    // hace ahí. Guardamos DEFAULT_CHAIN_ID como placeholder.
    newOrder.collateralChainId = collateralChainId;
    newOrder.collateralHold = {
      requestedAt: new Date(),
      expiresAt: holdExpiresAt,
      reserveUsd: amountToLock,
      reason: "insufficient_collateral",
      status: "pending",
    };

    const holdOrder = await newOrder.save();

    // RESERVAR el descuento por recompensas también en el flujo de espera de
    // colateral (la orden existe; el comprador ya comprometió su saldo). Se
    // liberará si el hold expira/cancela (ver releaseReservationForOrder en
    // expireCollateralHold y cancelCollateralHold).
    await applyPendingRewards(holdOrder, pendingRewards);

        // Notificar al VENDEDOR: necesita depositar colateral para no perder la venta
    createNotification({
      recipient: sellerId,
      type: "collateral_hold_requested",
      title: "¡Tenés una venta en espera por falta de garantía!",
      message: `${buyer.firstName || buyer.username || "El comprador"} quiere comprarte, pero no tenés saldo en tu cuenta de garantía. Depositá saldo en los próximos ${Math.round(
        COLLATERAL_HOLD_CONFIG.HOLD_MS / 60000,
      )} minutos para no perder la venta (orden #${newOrder._id
        .toString()
        .slice(-6)
        .toUpperCase()}).`,
      data: { orderId: newOrder._id, amountToLockUsd: amountToLock },
    }).catch((err) => console.error("Falló notif hold a vendedor:", err));

    // 💌 MAIL al vendedor: aviso de espera por falta de garantía, para que
    // deposite USDT en el plazo y no pierda la venta.
    if (seller?.email) {
      sendVendorCollateralHoldRequested({
        vendorEmail: seller.email,
        orderId: newOrder._id,
        amount: amountToLock,
        products: newOrder.itemsSnapshot || [],
        buyerName: buyer.firstName || buyer.username || buyer.email || "El comprador",
        minutesLeft: Math.round(COLLATERAL_HOLD_CONFIG.HOLD_MS / 60000),
      }).catch((err) =>
        console.error("Falló email de garantía al vendedor:", err),
      );
    }

    return res.status(202).json({
      success: true,
      status: "awaiting_collateral",
      message:
        "El vendedor debe depositar colateral para confirmar el envío. Podés esperar unos minutos o cancelar y buscar este producto en otro vendedor.",
      order: holdOrder,
            collateralHold: {
        expiresAt: holdExpiresAt,
        minutesLeft: Math.round(COLLATERAL_HOLD_CONFIG.HOLD_MS / 60000),
        amountToLockUsd: amountToLock,
      },
    });
  } catch (error) {
    console.error("Error al crear orden:", error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la orden",
      error: error.message,
    });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id; // Obtenido por attachUser
    const { role } = req.query; // 'buyer' o 'seller'
    // console.log("en mis ordenes", userId, role);
    // Definimos el filtro dinámicamente
    let filter = {};
    if (role === "seller") {
      filter = { seller: userId };
    } else {
      // Por defecto buscamos las compras del usuario
      filter = { buyer: userId };
    }

    // Buscamos y ordenamos por las más recientes (createdAt: -1)
    const orders = await Order.find(filter)
      .populate("buyer", "username firstName lastName avatar")
      .populate("seller", "username shop firstName lastName") // Datos mínimos necesarios
      .sort({ createdAt: -1 });

    // ─────────────────────────────────────────────────────────────
    // EXPIRACIÓN "LAZY" DE HOLDS VENCIDOS EN LA LISTA.
    // Antes de responder, corregimos cualquier "awaiting_collateral" con el
    // hold vencido (red de seguridad aunque el cron esté apagado), así el
    // vendedor/comprador ve la orden como "Expirado" y no como "En espera de
    // garantía" para siempre. Se hace antes del saneo para reflejar el estado
    // final en el objeto devuelto.
    // ─────────────────────────────────────────────────────────────
    for (const o of orders) {
      // Si expiró, expireCollateralHold ya persiste el estado y el statusHistory
      // en este mismo documento, por lo que el objeto devuelto queda al día.
      await expireCollateralHoldIfDue(o);
    }

    // ─────────────────────────────────────────────────────────────
    // SANEO DEFENSIVO DE REFERENCIAS HUÉRFANAS
    // Si el comprador o el vendedor de una orden fue ELIMINADO, el populate
    // deja el campo en `null`. El front accedía a `order.buyer.username` y
    // crasheaba con "Cannot read properties of null". Normalizamos acá para
    // garantizar que siempre viaje un objeto con datos mínimos, así el
    // cliente puede renderizar sin defensas (o con defensas parciales) sin
    // romperse. Mantenemos `_id` si existía para no perder trazabilidad.
    // ─────────────────────────────────────────────────────────────
    const sanitizedOrders = orders.map((order) => {
      const obj = order.toObject();
      if (!obj.buyer) {
        obj.buyer = { username: "Usuario eliminado", deleted: true };
      }
      if (!obj.seller) {
        obj.seller = { username: "Vendedor eliminado", deleted: true };
      }
      // `products` y `itemsSnapshot` deben ser arrays para que el front pueda
      // leer `.length` / hacer `.map` sin romperse.
      if (!Array.isArray(obj.products)) obj.products = [];
      if (!Array.isArray(obj.itemsSnapshot)) obj.itemsSnapshot = [];
      return obj;
    });

    res.status(200).json({
      success: true,
      count: sanitizedOrders.length,
      orders: sanitizedOrders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al obtener tus órdenes",
      error: error.message,
    });
  }
};

const markAsPaid = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    // Buscamos la orden para validar pertenencia y estado antes de tocarla.
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });
    }
    // Solo el COMPRADOR de la orden puede notificar el pago (evita que un
    // tercero autenticado mueva el estado de una orden ajena).
    if (order.buyer.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Solo el comprador puede notificar el pago de esta orden.",
      });
    }
    // Solo tiene sentido notificar el pago desde 'pending_payment'.
    if (order.status !== "pending_payment") {
      return res.status(400).json({
        success: false,
        message: `No se puede notificar el pago en el estado actual: ${order.status}.`,
      });
    }

    // Actualizamos el status y el instante de la notificación (base de tiempo
    // para la futura disputa del vendedor por pago no recibido).
    order.status = "verifying_payment";
    order.verifyingPaymentNotifiedAt = new Date();
    const updatedOrder = await order.save();

    res.status(200).json({ success: true, order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    // console.log("Getting order by id:", req.params.orderId);
    let order = await Order.findById(req.params.orderId)
      .populate("buyer", "username avatar firstName lastName dni")
      .populate("seller", "username shop bankDetails"); // Traemos datos del vendedor

    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    // ─────────────────────────────────────────────────────────────
    // EXPIRACIÓN "LAZY" DEL HOLD DE COLATERAL (al leer la orden).
    // Si la orden está en "awaiting_collateral" con el hold vencido (15 min),
    // la expiramos ACÁ MISMO antes de responder, así el comprador y el vendedor
    // ven el estado real ("Expirado") al instante, sin depender de que el cron
    // (ENABLE_ORDER_CLEANUP_CRON) esté corriendo. Es idempotente: si ya fue
    // resuelta/expirada o no venció, no hace nada. Si expira, se recarga la
    // orden para devolver los campos/estado actualizados al front.
    // ─────────────────────────────────────────────────────────────
    const wasExpired = await expireCollateralHoldIfDue(order);
    if (wasExpired) {
      order = await Order.findById(req.params.orderId)
        .populate("buyer", "username avatar firstName lastName dni")
        .populate("seller", "username shop bankDetails");
    }

    // EL FILTRO CRÍTICO:
    const isParticipant =
      order.buyer._id.toString() === req.user._id.toString() ||
      order.seller._id.toString() === req.user._id.toString();

    if (!isParticipant) {
      return res
        .status(403)
        .json({ message: "No tienes permiso para ver esta orden" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

////// HELPER PARA LIBERAR COLATERAL /////
const executeBlockchainRelease = async (order, sellerAddress, feeAmountUsd) => {
  // Red donde se congeló el colateral de esta orden (persistida al lockear).
  const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;
  console.log(
    `[Blockchain Helper] Solicitando liberación para la orden ${order._id}. Vendedor: ${sellerAddress} | Fee total (USD): ${feeAmountUsd} | chain ${chainId}`,
  );

  const blockchainResult = await releaseVendorCollateral(
    order._id.toString(),
    sellerAddress,
    feeAmountUsd,
    chainId,
  );

  if (!blockchainResult.success) {
    throw new Error(`Fallo en Blockchain: ${blockchainResult.error}`);
  }

  return blockchainResult.txHash;
};
/**
 * HELPER de liberación idempotente para CANCELACIONES (0% fee).
 * Antes de golpear la blockchain consultamos el lock real on-chain: si la
 * orden ya no tiene saldo congelado (lock=0) o no se puede leer, NO
 * reenviamos la tx (el contrato la rechazaría con "No hay saldo bloqueado",
 * que era justo la causa por la que órdenes quedaban trabadas y el sistema
 * devolvía "No se pudo liberar el colateral"). En ese caso solo registramos la
 * acción en la DB sin re-intentar la cadena.
 *
 * Devuelve: { success, skipped, txHash, error }
 *  - skipped = true  → ya estaba liberado, no se envió tx on-chain.
 *  - skipped = false → se envió y confirmó la liberación (0% fee).
 */
const releaseCollateralOnCancelIdempotent = async (order, sellerAddress) => {
  // Red donde se congeló el colateral de esta orden (persistida al lockear).
  const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;
  // Lectura del estado real del lock en el contrato.
  const lockState = await getOrderLock(order._id.toString(), chainId);
  const alreadyReleased =
    !lockState.success || (lockState.success && lockState.lockUsd === 0);

  if (alreadyReleased) {
    console.log(
      `[Cancel Idempotent] Orden ${order._id} ya figura liberada on-chain (lock ${
        lockState.success ? `= ${lockState.lockUsd}` : "ilegible: " + (lockState.error || "s/n")
      } USDT). No se reenvía tx on-chain; solo se reconcilia la DB.`,
    );
    return { success: true, skipped: true, txHash: order.releaseTxHash || "" };
  }

  // Hay saldo congelado real → ejecutamos la liberación sin comisión.
  const bc = await cancelVendorCollateral(order._id.toString(), sellerAddress, chainId);
  if (!bc.success) {
    console.error(
      `[Cancel Idempotent] Fallo al liberar colateral de la orden ${order._id}:`,
      bc.error,
    );
    return { success: false, error: bc.error };
  }
  return { success: true, skipped: false, txHash: bc.txHash };
};

const updateOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;
    const userId = req.user._id.toString();

        console.log("[updateOrder] →", { orderId, updates, userId });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;

    console.log("[updateOrder] flags", {
      isBuyer,
      isSeller,
      status: order.status,
      deliveryMethod: order.deliveryMethod,
      hasPickupDetails: !!order.pickupDetails,
      hasStatusHistory: Array.isArray(order.statusHistory),
    });

    // --- LÓGICA DE PERMISOS POR ESTADO ---

    // --- LÓGICA DE COMPRADOR: NOTIFICAR PAGO ---
    // Aceptamos la notificación si envían el comprobante O si envían el estado explícitamente
    if (
      isBuyer &&
      (updates.paymentProof || updates.status === "verifying_payment")
    ) {
      // Solo permitimos notificar si está pendiente
      if (order.status !== "pending_payment") {
        return res.status(400).json({
          success: false,
          message: `No se puede notificar pago en estado: ${order.status}`,
        });
      }

      // Si mandaron el link del comprobante, lo guardamos (es opcional)
      if (updates.paymentProof) {
        order.paymentProof = updates.paymentProof;
      }

            order.status = "verifying_payment";
      // Momento exacto en que el comprador notificó el pago. Marco inamovible
      // usado para habilitar (tras la ventana de espera) la disputa del
      // vendedor por "el pago no ingresó". No depende de updatedAt porque la
      // orden podría actualizarse luego y correría la cuenta.
      order.verifyingPaymentNotifiedAt = new Date();
      // Registramos quién hizo el cambio para auditoría interna
      console.log(
        `Orden ${orderId} marcada como verificando pago por comprador ${userId}`,
      );

            // Notificar al vendedor que el comprador confirmó el pago (Background)
      const orderSeller = await User.findById(order.seller);
      if (orderSeller?.email) {
        sendPaymentConfirmedToVendor({
          vendorEmail: orderSeller.email,
          orderId: order._id,
          amount: order.totalAmount,
        }).catch((err) =>
          console.error("Falló notificación de pago al vendedor:", err),
        );
      }

      // Notificación in-app al Vendedor - Pago confirmado por el comprador
      if (orderSeller) {
        createNotification({
          recipient: orderSeller._id,
          type: "payment_confirmed",
          title: "El comprador notificó el pago",
          message: `Se reportó el pago de la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
          data: { orderId: order._id, totalAmount: order.totalAmount },
        }).catch((err) =>
          console.error("Falló notif in-app de pago a vendedor:", err),
        );
      }
    }
    // 2. Vendedor confirma pago o carga tracking
        if (isSeller) {
      if (updates.status === "paid" && order.status === "verifying_payment") {
        order.status = "paid";
        order.paymentVerifiedAt = new Date();
      }

      // Cambio solicitado: el vendedor puede marcar el pago como recibido
      // aunque el comprador no lo notificara manualmente (la orden sigue en
      // 'pending_payment'). Esto evita que el flujo se trabe cuando el
      // comprador paga pero demora/olvida notificar. El front muestra una
      // confirmación extra de seguridad antes de llamar este endpoint.
      if (updates.status === "paid" && order.status === "pending_payment") {
        order.status = "paid";
        order.paymentVerifiedAt = new Date();
        order.statusHistory.push({
          status: "paid",
          changedAt: new Date(),
          comment:
            "El vendedor confirmó la recepción del pago sin que el comprador lo notificara manualmente.",
        });
      }

              if (
                order.status === "paid" &&
                updates.shipping &&
                updates.shipping.trackingNumber &&
                updates.shipping.provider
              ) {
                // El envío con tracking SOLO aplica a deliveryMethod "shipping".
                // Si la orden es RETIRO EN SUCURSAL, no se carga tracking: el flujo
                // de pickup se maneja aparte (marcar "listo para retirar").
                if (order.deliveryMethod === "pickup") {
                  return res.status(400).json({
                    success: false,
                    message:
                      "Esta orden es para RETIRO EN SUCURSAL. No requiere número de seguimiento: marcala como lista para retirar.",
                  });
                }
                // Podés guardar el tracking y el proveedor si mandás un string "Andreani: AR123"
                order.shippingDetails.trackingNumber = updates.shipping.trackingNumber;
        order.shippingDetails.provider = updates.shipping.provider;
        order.shippingDetails.shippedAt = new Date();
        order.shippingDetails.otherProviderDetail =
          updates.shipping.otherProviderDetail;
        order.status = "shipped";
        // Si ya está paga, podés mantenerla en 'paid' o crear un estado 'shipped' (opcional)

                // Notificar al comprador con los detalles del envío (Background)
        const orderBuyer = await User.findById(order.buyer);
        if (orderBuyer?.email) {
          sendShippingDetailsToBuyer({
            buyerEmail: orderBuyer.email,
            orderId: order._id,
            provider: order.shippingDetails.provider,
            trackingNumber: order.shippingDetails.trackingNumber,
            otherProviderDetail: order.shippingDetails.otherProviderDetail,
            amount: order.totalAmount,
            shippingAddress: order.shippingAddress,
          }).catch((err) =>
            console.error("Falló notificación de envío al comprador:", err),
          );
        }

        // Notificación in-app al Comprador - Pedido enviado
        if (orderBuyer) {
          createNotification({
            recipient: orderBuyer._id,
            type: "order_shipped",
            title: "¡Tu pedido fue enviado!",
            message: `El vendedor envió la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
                        data: {
              orderId: order._id,
              provider: order.shippingDetails.provider,
              trackingNumber: order.shippingDetails.trackingNumber,
            }, 
        }).catch((err) =>
            console.error("Falló notif in-app de envío a comprador:", err),
    );
            }
              } // ⬅️ CIERRA el if (order.status === "paid" && updates.shipping ...)

            // ─────────────────────────────────────────────────────────────
            // FLUJO RETIRO EN SUCURSAL (deliveryMethod === "pickup")
            // El vendedor NO carga tracking: prepara el pedido y lo marca como
            // "listo para retirar". La orden permanece en 'paid' (no pasa a
            // 'shipped' porque no hay despacho). El comprador luego confirma el
            // retiro, que completa la orden igual que en el envío a domicilio.
            // ─────────────────────────────────────────────────────────────
                        console.log("[updateOrder] evaluando pickupReady", {
              deliveryMethod: order.deliveryMethod,
              status: order.status,
              pickupReady: updates.pickupReady,
            });
            if (
              order.deliveryMethod === "pickup" &&
              order.status === "paid" &&
                            updates.pickupReady
            ) {
              console.log("[updateOrder] ENTRO al bloque pickupReady ✅");
              // ⚠️ Persistimos el subdocumento con $set EXPLÍCITO. Mutar
              // `order.pickupDetails.*` y confiar en el dirty-tracking de
              // Mongoose resultó frágil cuando el schema cacheado en el proceso
              // no tenía `pickupDetails` en la raíz (se descartaba en silencio).
              // Con $set garantizamos que el path se guarde siempre, y mantenemos
              // la mutación en memoria para statusHistory/notificaciones.
              const readyAt = new Date();
              const readyNote =
                typeof updates.pickupNote === "string"
                  ? updates.pickupNote.slice(0, 600)
                  : "";
              await Order.updateOne(
                { _id: orderId },
                {
                  $set: {
                    "pickupDetails.readyForPickup": true,
                    "pickupDetails.readyAt": readyAt,
                    "pickupDetails.readyNote": readyNote,
                  },
                },
              );
              // Reflejamos en el doc en memoria (para statusHistory/notifs).
              if (!order.pickupDetails) order.pickupDetails = {};
              order.pickupDetails.readyForPickup = true;
              order.pickupDetails.readyAt = readyAt;
              order.pickupDetails.readyNote = readyNote;
              order.statusHistory.push({
                status: "paid",
                changedAt: new Date(),
                comment:
                  "El vendedor marcó el pedido como listo para retirar en sucursal." +
                  (order.pickupDetails.readyNote
                    ? ` Nota: ${order.pickupDetails.readyNote}`
                    : ""),
              });

              // Notificar al COMPRADOR: puede retirar su pedido en la sucursal.
              const pickupBuyer = await User.findById(order.buyer);
              if (pickupBuyer?.email) {
                sendPickupReadyToBuyer({
                  buyerEmail: pickupBuyer.email,
                  orderId: order._id,
                  pickupLocation: order.pickupLocation,
                  note: order.pickupDetails.readyNote,
                  amount: order.totalAmount,
                }).catch((err) =>
                  console.error("Falló notificación de retiro al comprador:", err),
                );
              }
              if (pickupBuyer) {
                createNotification({
                  recipient: pickupBuyer._id,
                  type: "order_ready_for_pickup",
                  title: "¡Tu pedido está listo para retirar!",
                  message: `La orden #${order._id.toString().slice(-6).toUpperCase()} te espera en "${order.pickupLocation?.name || "la sucursal del vendedor"}".`,
                  data: { orderId: order._id, pickupLocation: order.pickupLocation },
                }).catch((err) =>
                  console.error("Falló notif in-app de retiro a comprador:", err),
                );
              }
            }

            // El vendedor confirma que el comprador retiró el producto en el local.
                        if (
              order.deliveryMethod === "pickup" &&
              order.status === "paid" &&
              updates.pickupConfirmed
            ) {
              // Mismo criterio que pickupReady: $set explícito para garantizar
              // la persistencia del subdocumento en Mongo.
              const pickedUpAt = new Date();
              await Order.updateOne(
                { _id: orderId },
                {
                  $set: {
                    "pickupDetails.pickedUp": true,
                    "pickupDetails.pickedUpAt": pickedUpAt,
                  },
                },
              );
              if (!order.pickupDetails) order.pickupDetails = {};
              order.pickupDetails.pickedUp = true;
              order.pickupDetails.pickedUpAt = pickedUpAt;
              order.statusHistory.push({
                status: "paid",
                changedAt: new Date(),
                comment: "El vendedor confirmó la entrega en sucursal (el comprador retiró el pedido).",
              });

              // Notificar al COMPRADOR que puede confirmar la recepción para cerrar
              // la orden (y liberar los fondos).
              const pickedBuyer = await User.findById(order.buyer);
              if (pickedBuyer) {
                createNotification({
                  recipient: pickedBuyer._id,
                  type: "order_picked_up",
                  title: "Confirmá que retiraste tu pedido",
                  message: `El vendedor registró la entrega de la orden #${order._id.toString().slice(-6).toUpperCase()}. Confirmá el retiro para completar la compra.`,
                  data: { orderId: order._id },
                }).catch(() => {});
              }
             }
    }

        // ════════════════════════════════════════════════════════════════════
    // 3. Comprador confirma recepción → RECEPTION_CONFIRMED (BUFFER MANUAL)
    //
    // FASE 1 (liberación 100% MANUAL): el comprador YA NO libera la garantía
    // ni el escrow, ni marca la orden como "completed". Solo confirma haber
    // recibido el pedido → la orden pasa a "reception_confirmed" y arranca un
    // período de BUFFER (RELEASE_BUFFER_HOURS, default 24h) durante el cual
    // puede reclamar (producto dañado/equivocado) SIN que la garantía ya esté
    // liberada. Recién cumplido el buffer, el ADMIN libera on-chain (una sola
    // vez, con adminReleaseGuarantee / adminReleaseEscrow) y la orden pasa a
    // "completed".
    //
    // Por qué: si el comprador marca "recibido" sin haber abierto/probado el
    // producto, se expone a liberar la garantía de algo dañado/equivocado. El
    // buffer + la resolución manual dan una ventana de seguridad y un único
    // punto auditable de movimiento de fondos (el admin).
    // ════════════════════════════════════════════════════════════════════
    if (updates.status === "completed" && isBuyer) {
      if (order.status === "completed") {
        return res.status(400).json({
          message: "La orden ya está completada.",
        });
      }
      // Idempotencia: si ya había confirmado la recepción, no reiniciamos el buffer.
      if (order.status === "reception_confirmed") {
        return res.status(400).json({
          success: false,
          message:
            "Ya confirmaste la recepción. La orden está en el período de seguridad antes de liberar la garantía; un administrador la cerrará a la brevedad.",
        });
      }
      // No se puede confirmar recepción si hay una disputa abierta.
      if (order.dispute?.exists) {
        return res.status(409).json({
          success: false,
          message:
            "Hay una disputa abierta en esta orden. No podés confirmar la recepción hasta que el admin la resuelva.",
        });
      }
            // Para envío a domicilio el requisito es que el pedido esté en camino
      // ('shipped'). Para RETIRO EN SUCURSAL no hay despacho: alcanza con que
      // el vendedor haya marcado el pedido listo (o ya retirado) estando 'paid'.
      const isPickupOrder = order.deliveryMethod === "pickup";
      const pickupReadyToConfirm =
        isPickupOrder &&
        order.status === "paid" &&
        (order.pickupDetails?.readyForPickup || order.pickupDetails?.pickedUp);
      if (order.status !== "shipped" && !pickupReadyToConfirm) {
        return res.status(400).json({
          message:
            "No podés confirmar la recepción ya que el producto no fue enviado (o la orden no está lista para retirar).",
        });
      }

      // Transición SIN efecto on-chain: solo estado + timestamps del buffer.
      const now = new Date();
      const releaseEligibleAt = new Date(
        now.getTime() + RELEASE_BUFFER_HOURS * 60 * 60 * 1000,
      );
      // ⚠️ CRÍTICO: la orden DEBE pasar a "reception_confirmed" (no a
      // "completed"). Sin esta línea la orden quedaba en su estado previo
      // ('paid' o 'shipped'): se grababan los timestamps del buffer pero el
      // status no cambiaba, por lo que el comprador seguía viendo el botón de
      // confirmar y la UI nunca mostraba el período de protección.
      order.status = "reception_confirmed";
      order.receptionConfirmedAt = now;
      order.releaseEligibleAt = releaseEligibleAt;
      order.statusHistory.push({
        status: "reception_confirmed",
        changedAt: now,
        comment: `El comprador confirmó la recepción. Período de seguridad de ${RELEASE_BUFFER_HOURS}h antes de liberar la garantía (cierre manual por el admin).`,
      });
      await order.save();

      // Notificaciones: avisamos a ambas partes y al admin (cola de pendientes).
      const sellerInfo = await User.findById(order.seller);
      const buyerInfo = await User.findById(order.buyer);
      const shortId = order._id.toString().slice(-6).toUpperCase();

      // Aviso al VENDEDOR: la venta fue confirmada y se liberará tras el buffer.
      createNotification({
        recipient: order.seller,
        type: "order_reception_confirmed",
        title: "El comprador confirmó la recepción",
        message: `La orden #${shortId} fue marcada como recibida. Tu garantía se liberará después de las próximas ${RELEASE_BUFFER_HOURS}h (período de seguridad).`,
        data: { orderId: order._id, totalAmount: order.totalAmount },
      }).catch(() => {});
      if (sellerInfo?.email) {
        sendOrderCompletedToVendor({
          vendorEmail: sellerInfo.email,
          orderId: order._id,
          amount: order.totalAmount,
        }).catch((err) =>
          console.error("Falló notificación de recepción al vendedor:", err),
        );
      }

      // Aviso al ADMIN (si existe en DB): hay una orden esperando liberación.
      const adminUser = await findAdminUser(User);
      if (adminUser) {
        createNotification({
          recipient: adminUser._id,
          type: "order_pending_release",
          title: "ADMIN: Orden lista para liberar garantía",
          message: `El comprador confirmó la recepción de la orden #${shortId}. Revisá y liberá la garantía tras el período de seguridad (disponible desde ${releaseEligibleAt.toLocaleString("es-AR")}).`,
          data: { orderId: order._id, releaseEligibleAt },
        }).catch(() => {});
      }

      // Info al COMPRADOR: sigue el período de seguridad.
      createNotification({
        recipient: order.buyer,
        type: "order_reception_confirmed",
        title: "¡Confirmaste la recepción!",
        message: `Gracias por confirmar la orden #${shortId}. Tenés ${RELEASE_BUFFER_HOURS}h de protección: si el producto llegó dañado o equivocado, podés abrir un reclamo antes de que se liberen los fondos al vendedor.`,
        data: { orderId: order._id, releaseEligibleAt },
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Recepción confirmada. La garantía se liberará luego del período de seguridad de ${RELEASE_BUFFER_HOURS}h.`,
        order,
      });
    }
    // 4. Cancelación (Solo si está pendiente)
    if (updates.status === "cancelled" && (isBuyer || isSeller)) {
      if (order.status === "pending_payment") {
        order.status = "cancelled";
      }
    }

    await order.save();

    // Devolvemos la orden poblada para que el front se actualice al instante
    const updatedOrder = await Order.findById(orderId)
      .populate("buyer", "username firstName lastName avatar")
      .populate("seller", "username shop firstName lastName");

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CANCELACIÓN DE ORDEN (Comprador cancela compra / Vendedor rechaza orden)
 * Solo permitido ANTES del envío: estados 'pending_payment' y 'verifying_payment'.
 *
 * Escenarios:
 *  a) Iniciador declara que NO pagó -> cancelación directa. Se libera el
 *     colateral al vendedor (0% fee) y la orden pasa a 'cancelled'.
 *  b) Iniciador declara que SÍ pagó -> NO se cancela todavía. Se registra una
 *     solicitud de reembolso pendiente (pendingRequest), se notifica a la otra
 *     parte y el comprador provee sus datos bancarios. Recién cuando el
 *     vendedor confirme el reembolso (confirmRefund) se cancela la orden.
 */
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // El comprador es quien cancela su propia compra. La cancelación por parte
    // del vendedor se gestiona por el admin (requestAdminRelease/adminReleaseGuarantee).
    // body:
    //   paidStatus, reason, refundBankAccount
    const { paidStatus, reason, refundBankAccount } = req.body;

        // Forzamos iniciador según quién llama: comprador (flujo clásico) o
    // vendedor (cancela una orden ya pagada, debe reembolsar).
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res
        .status(403)
        .json({ message: "No tenés permisos para cancelar esta orden." });
    }

    // ════════════════════════════════════════════════════════════════
    // FLUJO VENDEDOR: cancela una orden YA PAGADA (transferencia bancaria).
    // El vendedor no libera su garantía por sí mismo (política anti-fraude).
    // Para cancelar una orden pagada debe reembolsar el dinero al comprador:
    // registramos una solicitud de reembolso (pendingRequest con initiator
    // 'seller') y la garantía queda retenida hasta que el vendedor confirme el
    // reembolso y el comprador confirme haberlo recibido (recién ahí se libera).
    // ════════════════════════════════════════════════════════════════
    if (isSeller && !isBuyer) {
      // Órdenes con escrow CRIPTO: el vendedor puede solicitar la cancelación
      // de una orden YA PAGADA, pero los USDT no los puede devolver él (están
      // retenidos on-chain). Registramos la misma solicitud (pendingRequest con
      // initiator 'seller') y el ADMIN reembolsa el escrow con cancel-escrow.
      // Al reembolsarse, la orden se cancela y el colateral del vendedor queda
      // libre. Solo se permite si el escrow está fondeado (hay dinero real).
      const isCryptoOrder = order.payment?.method === "crypto";
      if (isCryptoOrder && order.payment?.status !== "funded") {
        return res.status(400).json({
          success: false,
          message:
            "El escrow todavía no está fondeado. No hay fondos retenidos que reembolsar en esta orden.",
        });
      }
      if (order.status === "cancelled" || order.status === "completed") {
        return res
          .status(400)
          .json({ success: false, message: `La orden ya está ${order.status}.` });
      }
      if (order.status !== "paid") {
        return res.status(400).json({
          success: false,
          message: `El vendedor solo puede cancelar cuando la orden está pagada (estado actual: ${order.status}).`,
        });
      }
            if (order.pendingRequest?.exists) {
        return res.status(400).json({
          success: false,
          message: "Ya existe una cancelación en curso para esta orden.",
        });
      }

      // El VENDEDOR inició la cancelación de una orden paga, por lo que debe
      // reembolsar al comprador. Necesita los datos bancarios del comprador
      // para saber a dónde transferirle el reintegro: los tomamos de su cuenta
      // por defecto del perfil y los dejamos en la solicitud de reembolso.
      const buyerForRefund = await User.findById(order.buyer);
      const rawAcct =
        buyerForRefund?.bankAccounts?.find((a) => a.isDefault) ||
        buyerForRefund?.bankAccounts?.[0];
      const buyerRefundAccount = rawAcct
        ? {
            bankName: rawAcct.bankName || "",
            holderName: rawAcct.holderName || "",
            cbuCvu: rawAcct.cbuCvu || rawAcct.cbu || "",
            cuitCuil: rawAcct.cuitCuil || rawAcct.cuit || "",
            alias: rawAcct.alias || "",
            accountType: rawAcct.accountType || "",
          }
        : null;

      order.pendingRequest = {
        exists: true,
        initiator: "seller",
        paidStatus: "paid",
        status: "pending",
        reason: reason || "Cancelación iniciada por el vendedor con la orden pagada",
        // Datos bancarios del comprador para que el vendedor pueda reembolsarle.
        ...(buyerRefundAccount ? { refundBankAccount: buyerRefundAccount } : {}),
        createdAt: new Date(),
      };
      order.orderActions.push({
        type: "refund_request",
        initiator: "seller",
        paidStatus: "paid",
        status: "pending",
        reason:
          order.payment?.method === "crypto"
            ? "El vendedor solicitó cancelar una orden pagada con cripto. El admin debe reembolsar el escrow al comprador; al hacerlo, la garantía del vendedor queda liberada."
            : "El vendedor inició la cancelación de una orden pagada. Debe reembolsar al comprador para que su garantía sea liberada.",
        createdBy: order.seller,
      });
      await order.save();

      // Notificar al comprador que el vendedor canceló y le devolverá el dinero.
      const buyerUsr = await User.findById(order.buyer);
      createNotification({
        recipient: order.buyer,
        type: "order_refund_requested",
        title: "El vendedor canceló tu compra",
        message:
          order.payment?.method === "crypto"
            ? `El vendedor solicitó cancelar la orden #${order._id
                .toString()
                .slice(-6)
                .toUpperCase()} pagada con cripto. Un administrador te devolverá los USDT del escrow a tu billetera.`
            : `El vendedor canceló la orden #${order._id
                .toString()
                .slice(-6)
                .toUpperCase()} y te devolverá el dinero. Verificá que te llegue la transferencia y confirmá la recepción para cerrar el proceso.`,
        data: { orderId: order._id },
      }).catch(() => {});
      if (buyerUsr?.email) {
        sendOrderCancelledToBuyer({
          buyerEmail: buyerUsr.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: true,
        }).catch(() => {});
      }

            // Contador de cancelaciones iniciadas por el vendedor.
      await User.findByIdAndUpdate(order.seller, {
        $inc: {
          "accounting.cancellationsAsSeller": 1,
          // El vendedor queda con un reembolso pendiente de procesar/dar al
          // comprador. Este +1 lo balancea el -1 de buyerConfirmsRefundReceived
          // cuando el comprador confirma haberlo recibido.
          "accounting.refundsPending": 1,
        },
      });

      return res.status(200).json({
        success: true,
        message:
          order.payment?.method === "crypto"
            ? "Solicitud registrada. Un administrador reembolsará el escrow al comprador; al completarse, tu garantía quedará liberada."
            : "Cancelación registrada. Deberás devolver el dinero al comprador y él lo confirmará para liberar tu garantía.",
        order,
      });
    }

    // ════════════════════════════════════════════════════════════════
    // FLUJO COMPRADOR (flujo clásico)
    // ════════════════════════════════════════════════════════════════
    void isSeller;

    // Solo se puede cancelar antes del envío
    const cancellable = ["pending_payment", "verifying_payment"].includes(
      order.status,
    );
    if (!cancellable) {
      return res.status(400).json({
        success: false,
        message: `No se puede cancelar la orden en estado: ${order.status}`,
      });
    }

        /* ════════════════════════════════════════════════════════════════
       PUNTO 1: 'pending_payment' pero el comprador indica que SÍ abonó.
       Como la orden aún figura sin pago notificado en la plataforma, primero
       la marcamos como pagada (flujo estándar → 'verifying_payment') y recién
       ahí continuamos al flujo de reembolso que viene más abajo (Caso B).
       Esto evita preguntarle genéricamente si pagó: si declara haber pagado
       en 'pending_payment', lo notificamos en el sistema.
       ════════════════════════════════════════════════════════════════ */
        if (order.status === "pending_payment" && paidStatus === "paid") {
      order.status = "verifying_payment";
      order.verifyingPaymentNotifiedAt = order.verifyingPaymentNotifiedAt || new Date();
      order.paymentVerifiedAt = new Date();
      order.statusHistory.push({
        status: "verifying_payment",
        changedAt: new Date(),
        comment:
          "Comprador notificó el pago al cancelar. Se continúa con la solicitud de reembolso.",
      });

      const pvOrderSeller = await User.findById(order.seller);
      if (pvOrderSeller?.email)
        sendPaymentConfirmedToVendor({
          vendorEmail: pvOrderSeller.email,
          orderId: order._id,
          amount: order.totalAmount,
        }).catch(() => {});
      if (pvOrderSeller) {
        createNotification({
          recipient: pvOrderSeller._id,
          type: "payment_confirmed",
          title: "El comprador notificó el pago",
          message: `Se reportó el pago de la orden #${order._id.toString().slice(-6).toUpperCase()} al iniciar una cancelación.`,
          data: { orderId: order._id, totalAmount: order.totalAmount },
        }).catch(() => {});
      }
      // No retornamos acá: seguimos al flujo de reembolso (Caso B) ya que el
      // comprador pidió cancelar habiendo abonado.
    }

    /* ════════════════════════════════════════════════════════════════
       Caso A (sub-caso "no pagué"): 'pending_payment' y el comprador dice NO
       haber abonado.

       FASE 1 (liberación 100% MANUAL): el comprador YA NO libera la garantía
       por sí mismo. Aunque declare no haber pagado, NO puede disparar un
       movimiento irreversible de fondos. La cancelación se REGISTRA como
       solicitud al admin y la orden se marca 'cancelled' a nivel DB; el admin,
       tras verificar que efectivamente no hubo pago, libera la garantía
       on-chain (adminReleaseGuarantee).

       Excepción: si la orden TODAVÍA no tiene garantía congelada (hold sin
       concretar / lock inexistente), no hay nada que liberar → se cierra
       directo, sin intervención humana (no se mueve dinero).
       ════════════════════════════════════════════════════════════════ */
    if (order.status === "pending_payment" && paidStatus !== "paid") {
      const seller = await User.findById(order.seller);
      const hasCollateral =
        Boolean(order.collateralTxHash) ||
        Boolean(order.collateralHold?.status === "fulfilled");
      const hasWallet = Boolean(seller?.walletAddress);

      // Sin garantía congelada → no se mueve dinero on-chain: cierre directo.
      if (!hasCollateral || !hasWallet) {
        order.status = "cancelled";
        order.pendingRequest.exists = false;
        order.cancelledBy = "buyer";
        order.cancelledAt = new Date();
        order.statusHistory.push({
          status: "cancelled",
          changedAt: new Date(),
          comment: `Cancelada por el comprador (sin pago notificado y sin garantía congelada). ${reason || ""}`.trim(),
        });
        order.orderActions.push({
          type: "cancel_executed",
          initiator: "buyer",
          paidStatus: "not_paid",
          status: "completed",
          reason: reason || "Cancelación por el comprador sin pago notificado (sin garantía on-chain).",
          createdBy: order.buyer,
        });
        await order.save();

        // LIBERAR la reserva de recompensas (orden cancelada sin completarse).
        await releaseOrderRewardsReservation(order, { reason: "cancelada sin pago" });

        await User.findByIdAndUpdate(order.buyer, {
          $inc: { "accounting.cancellationsAsBuyer": 1 },
        });

        const orderBuyer0 = await User.findById(order.buyer);
        const orderSeller0 = await User.findById(order.seller);
        if (orderBuyer0?.email)
          sendOrderCancelledToBuyer({
            buyerEmail: orderBuyer0.email,
            orderId: order._id,
            amount: order.totalAmount,
            withRefund: false,
          }).catch(() => {});
        if (orderSeller0?.email)
          sendOrderCancelledToVendor({
            vendorEmail: orderSeller0.email,
            orderId: order._id,
            amount: order.totalAmount,
            withRefund: false,
          }).catch(() => {});
        createNotification({
          recipient: order.seller,
          type: "order_cancelled",
          title: "Orden cancelada",
          message: `La orden #${order._id.toString().slice(-6).toUpperCase()} fue cancelada por el comprador sin que se notificara un pago.`,
          data: { orderId: order._id },
        }).catch(() => {});

        return res.status(200).json({
          success: true,
          message: "Orden cancelada (sin garantía congelada). No se movió dinero on-chain.",
          order,
        });
      }

      // HAY garantía congelada → NO liberamos. Registramos solicitud al admin.
      order.status = "cancelled";
      order.pendingRequest.exists = false;
      order.cancelledBy = "buyer";
      order.cancelledAt = new Date();
      // Dejamos una solicitud de liberación de garantía al admin para que
      // verifique que no hubo pago y libere el colateral del vendedor.
      order.releaseRequest = {
        exists: true,
        requestedBy: order.buyer,
        reason:
          "El comprador canceló declarando no haber pagado. El admin debe verificar y liberar la garantía del vendedor.",
        status: "pending",
        createdAt: new Date(),
      };
      order.statusHistory.push({
        status: "cancelled",
        changedAt: new Date(),
        comment: `Cancelada por el comprador (sin pago notificado). Garantía retenida hasta liberación manual del admin. ${reason || ""}`.trim(),
      });
      order.orderActions.push({
        type: "cancel_request",
        initiator: "buyer",
        paidStatus: "not_paid",
        status: "pending",
        reason:
          (reason || "Cancelación por el comprador sin pago notificado") +
          " — liberación de garantía pendiente de aprobación del admin.",
        createdBy: order.buyer,
      });
      await order.save();

      // LIBERAR la reserva de recompensas (orden cancelada sin completarse).
      // El saldo del comprador vuelve a estar disponible (no se descuenta hasta
      // que efectivamente se complete una compra).
      await releaseOrderRewardsReservation(order, { reason: "cancelada por comprador" });

      // Contadores
      await User.findByIdAndUpdate(order.buyer, {
        $inc: { "accounting.cancellationsAsBuyer": 1 },
      });

      // Notificar al ADMIN (cola de pendientes) + a ambas partes.
      const adminUser = await findAdminUser(User);
      if (adminUser) {
        createNotification({
          recipient: adminUser._id,
          type: "order_admin_release_request",
          title: "Liberación de garantía pendiente",
          message: `El comprador canceló la orden #${order._id
            .toString()
            .slice(-6)
            .toUpperCase()} declarando no haber pagado. Verificá y liberá la garantía del vendedor (release-guarantee).`,
          data: { orderId: order._id },
        }).catch(() => {});
      }

      const orderBuyer = await User.findById(order.buyer);
      const orderSeller = await User.findById(order.seller);
      if (orderBuyer?.email)
        sendOrderCancelledToBuyer({
          buyerEmail: orderBuyer.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch(() => {});
      if (orderSeller?.email)
        sendOrderCancelledToVendor({
          vendorEmail: orderSeller.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch(() => {});
            createNotification({
        recipient: order.seller,
        type: "order_cancelled",
        title: "Orden cancelada",
        message: `La orden #${order._id.toString().slice(-6).toUpperCase()} fue cancelada por el comprador. Tu garantía sigue retenida y será liberada por el admin tras verificar. Si ya te pagó, subí evidencia a soporte.`,
        data: { orderId: order._id },
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message:
          "Cancelación registrada. La garantía del vendedor queda retenida hasta que el admin verifique y la libere.",
        order,
      });
    }

    /* ── Caso B: 'verifying_payment' → el comprador YA notificó su pago.
       NO se puede liberar la garantía. Se retiene hasta que el vendedor
       reembolse y el comprador confirme haber recibido el reintegro. ── */
    if (!refundBankAccount || !refundBankAccount.cbuCvu) {
      return res.status(400).json({
        success: false,
        message:
          "Para cancelar habiendo pagado, debés ingresar los datos bancarios donde recibir el reembolso.",
      });
    }

    order.pendingRequest = {
      exists: true,
      initiator: "buyer",
      paidStatus: "paid",
      status: "pending", // pendiente de que el vendedor reembolse
      reason: reason || "",
      refundBankAccount: {
        bankName: refundBankAccount.bankName || "",
        holderName: refundBankAccount.holderName || "",
        cbuCvu: refundBankAccount.cbuCvu,
        alias: refundBankAccount.alias || "",
        cuitCuil: refundBankAccount.cuitCuil || "",
        accountType: refundBankAccount.accountType || "",
      },
      createdAt: new Date(),
    };
    order.orderActions.push({
      type: "refund_request",
      initiator: "buyer",
      paidStatus: "paid",
      status: "pending",
      reason: reason || "Cancelación con pago - solicitud de reembolso",
      refundBankAccount: order.pendingRequest.refundBankAccount,
      createdBy: order.buyer,
    });
    await order.save();

    // Contadores
    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.refundsRequested": 1 },
    });

    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (sellerUsr?.email) {
      sendRefundRequestedToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        buyerName: buyer?.firstName || buyer?.username || "El comprador",
      }).catch(() => {});
    }
    createNotification({
      recipient: order.seller,
      type: "order_refund_requested",
      title: "El comprador solicitó cancelar con pago",
      message: `Se registró una solicitud de cancelación con pago para la orden #${order._id.toString().slice(-6).toUpperCase()}. Deberás reembolsar al comprador y luego confirmarlo.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Solicitud de cancelación registrada. La garantía queda retenida hasta que reembolses al comprador y éste confirme la recepción.",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar orden:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CONFIRMAR REEMBOLSO (Solo el VENDEDOR)
 * Se llama cuando el vendedor ya devolvió el dinero al comprador.
 * Cierra la cancelación: libera su colateral y pone la orden en 'cancelled'.
 */
/**
 * VENDEDOR CONFIRMA QUE REEMBOLSÓ al comprador (solo vendedor).
 * Actualiza el estado de la solicitud a "refunded_by_vendor" y notifica al
 * comprador para que confirme la recepción del reintegro.
 * La garantía sigue retenida.
 */
const vendorConfirmsRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.seller.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el vendedor puede confirmar que reembolsó" });
    }

    if (
      !order.pendingRequest?.exists ||
      order.pendingRequest.paidStatus !== "paid"
    ) {
      return res.status(400).json({
        success: false,
        message: "No hay una solicitud de reembolso pendiente en esta orden.",
      });
    }
    if (order.pendingRequest.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Este reembolso ya fue completado.",
      });
    }

    order.pendingRequest.status = "refunded_by_vendor";
    order.orderActions.push({
      type: "refund_confirmed",
      initiator: "seller",
      paidStatus: "paid",
      status: "pending",
      reason: "El vendedor confirmó haber reembolsado al comprador.",
      createdBy: order.seller,
    });
    await order.save();

    const buyer = await User.findById(order.buyer);
    createNotification({
      recipient: order.buyer,
      type: "order_refund_paid_by_vendor",
      title: "El vendedor te reembolsó",
      message: `El vendedor confirmó el reembolso de la orden #${order._id.toString().slice(-6).toUpperCase()}. Verificá la acreditación y confirmá la recepción del reintegro para cerrar la cancelación y liberar la garantía.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Reembolso marcado como realizado por el vendedor.",
      order,
    });
  } catch (error) {
    console.error("Error al confirmar reembolso del vendedor:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * COMPRADOR CONFIRMA QUE RECIBIÓ el reintegro (solo comprador).
 * Es la confirmación final que permite liberar la garantía y cerrar la
 * cancelación. Solo se permite si el vendedor ya confirmó que reembolsó.
 */
const buyerConfirmsRefundReceived = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.buyer.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el comprador puede confirmar la recepción del reintegro" });
    }

    if (
      !order.pendingRequest?.exists ||
      order.pendingRequest.paidStatus !== "paid"
    ) {
      return res.status(400).json({
        success: false,
        message: "No hay una solicitud de reembolso pendiente en esta orden.",
      });
    }
    if (order.pendingRequest.status !== "refunded_by_vendor") {
      return res.status(400).json({
        success: false,
        message:
          "El vendedor todavía no confirmó que te reembolsó. Esperá a que lo haga.",
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // FASE 1 (liberación 100% MANUAL): el comprador confirma que RECIBIÓ el
    // reintegro, pero NO dispara la liberación de la garantía. Marcamos la
    // solicitud como "refunded_by_vendor" y creamos una solicitud al admin
    // para liberar el colateral del vendedor (verificación prudencial antes
    // de mover fondos on-chain). El admin cierra con adminReleaseGuarantee.
    // ════════════════════════════════════════════════════════════════════
    order.pendingRequest.status = "refunded_by_vendor";
    // Solicitud de liberación de garantía para el admin.
    order.releaseRequest = {
      exists: true,
      requestedBy: order.buyer,
      reason:
        "El comprador confirmó haber recibido el reintegro. El admin debe liberar la garantía del vendedor.",
      status: "pending",
      createdAt: new Date(),
    };
    order.statusHistory.push({
      status: order.status,
      changedAt: new Date(),
      comment:
        "El comprador confirmó haber recibido el reintegro. Garantía pendiente de liberación manual por el admin.",
    });
    order.orderActions.push({
      type: "refund_confirmed",
      initiator: "buyer",
      paidStatus: "paid",
      status: "pending",
      reason:
        "El comprador confirmó haber recibido el reintegro. Liberación de garantía pendiente del admin.",
      createdBy: order.buyer,
    });
    await order.save();

    await User.findByIdAndUpdate(order.seller, {
      $inc: { "accounting.refundsPending": -1 },
    });

    // Notificar al ADMIN (cola de pendientes) + al vendedor.
    const adminUser = await findAdminUser(User);
    if (adminUser) {
      createNotification({
        recipient: adminUser._id,
        type: "order_admin_release_request",
        title: "Liberación de garantía pendiente (reembolso)",
        message: `El comprador confirmó recibir el reintegro de la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()}. Liberá la garantía del vendedor (release-guarantee).`,
        data: { orderId: order._id },
      }).catch(() => {});
    }

    createNotification({
      recipient: order.seller,
      type: "order_refund_received",
      title: "El comprador confirmó el reintegro",
      message: `El comprador confirmó recibir el reintegro de la orden #${order._id.toString().slice(-6).toUpperCase()}. El admin liberará tu garantía a la brevedad.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Confirmaste el reintegro. El admin liberará la garantía del vendedor (revisión manual).",
      order,
    });
  } catch (error) {
    console.error("Error al confirmar recepción de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * VENDEDOR SOLICITA al admin que libere su garantía manualmente.
 * Por seguridad, el vendedor no libera su colateral por sí mismo.
 * Notifica al admin y avisa al comprador.
 */
const requestAdminRelease = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.seller.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Solo el vendedor puede solicitar la liberación de su garantía" });
    }

    if (order.status === "cancelled" || order.status === "completed") {
      return res.status(400).json({
        success: false,
        message: `La orden ya está ${order.status}.`,
      });
    }

    if (!order.collateralTxHash) {
      return res.status(400).json({
        success: false,
        message: "Esta orden no tiene garantía congelada registrada.",
      });
    }

    if (order.releaseRequest?.exists) {
      return res.status(400).json({
        success: false,
        message: "Ya existe una solicitud de liberación de garantía en curso. Esperá la resolución del admin.",
      });
    }

    order.releaseRequest = {
      exists: true,
      requestedBy: order.seller,
      reason: reason || "",
      status: "pending",
      createdAt: new Date(),
    };
    order.orderActions.push({
      type: "admin_intervention",
      initiator: "seller",
      paidStatus: order.pendingRequest?.paidStatus || "unknown",
      status: "pending",
      reason:
        "El vendedor solicita la liberación manual de su garantía al admin. " +
        (reason || ""),
      createdBy: order.seller,
    });
    await order.save();

        // Notificar al admin (por mail e in-app si el admin existe en DB)
      const adminUser = await findAdminUser(User);
      if (adminUser) {
      createNotification({
        recipient: adminUser._id,
        type: "order_admin_release_request",
        title: "Solicitud de liberación de garantía",
        message: `El vendedor solicita liberar la garantía de la orden #${order._id.toString().slice(-6).toUpperCase()}. Revisala en el panel de admin.`,
        data: { orderId: order._id },
      }).catch(() => {});

            // Email al admin para resolución rápida
      if (adminUser.email) {
        const [sellerInfo, buyerInfo] = await Promise.all([
          User.findById(order.seller),
          User.findById(order.buyer),
        ]);
        sendAdminCancellationRequest({
          adminEmail: adminUser.email,
          orderId: order._id,
          amount: order.totalAmount,
          sellerName:
            sellerInfo?.username ||
            sellerInfo?.firstName ||
            "El vendedor",
          buyerName:
            buyerInfo?.firstName || buyerInfo?.username || "El comprador",
          reason: reason || "",
        }).catch((err) =>
          console.error("Falló email de solicitud de cancelación al admin:", err),
        );
      }
    }

    // Notificar al comprador que el vendedor pidió liberar
    createNotification({
      recipient: order.buyer,
      type: "order_release_requested_to_admin",
      title: "El vendedor solicitó liberar su garantía",
      message: `El vendedor solicitó al admin la liberación de la garantía de la orden #${order._id.toString().slice(-6).toUpperCase()}. Si no abonaste o ya recibiste tu reintegro, la plataforma te contactará para confirmarlo.`,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Solicitud enviada al admin. La garantía se liberará manualmente luego de verificar con el comprador.",
      order,
    });
  } catch (error) {
    console.error("Error al solicitar liberación de garantía:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN COMPLETA la orden tras el buffer de seguridad (solo admin).
 *
 * FASE 1: es el ÚNICO camino que libera la garantía de una orden que el
 * comprador dio por recibida. Reemplaza al release automático que antes hacía
 * el comprador en updateOrder. Requisitos:
 *   - La orden debe estar en "reception_confirmed" (el comprador ya confirmó).
 *   - Debe haberse cumplido el buffer (`releaseEligibleAt`). Se puede forzar con
 *     `force: true` (queda registrado en orderActions para auditoría).
 * Efecto:
 *   - Transferencia bancaria → libera el colateral (con fee) → "completed".
 *   - Crypto (escrow)        → libera el escrow (releaseOrder) → "completed".
 *   - Compra grupal          → no re-libera escrow (ya se liberó al cerrar el
 *     pool); solo cierra la orden en la DB.
 * Acredita cashback + referral y actualiza métricas (paridad con el flujo
 * anterior) una sola vez, al completar.
 */
const adminCompleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { note, force } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "La orden ya está completada.",
      });
    }
    if (order.status !== "reception_confirmed") {
      return res.status(400).json({
        success: false,
        message: `La orden debe estar en 'reception_confirmed' para completarla (estado actual: ${order.status}).`,
      });
    }
    if (order.dispute?.exists && order.dispute.status === "open") {
      return res.status(409).json({
        success: false,
        message:
          "Hay una disputa abierta en esta orden. Resolvela antes de liberar la garantía.",
      });
    }

    // GUARDIA DEL BUFFER: no se libera antes de cumplirse el período de seguridad
    // salvo que el admin fuerce explícitamente (queda auditado).
    const now = new Date();
    const bufferReached =
      !order.releaseEligibleAt || order.releaseEligibleAt <= now;
    if (!bufferReached && force !== true) {
      return res.status(409).json({
        success: false,
        code: "BUFFER_NOT_REACHED",
        releaseEligibleAt: order.releaseEligibleAt,
        message: `El período de seguridad todavía no se cumplió (liberable desde ${new Date(order.releaseEligibleAt).toLocaleString("es-AR")}). Usá force:true para omitirlo (queda registrado).`,
      });
    }

    const seller = await User.findById(order.seller);
    const isCrypto = order.payment?.method === "crypto";

    // ── Liberación on-chain según el método de pago ──
    let txHash = "";
    if (isCrypto) {
      if (order.payment?.groupBuy === true) {
      // Compra grupal (escrow individual NeroEscrow, precio escalonado).
      // Cerramos la orden on-chain repartiendo lo fondeado: vendedor (neto),
      // fee y el REINTEGRO escalonado al comprador (locked - final*units).
      if (order.payment?.status !== "funded") {
        // Ya liberada/reembolsada (p.ej. grupo de 1 comprador) → solo DB.
        txHash = order.payment?.releaseTxHash || "";
        order.payment.status = "released";
        order.payment.releasedAt = order.payment.releasedAt || now;
      } else {
        const amountEscrow = Number(order.payment?.amountUsdRetained || 0);
        const refundAmount = Number(order.groupBuy?.refundUsd || 0);
        const feeAmount = Number(order.financials?.platformFeeUsd || 0);
        const sellerAmount = Number(
          (amountEscrow - feeAmount - refundAmount).toFixed(2),
        );
        if (sellerAmount < 0 || refundAmount < 0 || feeAmount < 0) {
          return res.status(400).json({
            success: false,
            message:
              "Los montos del settle grupal son inválidos (revisá el precio final/reintegro).",
          });
        }
        const { settleOrderEscrow } = await import("../services/escrowServices.js");
        const settleRes = await settleOrderEscrow(
          order._id.toString(),
          { sellerAmount, feeAmount, refundAmount },
          order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID,
        );
        if (!settleRes.success) {
          return res.status(500).json({
            success: false,
            message: "No se pudo liquidar el escrow grupal on-chain.",
            error: settleRes.error,
          });
        }
        txHash = settleRes.txHash || "";
        order.payment.status = "released";
        order.payment.releaseTxHash = txHash;
        order.payment.feeUsd = feeAmount;
        order.payment.sellerNetUsd = sellerAmount;
        order.payment.releasedAt = now;
        order.groupBuy.refunded = refundAmount > 0;
        order.groupBuy.refundTxHash = txHash;
        order.groupBuy.refundedAt = refundAmount > 0 ? now : order.groupBuy.refundedAt;
      }

    } else {
        if (order.payment?.status !== "funded") {
          return res.status(400).json({
            success: false,
            message:
              "El escrow no está fondeado on-chain. Verificá que el comprador haya depositado los USDT antes de completar la orden.",
          });
        }
        const { releaseOrderEscrow } = await import("../services/escrowServices.js");
        const escrowResult = await releaseOrderEscrow(
          order._id.toString(),
          order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID,
        );
        if (!escrowResult.success) {
          return res.status(500).json({
            success: false,
            message: "No se pudo liberar el escrow on-chain.",
            error: escrowResult.error,
          });
        }
        txHash = escrowResult.txHash;
        order.payment.status = "released";
        order.payment.releaseTxHash = txHash;
        order.payment.feeUsd = order.financials.platformFeeUsd;
        order.payment.sellerNetUsd = order.financials.sellerNetReleaseUsd;
        order.payment.releasedAt = now;
      }
    } else {
      if (!seller || !seller.walletAddress) {
        return res.status(400).json({
          success: false,
          message:
            "El vendedor no tiene wallet asociada para liberar el colateral.",
        });
      }
      // Liberación idempotente: si on-chain el lock ya no existe, no reenviamos tx.
      const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;
      const lockState = await getOrderLock(order._id.toString(), chainId);
      const alreadyReleased =
        !lockState.success || (lockState.success && lockState.lockUsd === 0);
      if (alreadyReleased) {
        txHash = order.releaseTxHash || "";
      } else {
        // Fee TOTAL (base 3% + reward de referidos) en un solo saque on-chain.
        txHash = await executeBlockchainRelease(
          order,
          seller.walletAddress,
          order.financials.platformFeeUsd,
        );
      }
    }

    // ── Cierre en la DB ──
    order.status = "completed";
    order.completedAt = now;
    order.releaseTxHash = txHash || order.releaseTxHash;
    order.statusHistory.push({
      status: "completed",
      changedAt: now,
      comment: `Liberación manual por el admin tras el período de seguridad. ${note || ""}`.trim(),
    });
    order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: isCrypto ? "paid" : "paid",
      status: "completed",
      reason:
        (force === true && !bufferReached
          ? "El admin completó la orden FORZANDO el período de seguridad. "
          : "El admin liberó la garantía tras cumplirse el período de seguridad. ") +
        (note || ""),
      releaseTxHash: txHash || undefined,
      createdBy: req.user?._id,
    });

    // CASHBACK (idempotente; no bloquea si falla).
    try {
      const cashbackResult = await accrueCashbackForOrder(order);
      if (cashbackResult.applied) {
        console.log(
          `[Cashback] Orden ${order._id} generó US$ ${cashbackResult.earnedUsd} de cashback para el comprador.`,
        );
      }
    } catch (cashbackErr) {
      console.error(
        `[Cashback] Fallo no crítico al acreditar cashback en orden ${order._id}:`,
        cashbackErr.message,
      );
    }

    // REFERRAL (idempotente; no bloquea si falla).
    try {
      const referralResult = await accrueReferralForOrder(order);
      if (referralResult.applied) {
        console.log(
          `[Referral] Orden ${order._id} acreditó el referral (reparto: ${JSON.stringify(referralResult.split)})`,
        );
      }
    } catch (referralErr) {
      console.error(
        `[Referral] Fallo no crítico al acreditar referral en orden ${order._id}:`,
        referralErr.message,
      );
    }

    // RECOMPENSAS (idempotente; no bloquea si falla).
    // ACÁ se materializa el consumo del saldo de recompensas que se había
    // RESERVADO al crear la orden, y se acredita el SellerCredit al vendedor.
    // Este es el ÚNICO punto donde se mueve el saldo de recompensas del
    // comprador (antes se hacía al crear la orden, lo que causaba pérdida de
    // saldo en órdenes fallidas y permitía doble uso).
    await commitRewardsOnComplete(order);

    await order.save();

    // ── Métricas de venta/compras + stock (una sola vez) ──
    await User.findByIdAndUpdate(order.seller, {
      $inc: { "accounting.completedSales": 1, "shop.totalSalesCount": 1 },
    });
    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.completedPurchases": 1 },
    });
    const isGroupBuyOrder = order.groupBuy?.poolId || order.isGroupBuy === true;
    for (const item of order.itemsSnapshot) {
      const qty = item.quantity || 1;
      if (isGroupBuyOrder && order.groupBuy?.stockConsumed) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { sold: qty } });
      } else {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { sold: qty, stock: -qty },
        });
      }
    }

    // ── Notificaciones de cierre ──
    const shortId = order._id.toString().slice(-6).toUpperCase();
    if (seller?.email) {
      sendOrderCompletedToVendor({
        vendorEmail: seller.email,
        orderId: order._id,
        amount: order.totalAmount,
      }).catch(() => {});
    }
    createNotification({
      recipient: order.seller,
      type: "order_completed",
      title: "¡Venta completada y fondos liberados!",
      message: `El período de seguridad de la orden #${shortId} finalizó y se liberó tu garantía.`,
      data: { orderId: order._id, totalAmount: order.totalAmount },
    }).catch(() => {});

    const buyer = await User.findById(order.buyer);
    if (buyer?.email) {
      sendOrderCompletedToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
      }).catch(() => {});
    }
    if (buyer) {
      createNotification({
        recipient: buyer._id,
        type: "order_completed",
        title: "¡Compra completada!",
        message: `La orden #${shortId} fue completada. La protección de comprador a finalizado. ¡Gracias por tu compra!`,
        data: { orderId: order._id, totalAmount: order.totalAmount },
      }).catch(() => {});
      createNotification({
        recipient: buyer._id,
        type: "rating_reminder",
        title: "Calificá al vendedor",
        message: `¿Recomendás a este vendedor? Dejá tu calificación (👍/👎) en la orden #${shortId}.`,
        data: { orderId: order._id, ratingType: "seller_rating" },
      }).catch(() => {});
    }
    if (seller) {
      createNotification({
        recipient: seller._id,
        type: "rating_reminder",
        title: "Calificá al comprador",
        message: `La venta #${shortId} se completó. Dejá tu calificación (👍/👎) sobre el comprador.`,
        data: { orderId: order._id, ratingType: "buyer_rating" },
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Orden completada y garantía liberada por el admin.",
      order,
      releaseTxHash: txHash || null,
    });
  } catch (error) {
    console.error("Error al completar orden (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN LIBERA la garantía manualmente (solo admin).
 * Resuelve la solicitud del vendedor tras verificar con el comprador.
 * Cierra la orden como cancelada y libera el colateral del vendedor.
 */
const adminReleaseGuarantee = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { approve, note } = req.body; // approve: boolean

        const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

        // Permite liberar la garantía manualmente incluso si la orden ya fue
    // cancelada por el admin (flujo: cancelar primero → luego liberar).
    // Se bloquea si la venta se completó. El guard por `releaseTxHash` ya NO
    // existe porque es un FALSO POSITIVO: hubo casos donde una tx se minó y el
    // hash quedó registrado, pero el colateral REALMENTE siguió congelado en el
    // contrato (firma/fee distinto). Por eso primero verificamos on-chain el
    // estado real del lock antes de decidir si hace falta (re)liberar.
    if (order.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "La orden está completada; no se puede liberar la garantía.",
      });
    }

    // Red donde se congeló el colateral de esta orden (persistida al lockear).
    const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;

    // Verificación on-chain del lock real. Si el lock ya no existe (liberado de
    // verdad), la liberación es idempotente y solo registramos la acción.
    const lockState = await getOrderLock(order._id.toString(), chainId);
    const alreadyReleasedOnChain =
      !lockState.success || (lockState.success && lockState.lockUsd === 0);

    if (!approve) {
      if (!order.releaseRequest) order.releaseRequest = {};
      if (!order.releaseRequest.exists) order.releaseRequest.exists = true;
      order.releaseRequest.status = "declined";
      order.orderActions.push({
        type: "admin_intervention",
        initiator: "admin",
        paidStatus: "unknown",
        status: "rejected",
        reason: note || "El admin declinó la solicitud de liberación de garantía.",
        createdBy: req.user?._id,
      });
      await order.save();
      return res.json({
        success: true,
        message: "Solicitud de liberación rechazada.",
        order,
      });
    }

        const seller = await User.findById(order.seller);
    if (!seller || !seller.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene wallet asociada para liberar colateral.",
      });
    }

    // Liberación idempotente: si on-chain el lock ya no existe (liberado de
    // verdad), no re-intentamos la tx (el contrato la rechazaría con
    // "No hay saldo bloqueado"). Solo registramos la acción en la DB.
    let releaseTxHash = "";
    if (alreadyReleasedOnChain) {
      releaseTxHash = order.releaseTxHash || "";
      console.log(
        `[Admin] La orden ${order._id} ya estaba liberada on-chain (lock=0). Solo se registra la acción localmente.`,
      );
    } else {
      const blockchainResult = await cancelVendorCollateral(
        order._id.toString(),
        seller.walletAddress,
        chainId,
      );
      if (!blockchainResult.success) {
        return res.status(500).json({
          success: false,
          message: "No se pudo liberar el colateral en la blockchain.",
          error: blockchainResult.error,
        });
      }
      releaseTxHash = blockchainResult.txHash;
    }

        order.status = "cancelled";
    order.releaseTxHash = releaseTxHash;
    order.cancelledBy = "admin";
    if (!order.releaseRequest) order.releaseRequest = {};
    if (!order.releaseRequest.exists) order.releaseRequest.exists = true;
    order.releaseRequest.status = "approved_released";
    order.releaseRequest.resolvedAt = new Date();
    order.pendingRequest.exists = false;
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: `Garantía liberada manualmente por el admin. ${note || ""}`.trim(),
    });
        order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "unknown",
      status: "completed",
      reason:
        note ||
        "El admin liberó la garantía del vendedor manualmente tras verificación.",
      releaseTxHash: releaseTxHash || undefined,
      createdBy: req.user?._id,
    });
    await order.save();

    // LIBERAR la reserva de recompensas: el admin cierra la orden como
    // cancelada (venta no completada), así que el saldo del comprador vuelve a
    // estar disponible.
    await releaseOrderRewardsReservation(order, { reason: "garantía liberada por admin" });

    // Notificar a ambas partes
    const buyer = await User.findById(order.buyer);
    const sellerUsr = await User.findById(order.seller);
    if (buyer?.email)
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    if (sellerUsr?.email)
      sendOrderCancelledToVendor({
        vendorEmail: sellerUsr.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
        createNotification({
      recipient: order.seller,
      type: "order_guarantee_released",
      title: "Tu garantía fue liberada",
      message: `El admin liberó tu garantía de la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating entre vendedor y comprador (cancelación por admin).
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});
    createNotification({
      recipient: order.buyer,
      type: "rating_reminder",
      title: "Calificá al vendedor",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el vendedor en la página de la orden.`,
      data: { orderId: order._id, ratingType: "seller_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Garantía liberada y orden cancelada por el admin.",
      order,
    });
    } catch (error) {
    console.error("Error al liberar garantía (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN VERIFICA el estado REAL del colateral de una orden on-chain y lo
 * contrasta con lo que la DB cree (releaseTxHash / status).
 *
 * Es la primera acción que debe hacer el admin ante una orden "cancelada pero
 * con colateral congelado": ver si el lock aún existe en el contrato y cuánto
 * tiene bloquedo el vendedor, para decidir si hace falta (re)liberar.
 */
const adminGetCollateralStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const seller = await User.findById(order.seller);
    if (!seller || !seller.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene wallet asociada. No se puede verificar el colateral.",
      });
    }

    // Red donde se congeló el colateral de esta orden (persistida al lockear).
    const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;

    // Lectura on-chain en paralelo: lock de la orden y estado del vendedor.
    const [orderLock, vendor] = await Promise.all([
      getOrderLock(order._id.toString(), chainId),
      getVendorCollateral(seller.walletAddress, chainId),
    ]);

    const lockStillActive =
      orderLock.success === true && orderLock.lockUsd > 0;
    const dbBelievesReleased = Boolean(order.releaseTxHash);

    const reconciled = !lockStillActive; // on-chain no tiene lock = está liberado

    return res.status(200).json({
      success: true,
      orderId: order._id,
      orderStatus: order.status,
      collateralTxHash: order.collateralTxHash,
      releaseTxHash: order.releaseTxHash || null,
      db: {
        believesReleased: dbBelievesReleased,
        believesLocked: !dbBelievesReleased,
      },
      onChain: {
        orderLockUsd: orderLock.success ? orderLock.lockUsd : null,
        orderLockActive: lockStillActive,
        vendorTotalCollateral: vendor.success ? vendor.totalCollateral : null,
        vendorLockedCollateral: vendor.success ? vendor.lockedCollateral : null,
        vendorAvailable: vendor.success ? vendor.available : null,
      },
      reconciled,
      resolucion_requerida:
        lockStillActive
          ? "El colateral SIGUE congelado on-chain. Usá 'release_guarantee' para liberarlo (o el botón 'Liberar Garantía (Admin)' que ahora está disponible aunque exista releaseTxHash)."
          : "El colateral YA está liberado on-chain. Solo resta alinear la DB (la orden puede marcarse como cancelada si corresponde).",
    });
  } catch (error) {
    console.error("Error al verificar estado del colateral (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN CANCELA la orden manualmente (solo admin).
 * A diferencia de "adminReleaseGuarantee", acá SOLO se marca la orden como
 * cancelada SIN liberar la garantía. La liberación sigue siendo un paso
 * manual independiente: el admin primero cancela y, tras verificar con el
 * comprador que no hubo pago (o que recibió su reintegro), libera el
 * colateral recién con "release-guarantee".
 */
const adminCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (["cancelled", "completed", "expired"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `La orden ya está ${order.status}.`,
      });
    }

        order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = "admin";
    // Cerramos cualquier solicitud en curso (reembolso / liberación) sin
    // tocar el colateral: eso se resuelve por separado con la liberación.
    if (order.pendingRequest?.exists) {
      order.pendingRequest.status = "completed";
      order.pendingRequest.exists = false;
    }
    if (order.releaseRequest?.exists) {
      order.releaseRequest.status = "resolved_by_cancel";
    }
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: "Cancelada manualmente por el admin.",
    });
    order.orderActions.push({
      type: "admin_cancel",
      initiator: "admin",
      paidStatus: "unknown",
      status: "completed",
      reason: "El admin canceló la orden manualmente (liberación de garantía pendiente y manual).",
      createdBy: req.user?._id,
    });
    await order.save();

    // LIBERAR la reserva de recompensas (orden cancelada sin completarse).
    await releaseOrderRewardsReservation(order, { reason: "cancelada por admin" });

    // Notificar a ambas partes
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);
    if (buyer?.email) {
      sendOrderCancelledToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    }
    if (seller?.email) {
      sendOrderCancelledToVendor({
        vendorEmail: seller.email,
        orderId: order._id,
        amount: order.totalAmount,
        withRefund: false,
      }).catch(() => {});
    }
    createNotification({
      recipient: order.buyer,
      type: "order_cancelled",
      title: "Tu compra fue cancelada",
      message: `El admin canceló la orden #${order._id.toString().slice(-6).toUpperCase()}.`,
      data: { orderId: order._id },
    }).catch(() => {});
        createNotification({
      recipient: order.seller,
      type: "order_cancelled",
      title: "Tu venta fue cancelada",
      message: `El admin canceló la orden #${order._id.toString().slice(-6).toUpperCase()}. La liberación de tu garantía se gestiona aparte.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating mutuo (cancelación por admin).
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});
    createNotification({
      recipient: order.buyer,
      type: "rating_reminder",
      title: "Calificá al vendedor",
      message: `La orden #${order._id.toString().slice(-6).toUpperCase()} se canceló. Dejá tu calificación (👍/👎) sobre el vendedor en la página de la orden.`,
      data: { orderId: order._id, ratingType: "seller_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Orden cancelada por el admin. La garantía sigue retenida y se libera manualmente aparte.",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar orden (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * REINTENTAR COLATERAL (estado "awaiting_collateral" → "pending_payment").
 * Se llama cuando el vendedor deposita la garantía y quiere activar la orden.
 * La pueden invocar:
 *   - El VENDEDOR de la orden (tras depositar, pulsa "Deposité, activar orden").
 *   - El ADMIN (si verifica que el depósito se hizo y lo activa manualmente).
 *
 * Delega la lógica en resolveCollateralHold (idempotente y a prueba de
 * concurrencia: solo una llamada "gana" y crea el lock on-chain).
 */
const retryCollateral = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.status !== "awaiting_collateral") {
      return res.status(400).json({
        success: false,
        message: `La orden ya no está esperando colateral (estado actual: ${order.status}).`,
      });
    }

    const isSeller = order.seller.toString() === userId;
    const isAdmin = isAdminUser(req.user);
    if (!isSeller && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Solo el vendedor o el admin pueden activar el colateral de esta orden.",
      });
    }

    // Verificamos que el hold no haya vencido antes de intentar depositar.
    if (new Date(order.collateralHold.expiresAt) < new Date()) {
      // El hold venció. Lo marcamos como expirado (penalización al vendedor)
      // y avisamos que ya no se puede reactivar por esta vía.
      await expireCollateralHold(order);
      return res.status(409).json({
        success: false,
        message: "El plazo para depositar colateral ya venció. Esta solicitud de compra fue cancelada.",
        order,
      });
    }

    const result = await resolveCollateralHold(order._id.toString());

        if (!result.success) {
      // Mostramos el detalle (p. ej. saldo insuficiente en la wallet registrada)
      // si existe; si no, el mensaje genérico de reintento.
      const message =
        result.error && typeof result.error === "string"
          ? result.error
          : "No se pudo activar la orden. Revisá que hayas depositado la garantía (USDT) y reintentá.";
      return res.status(400).json({
        success: false,
        message,
        retryable: result.retryable !== false,
        insufficientFunds: result.insufficientFunds || false,
        error: result.error,
      });
    }

    // Notificar al comprador que su orden ya está activa.
    createNotification({
      recipient: order.buyer,
      type: "order_activated",
      title: "¡Tu compra fue activada!",
      message: `El vendedor depositó la garantía y tu orden #${order._id
        .toString()
        .slice(-6)
        .toUpperCase()} ya está lista para que la abones.`,
      data: { orderId: order._id, totalAmount: order.totalAmount },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Orden activada: el colateral fue congelado y ya podés proceder con el pago.",
      order: result.order,
      txHash: result.txHash,
    });
  } catch (error) {
    console.error("Error al reintentar colateral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CANCELAR UN HOLD DE COLATERAL ("buscar otro vendedor").
 * Cierra la orden en estado "awaiting_collateral" sin tocar blockchain
 * (en este estado todavía NO se congeló ningún colateral on-chain, la orden
 * recién pasa a reservar capacidad). La pueden invocar:
 *   - El COMPRADOR: decide no esperar más y buscar este producto en otro
 *     vendedor. Se marca como cancelada (no queda nada bloqueado).
 *   - El VENDEDOR: decide que no puede cubrir la garantía y libera el "hold"
 *     que tenía reservando capacidad (para no penalizar su cupo).
 */
const cancelCollateralHold = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.status !== "awaiting_collateral") {
      return res.status(400).json({
        success: false,
        message: `La orden no está en estado de espera de colateral (estado actual: ${order.status}).`,
      });
    }

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({
        success: false,
        message: "No tenés permisos para cancelar este hold de colateral.",
      });
    }

        // En "awaiting_collateral" no hay colateral on-chain congelado, así que no
    // hacemos transiciones a blockchain. Solo cerramos la orden como cancelada
    // y liberamos la reserva de capacidad del vendedor.
        order.collateralHold.status = "cancelled";
    order.collateralHold.cancelledAt = new Date();
    order.cancelledBy = isBuyer ? "buyer" : "seller";

    await transitionToStatus(
      order,
      "cancelled",
      isBuyer
        ? "El comprador canceló la espera de colateral y buscará este producto en otro vendedor."
        : "El vendedor no pudo cubrir la garantía de esta orden.",
    );

    // LIBERAR la reserva de recompensas (orden cerrada sin completarse). El
    // comprador recupera el saldo que había comprometido al crear la orden.
    await releaseOrderRewardsReservation(order, {
      reason: "hold de colateral cancelado",
    });

    // ══ CONTABILIZACIÓN (no penaliza; solo lleva la cuenta para que el admin
    //    decida qué hacer). Órdenes que no se concretan por falta de colateral
    //    del vendedor.
    //  - El VENDEDOR rechazó  → collateralRejectedBySeller (+1 al vendedor)
    //  - El COMPRADOR canceló → collateralHoldCancelledByBuyer (+1 al vendedor,
    //    ya que la inacción fue del vendedor, no culpa del comprador).
    if (isSeller) {
      await User.findByIdAndUpdate(order.seller, {
        $inc: { "accounting.collateralRejectedBySeller": 1 },
      });
    } else {
      await User.findByIdAndUpdate(order.seller, {
        $inc: { "accounting.collateralHoldCancelledByBuyer": 1 },
      });
    }

    // Si es el VENDEDOR quien rechaza, avisamos al comprador de inmediato para
    // que no quede esperando: notificación in-app + mail.
    if (isSeller) {
      const buyer = await User.findById(order.buyer);
      createNotification({
        recipient: order.buyer,
        type: "order_cancelled",
        title: "El vendedor rechazó tu orden",
        message: `El vendedor no pudo cubrir la garantía y rechazó la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()}. Buscá este producto en otro vendedor.`,
        data: { orderId: order._id },
      }).catch((err) =>
        console.error("Falló notif de rechazo al comprador:", err),
      );
      if (buyer?.email) {
        sendOrderCancelledToBuyer({
          buyerEmail: buyer.email,
          orderId: order._id,
          amount: order.totalAmount,
          withRefund: false,
        }).catch((err) =>
          console.error("Falló email de rechazo al comprador:", err),
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "La solicitud en espera de colateral fue cancelada. No se descontó ni se congeló nada.",
      order,
    });
  } catch (error) {
    console.error("Error al cancelar hold de colateral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/**
 * COMPRADOR REPORTA UN PROBLEMA con su pedido dispachado.
 * Marca la orden en estado DISPUTA: se congela la liberación del colateral
 * (on-chain si el dinero está bloqueado en el escrow de garantía) y se notifica
 * al admin para que lo resuelva manualmente. A partir de acá el comprador NO
 * puede marcar la orden como recibida hasta que el admin intervenga.
 */
/**
 * reportOrderIssue
 * Un USUARIO (comprador o vendedor) reporta un problema desde el detalle de
 * la orden. A diferencia de openDispute, NO cambia de estado la orden ni
 * congela colateral on-chain: es un simple aviso dirigido al ADMIN que queda
 * registrado en orderActions (tipo "claim"), visible en el timeline de la
 * orden. El admin lo lee y, si corresponde, lo cataloga como disputa y lo
 * resuelve a mano desde el panel.
 *
 * Body: { message }  (texto libre redactado por el usuario)
 * Disponible en cualquier estado de la orden (mientras participe).
 */
const reportOrderIssue = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const userId = req.user._id.toString();

    if (!message || !String(message).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Escribi una descripcion del problema." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res
        .status(403)
        .json({ message: "No tenes permisos para reportar un problema en esta orden." });
    }

    const reporterRole = isSeller ? "seller" : "buyer";
    const reporterRoleLabel = isSeller ? "vendedor" : "comprador";
    const cleanMessage = String(message).trim().slice(0, 2000);

    // Registrar el reporte en el timeline de la orden (tipo "claim").
    order.orderActions.push({
      type: "claim",
      initiator: reporterRole,
      paidStatus: "unknown",
      status: "completed",
      reason: "[Reporte de " + reporterRoleLabel + "] " + cleanMessage,
      createdBy: req.user._id,
    });
    await order.save();

    // Datos para el aviso.
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);
    const reporterUser = isSeller ? seller : buyer;
    const reporterName =
      [reporterUser?.firstName, reporterUser?.lastName].filter(Boolean).join(" ") ||
      reporterUser?.username ||
      reporterUser?.shop?.name ||
      "";

    const shortId = order._id.toString().slice(-6).toUpperCase();

    // Notificacion in-app al ADMIN.
    const adminUser = await findAdminUser(User);
    if (adminUser) {
      createNotification({
        recipient: adminUser._id,
        type: "order_issue_reported",
        title: "Problema reportado en una orden",
        message: "El " + reporterRoleLabel + (reporterName ? " " + reporterName : "") +
          " reporto un problema en la orden #" + shortId + ": \"" +
          cleanMessage.slice(0, 120) + (cleanMessage.length > 120 ? "..." : "") + "\"",
        data: { orderId: order._id },
      }).catch(() => {});

      // Email al ADMIN.
      if (adminUser.email) {
        sendAdminOrderIssueReport({
          adminEmail: adminUser.email,
          orderId: order._id,
          reporterRole: reporterRoleLabel,
          reporterName,
          orderStatus: order.status,
          amount: order.totalAmount,
          message: cleanMessage,
        }).catch(() => {});
      }
    } else {
      console.warn("[reportOrderIssue] No se encontro un usuario admin para notificar.");
    }

    return res.status(200).json({
      success: true,
      message:
        "Reporte enviado. Nuestro equipo lo revisara y se contactara con vos si necesita mas informacion.",
    });
  } catch (error) {
    console.error("Error al reportar problema de orden:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const openDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { issueType, description } = req.body;
    const userId = req.user._id.toString();

        const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    const isSeller = order.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res
        .status(403)
        .json({ message: "No tenés permisos para abrir una disputa en esta orden." });
    }

    // ─────────────────────────────────────────────────────────────────────
    // DISPUTA POR PAGO NO RECIBIDO (VENDEDOR)
    // El vendedor lo habilita SOLO mientras la orden está en 'verifying_payment'
    // (el comprador notificó que pagó, pero el vendedor asegura que no le llegó)
    // y pasado un plazo de espera desde dicha notificación. Es el caso que este
    // nuevo flujo trae: el comprador podría haberlo "marcado como pago" sin
    // transferir realmente. Solo aplica a transferencia bancaria (en crypto el
    // dinero está retenido en el escrow y se gestiona distinto).
    // ─────────────────────────────────────────────────────────────────────
    const PAYMENT_DISPUTE_WAIT_MINUTES = 30; // Ventana de espera (configurable)

    if (isSeller && !isBuyer) {
      if (order.status !== "verifying_payment") {
        return res.status(400).json({
          success: false,
          message: `No se puede reportar pago no recibido en el estado actual (${order.status}). Esperá a que el comprador notifique el pago.`,
        });
      }
      if (order.payment?.method === "crypto") {
        return res.status(400).json({
          success: false,
          message:
            "Las órdenes con pago en criptomonedas retienen los USDT en el escrow y no aplican al reporte de pago no recibido.",
        });
      }
      if (order.dispute?.exists) {
        return res.status(400).json({
          success: false,
          message: "Ya hay una disputa abierta en esta orden. El admin la resolverá.",
        });
      }

      // Fecha en que se notificó: usamos la marca dedicada si existe; si la
      // orden es antigua (creada antes de este cambio) caemos a updatedAt,
      // que en 'verifying_payment' quedó congelado a esa notificación.
      const notifiedAt = [
        order.verifyingPaymentNotifiedAt,
        order.statusHistory?.find?.((s) => s.status === "verifying_payment")
          ?.changedAt,
        order.updatedAt,
      ].find(Boolean);
      if (!notifiedAt) {
        return res.status(400).json({
          success: false,
          message:
            "No se pudo determinar cuándo el comprador notificó el pago. Contactá a soporte.",
        });
      }
      const elapsedMs = Date.now() - new Date(notifiedAt).getTime();
      const waitMs = PAYMENT_DISPUTE_WAIT_MINUTES * 60 * 1000;
      if (elapsedMs < waitMs) {
        const remainingMin = Math.ceil((waitMs - elapsedMs) / 60000);
        return res.status(409).json({
          success: false,
          code: "WAIT_WINDOW",
          remainingMinutes: remainingMin,
          message: `Aún no podés reportar que el pago no ingresó. Esperá ${remainingMin} min + para recién marcarlo como no pagado por el comprador.`,
        });
      }
    } else if (!["shipped"].includes(order.status)) {
      // Flujo del COMPRADOR (problema con el pedido despachado): solo en camino.
      return res.status(400).json({
        success: false,
        message: `No se puede abrir una disputa en el estado actual (${order.status}). Solo mientras el pedido está en camino.`,
      });
    }

    if (order.dispute?.exists) {
      return res.status(400).json({
        success: false,
        message: order.dispute.status === "open"
          ? "Ya hay una disputa abierta en esta orden. El admin la resolverá."
          : "Esta orden ya tuvo una disputa resuelta.",
      });
    }

    // Quién abre la disputa (define issueType por defecto y textos).
    const initiator = isSeller ? "seller" : "buyer";

    // Se congela la liberación del colateral on-chain (si hay saldo bloqueado).
    // Si el contrato no tiene lock (ej. orden crypto), igualmente marcamos la
    // disputa en la DB y notificamos al admin.
    let txHash = "";
    try {
      const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;
      const bc = await triggerOrderDispute(order._id.toString(), chainId);
      if (bc.success) txHash = bc.txHash;
    } catch (bcErr) {
      console.warn("[Dispute] No se pudo congelar on-chain (posible escrow):", bcErr.message);
    }

        // Issue por defecto según quién abre la disputa.
    const defaultIssue = isSeller
      ? "El vendedor reporta que el pago del comprador no ingresó."
      : "El comprador reportó un problema con el pedido (sin especificar).";
    const resolvedIssue =
      issueType || defaultIssue;
    const defaultReason = isSeller
      ? "El comprador notificó el pago pero el vendedor declara no haberlo recibido."
      : "Producto incorrecto, dañado o no recibido.";

    order.dispute = {
      exists: true,
      raisedBy: isSeller ? order.seller : order.buyer,
      issueType: resolvedIssue,
      description: description || "",
      status: "open",
      txHash: txHash || "",
      createdAt: new Date(),
    };
        order.orderActions.push({
      type: "dispute_opened",
      initiator,
      // La disputa (comprador reportando un problema o vendedor reportando
      // "el pago no ingresó") quedó registrada y queda "open" a nivel del
      // subdocumento `dispute`, no aquí. En `orderActions` el enum de `status`
      // es pending/approved/rejected/completed/declined → usamos "completed"
      // porque la acción (abrir disputa) ya se ejecutó.
            paidStatus: "paid",
      status: "completed",
      reason: resolvedIssue || defaultReason,
      createdBy: isSeller ? order.seller : order.buyer,
    });
    await order.save();

        // ─────────────────────────────────────────────────────────────────────
    // NOTIFICACIONES
    // ─────────────────────────────────────────────────────────────────────
    const adminUser = await findAdminUser(User);
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);

    if (adminUser) {
      const issuerLabel = isSeller ? "El vendedor" : "El comprador";
      createNotification({
        recipient: adminUser._id,
        type: "order_disputed",
        title: "Disputa abierta en una orden",
        message: `${issuerLabel} abrió una disputa en la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()} (${resolvedIssue}). El colateral queda retenido hasta resolver.`,
        data: { orderId: order._id, issueType: resolvedIssue },
      }).catch(() => {});
    }

    if (isSeller) {
      // Disputa iniciada por el VENDEDOR (pago no recibido).
      createNotification({
        recipient: order.seller,
        type: "order_disputed",
        title: "Reporte de pago no recibido registrado",
        message: `Registramos tu reporte de la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()}: el pago del comprador no ingresó. El admin revisará el caso y te contactará.`,
        data: { orderId: order._id },
      }).catch(() => {});
            createNotification({
        recipient: order.buyer,
        type: "order_disputed",
        title: "Tu compra fue marcada como no pagada",
        message: `El vendedor reportó que el pago de la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()} no le llegó. Si realizaste la transferencia, subí el comprobante para que el admin pueda validar tu pago.`,
        data: { orderId: order._id },
      }).catch(() => {});

      // 💌 Email al comprador: pedirle que suba el comprobante de la
      // transferencia para que el admin pueda resolver la disputa de pago.
      if (buyer?.email) {
        sendBuyerPaymentDisputeAskProof({
          buyerEmail: buyer.email,
          orderId: order._id,
          amount: order.totalAmount,
        }).catch((err) =>
          console.error("Falló email de pago no recibido al comprador:", err),
        );
      }
    } else {
      // Disputa iniciada por el COMPRADOR (problema con el pedido recibido).
      createNotification({
        recipient: order.buyer,
        type: "order_disputed",
        title: "Disputa abierta",
        message: `Registramos tu problema en la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()}. El admin la revisará. Mientras tanto los fondos del vendedor quedan retenidos.`,
        data: { orderId: order._id },
      }).catch(() => {});
      createNotification({
        recipient: order.seller,
        type: "order_disputed",
        title: "Tu venta fue disputada",
        message: `El comprador reportó un problema con la orden #${order._id
          .toString()
          .slice(-6)
          .toUpperCase()}. Tu garantía queda retenida hasta que el admin resuelva la disputa.`,
        data: { orderId: order._id },
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: isSeller
        ? "Reporte de pago no recibido registrado. El admin revisará el caso y te contactará con la resolución."
        : "Disputa registrada. El admin revisará el caso y la garantía del vendedor queda retenida hasta la resolución.",
      dispute: order.dispute,
      order,
    });
    } catch (error) {
    console.error("Error al abrir disputa:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * COMPRADOR adjunta el COMPROBANTE de su transferencia ante una disputa de
 * "pago no recibido" (abierta por el vendedor en `verifying_payment`,
 * transferencia bancaria).
 *
 * Flujo de subida: el FRONT sube el archivo directo a Cloudinary (preset
 * unsigned "mercadonero", igual que las imágenes de producto) y acá sólo
 * recibimos y persistimos la URL resultante + una nota. Esto mantiene el
 * backend liviano y no tiene que interceptar/procesar binarios grandes.
 *
 * Validaciones: sólo el COMPRADOR de la orden, por transferencia bancaria,
 * mientras la orden esté en `verifying_payment` y exista una disputa abierta
 * iniciada por el VENDEDOR.
 */
const uploadPaymentProof = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentProof, note } = req.body;
    const userId = req.user._id.toString();

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const isBuyer = order.buyer.toString() === userId;
    if (!isBuyer) {
      return res
        .status(403)
        .json({ success: false, message: "Solo el comprador de la orden puede subir el comprobante." });
    }
    if (order.payment?.method === "crypto") {
      return res.status(400).json({
        success: false,
        message: "Las órdenes en criptomonedas no requieren comprobante de transferencia bancaria.",
      });
    }
    if (order.status !== "verifying_payment") {
      return res.status(400).json({
        success: false,
        message: `Solo podés adjuntar el comprobante mientras la orden esté en verificación (estado actual: ${order.status}).`,
      });
    }
    const sellerRaisedOpenDispute =
      order.dispute?.exists &&
      order.dispute.status === "open" &&
      order.dispute.raisedBy?.toString?.() === order.seller.toString();
    if (!sellerRaisedOpenDispute) {
      return res.status(400).json({
        success: false,
        message: "Esta orden no tiene una disputa de pago no recibido abierta por el vendedor.",
      });
    }
    if (!paymentProof || typeof paymentProof !== "string" || !/^https?:\/\/.+/.test(paymentProof)) {
      return res
        .status(400)
        .json({ success: false, message: "Adjuntá un comprobante válido (URL de imagen o PDF subida a Cloudinary)." });
    }

    order.paymentProof = paymentProof.trim();
    order.orderActions.push({
      type: "claim", // reclamo / evidencia dentro de una disputa
      initiator: "buyer",
      paidStatus: "paid",
      status: "completed",
      reason: `El comprador adjuntó el comprobante de la transferencia ante el reporte de pago no recibido. ${(note || "").slice(0, 400)}`.trim(),
      createdBy: order.buyer,
    });
    await order.save();

    // Notificar vendedor + admin (mail e in-app).
    const adminUser = await findAdminUser(User);
    const seller = await User.findById(order.seller);

    if (seller) {
      if (seller.email) {
        sendPaymentProofUploaded({ email: seller.email, orderId: order._id, amount: order.totalAmount, roleLabel: "vendedor" }).catch(() => {});
      }
      createNotification({
        recipient: seller._id,
        type: "order_dispute_evidence",
        title: "El comprador adjuntó el comprobante",
        message: `El comprador subió el comprobante de la orden #${order._id.toString().slice(-6).toUpperCase()} por tu reporte de pago no recibido. Verificá tu cuenta y avisá si te llegó.`,
        data: { orderId: order._id },
      }).catch(() => {});
    }
    if (adminUser) {
      if (adminUser.email) {
        sendPaymentProofUploaded({ email: adminUser.email, orderId: order._id, amount: order.totalAmount, roleLabel: "admin" }).catch(() => {});
      }
      createNotification({
        recipient: adminUser._id,
        type: "order_dispute_evidence",
        title: "Comprobante adjuntado",
        message: `El comprador subió el comprobante de la orden #${order._id.toString().slice(-6).toUpperCase()} (pago no recibido). Revisalo para resolver la disputa.`,
        data: { orderId: order._id },
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, message: "Comprobante subido correctamente.", order });
  } catch (error) {
    console.error("Error al subir comprobante de pago:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN resuelve una disputa de PAGO NO RECIBIDO (abierta por el vendedor en
 * `verifying_payment`, transferencia bancaria). Body: { resolution, note }
 *  - 'payment_received'  → el comprobante es válido / el pago sí se acreditó.
 *    A favor del COMPRADOR: se cierra la disputa y la orden vuelve a
 *    `verifying_payment` para que el VENDEDOR confirme la recepción y despache.
 *  - 'no_payment'        → el pago nunca se acreditó (no hay comprobante válido).
 *    A favor del VENDEDOR: se cancela la orden y se le libera su colateral
 *    on-chain. Se suma el contador de cancelaciones como comprador.
 */
/**
 * ADMIN ABRE una disputa (solo admin).
 * El admin, tras leer un reporte de problema (o por iniciativa propia),
 * cataloga la orden como "en disputa". NO cambia el estado de la orden ni
 * mueve fondos: solo marca order.dispute como abierta y avisa a ambas partes.
 * Body: { issueType?, description? }.
 */
const adminOpenDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { issueType, description } = req.body || {};

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (order.dispute?.exists && order.dispute.status === "open") {
      return res
        .status(400)
        .json({ message: "La orden ya tiene una disputa abierta." });
    }

    order.dispute = order.dispute || {};
    order.dispute.exists = true;
    order.dispute.status = "open";
    order.dispute.raisedBy = null; // iniciada por el admin
    order.dispute.issueType = String(issueType || "admin_manual").slice(0, 120);
    order.dispute.description = String(description || "").slice(0, 2000);
    order.dispute.createdAt = new Date();
    order.dispute.resolvedAt = null;
    order.dispute.resolution = "";
    order.dispute.resolvedBy = null;

    order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "unknown",
      status: "completed",
      reason: "Admin abrió una disputa" + (order.dispute.description ? ": " + order.dispute.description : ""),
      createdBy: req.user?._id,
    });
    await order.save();

    const shortId = order._id.toString().slice(-6).toUpperCase();
    const msg =
      "La orden #" + shortId +
      " fue puesta en disputa por el equipo de soporte. Se revisará el caso y se resolverá a la brevedad.";

    createNotification({
      recipient: order.buyer,
      type: "order_dispute_resolved",
      title: "Tu orden está en revisión",
      message: msg,
      data: { orderId: order._id },
    }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_dispute_resolved",
      title: "Una de tus ventas está en revisión",
      message: msg,
      data: { orderId: order._id },
    }).catch(() => {});

    // Emails a ambas partes avisando que la orden quedó en disputa.
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);
    if (buyer?.email) {
      sendDisputeOpenedToBuyer({
        buyerEmail: buyer.email,
        orderId: order._id,
        amount: order.totalAmount,
        description: order.dispute.description,
      }).catch(() => {});
    }
    if (seller?.email) {
      sendDisputeOpenedToVendor({
        vendorEmail: seller.email,
        orderId: order._id,
        amount: order.totalAmount,
        description: order.dispute.description,
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Disputa abierta. La orden quedó marcada como en disputa.",
      order,
    });
  } catch (error) {
    console.error("Error al abrir disputa (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADMIN CIERRA una disputa a favor de una de las partes (solo admin).
 * SOLO marca la disputa como resuelta y deja registro de a quién favoreció.
 * NO mueve fondos NI cambia el estado de la orden: el admin usa aparte los
 * botones de reembolso/completar/liberar para mover el dinero/estado según
 * corresponda. Body: { favor: 'buyer' | 'seller', note? }.
 */
const adminCloseDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { favor, note } = req.body || {};

    if (!["buyer", "seller"].includes(favor)) {
      return res
        .status(400)
        .json({ message: "Indicá a favor de quién se resuelve: 'buyer' o 'seller'." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (!order.dispute?.exists || order.dispute.status !== "open") {
      return res
        .status(400)
        .json({ message: "La orden no tiene una disputa abierta para cerrar." });
    }

    const comment = String(note || "").slice(0, 2000);
    order.dispute.status = favor === "buyer" ? "resolved_refund" : "resolved_release";
    order.dispute.resolvedAt = new Date();
    order.dispute.resolvedBy = req.user?._id || null;
    order.dispute.resolution =
      comment ||
      (favor === "buyer"
        ? "El admin resolvió la disputa a favor del COMPRADOR."
        : "El admin resolvió la disputa a favor del VENDEDOR.");

    order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "unknown",
      status: "completed",
      reason:
        "Admin cerró la disputa a favor del " +
        (favor === "buyer" ? "COMPRADOR" : "VENDEDOR") +
        (comment ? ". Nota: " + comment : ""),
      createdBy: req.user?._id,
    });
    await order.save();

    const shortId = order._id.toString().slice(-6).toUpperCase();
    const msg =
      "La disputa de la orden #" + shortId + " fue resuelta a favor del " +
      (favor === "buyer" ? "comprador" : "vendedor") +
      ". El equipo de soporte coordinará los pasos siguientes.";

    createNotification({
      recipient: order.buyer,
      type: "order_dispute_resolved",
      title: "Disputa resuelta",
      message: msg,
      data: { orderId: order._id },
    }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_dispute_resolved",
      title: "Disputa resuelta",
      message: msg,
      data: { orderId: order._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message:
        "Disputa cerrada a favor del " +
        (favor === "buyer" ? "comprador" : "vendedor") +
        ". Recordá mover los fondos/estado con los botones correspondientes.",
      order,
    });
  } catch (error) {
    console.error("Error al cerrar disputa (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminResolvePaymentDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { resolution, note } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (!order.dispute?.exists || order.dispute.status !== "open") {
      return res
        .status(400)
        .json({ success: false, message: "No hay una disputa abierta en esta orden." });
    }
    const isPaymentNotReceivedDispute =
      order.dispute.raisedBy?.toString?.() === order.seller.toString() &&
      order.status === "verifying_payment" &&
      order.payment?.method !== "crypto";
    if (!isPaymentNotReceivedDispute) {
      return res.status(400).json({
        success: false,
        message: "Esta disputa no es de 'pago no recibido' iniciada por el vendedor. Usá la resolución genérica de disputas.",
      });
    }
    if (!["no_payment", "payment_received"].includes(resolution)) {
      return res
        .status(400)
        .json({ success: false, message: "La resolución debe ser 'no_payment' o 'payment_received'." });
    }

    const shortId = order._id.toString().slice(-6).toUpperCase();
    const comment = note || "";
    const buyer = await User.findById(order.buyer);
    const seller = await User.findById(order.seller);

    // ── Resolución "sí se acreditó" → a favor del COMPRADOR ──
    if (resolution === "payment_received") {
      order.dispute.status = "resolved_refund"; // a favor del comprador
      order.dispute.resolvedAt = new Date();
      order.dispute.resolvedBy = req.user?._id || null;
      order.dispute.resolution = comment || "El admin validó el comprobante: el pago sí se acreditó. La orden vuelve a verificación.";
      // No forzamos el despacho: el VENDEDOR confirma de forma manual.
      order.status = "verifying_payment";
      order.statusHistory.push({
        status: "verifying_payment",
        changedAt: new Date(),
        comment: "Disputa de pago no recibido resuelta a favor del comprador. El vendedor debe confirmar la recepción.",
      });
      order.orderActions.push({
        type: "admin_intervention",
        initiator: "admin",
        paidStatus: "paid",
        status: "completed",
        reason: `Disputa de pago no recibido resuelta a favor del COMPRADOR (el pago sí se acreditó). ${comment}`.trim(),
        createdBy: req.user?._id,
      });
      await order.save();

      if (buyer) {
        if (buyer.email) sendPaymentDisputeResolvedInBuyerFavor({ buyerEmail: buyer.email, orderId: order._id }).catch(() => {});
        createNotification({
          recipient: buyer._id,
          type: "order_dispute_resolved",
          title: "Tu compra fue confirmada",
          message: `El pago de la orden #${shortId} fue validado. El vendedor fue avisado para que verifique y envíe tu pedido.`,
          data: { orderId: order._id },
        }).catch(() => {});
      }
      if (seller) {
        createNotification({
          recipient: seller._id,
          type: "order_dispute_resolved",
          title: "Disputa resuelta: el pago se acreditó",
          message: `Ante tu reporte de la orden #${shortId}, el comprador presentó comprobante y el admin validó el pago. Verificá tu cuenta y confirmá la recepción para despachar.`,
          data: { orderId: order._id },
        }).catch(() => {});
      }
      return res.status(200).json({
        success: true,
        message: "Disputa resuelta a favor del comprador. La orden vuelve a verificación para que el vendedor confirme.",
        order,
      });
    }

    // ── Resolución "no se acreditó" → a favor del VENDEDOR ──
    if (!seller || !seller.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene wallet asociada para liberar colateral.",
      });
    }

    // Liberación idempotente on-chain (misma lógica que la liberación manual).
    const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;
    const lockState = await getOrderLock(order._id.toString(), chainId);
    const alreadyReleased =
      !lockState.success || (lockState.success && lockState.lockUsd === 0);
    let releaseTxHash = order.releaseTxHash || "";
    if (!alreadyReleased) {
      const bc = await cancelVendorCollateral(order._id.toString(), seller.walletAddress, chainId);
      if (!bc.success) {
        return res.status(500).json({
          success: false,
          message: "No se pudo liberar el colateral en la blockchain.",
          error: bc.error,
        });
      }
      releaseTxHash = bc.txHash;
    }

    order.status = "cancelled";
    order.releaseTxHash = releaseTxHash;
    order.cancelledBy = "admin";
    order.cancelledAt = new Date();
    order.dispute.status = "resolved_release"; // a favor del vendedor
    order.dispute.resolvedAt = new Date();
    order.dispute.resolvedBy = req.user?._id || null;
    order.dispute.resolution = comment || "El admin determinó que el pago nunca se acreditó. Se liberó la garantía al vendedor y se canceló la orden.";
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      comment: `Disputa de pago no recibido resuelta a favor del VENDEDOR. Se liberó el colateral y se canceló la orden. ${comment}`.trim(),
    });
    order.orderActions.push({
      type: "admin_intervention",
      initiator: "admin",
      paidStatus: "not_paid",
      status: "completed",
      reason: `Disputa de pago no recibido resuelta a favor del VENDEDOR (no se acreditó el pago). Orden cancelada y garantía liberada. ${comment}`.trim(),
      releaseTxHash: releaseTxHash || undefined,
      createdBy: req.user?._id,
    });
    await order.save();

    // LIBERAR la reserva de recompensas (orden cancelada sin completarse).
    await releaseOrderRewardsReservation(order, { reason: "disputa resuelta sin pago" });

    // Contador anti-abuso (MVP): el comprador notificó un pago que nunca se
    // acreditó → se cuenta como cancelación del comprador.
    await User.findByIdAndUpdate(order.buyer, {
      $inc: { "accounting.cancellationsAsBuyer": 1 },
    });

    if (buyer?.email) {
      sendOrderCancelledToBuyer({ buyerEmail: buyer.email, orderId: order._id, amount: order.totalAmount, withRefund: false }).catch(() => {});
    }
    if (seller?.email) {
      sendOrderCancelledToVendor({ vendorEmail: seller.email, orderId: order._id, amount: order.totalAmount, withRefund: false }).catch(() => {});
    }
    createNotification({
      recipient: order.buyer,
      type: "order_cancelled",
      title: "Tu compra fue cancelada",
      message: `No se acreditó el pago de la orden #${shortId}. La compra se canceló y la garantía del vendedor fue liberada. Si creés que es un error, contactá a soporte.`,
      data: { orderId: order._id },
    }).catch(() => {});
    createNotification({
      recipient: order.seller,
      type: "order_guarantee_released",
      title: "Disputa resuelta a tu favor",
      message: `Confirmamos que el pago de la orden #${shortId} no se acreditó. Se canceló la compra y se liberó tu garantía.`,
      data: { orderId: order._id },
    }).catch(() => {});
    // Recordatorio de rating mutuo tras cancelación por admin.
    createNotification({
      recipient: order.seller,
      type: "rating_reminder",
      title: "Calificá al comprador",
      message: `La orden #${shortId} se canceló. Dejá tu calificación (👍/👎) sobre el comprador en la página de la orden.`,
      data: { orderId: order._id, ratingType: "buyer_rating" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Disputa resuelta a favor del vendedor. Orden cancelada y garantía liberada.",
      order,
    });
  } catch (error) {
    console.error("Error al resolver disputa de pago (admin):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DESGLOSE DE COLATERAL DEL VENDEDOR (solo el propio vendedor).
 *
 * En el panel de billetera el vendedor veía SÓLO el total "En Órdenes Activas"
 * on-chain, sin saber QUÉ órdenes le tenían retenido ese saldo. Con varias
 * ventas simultáneas no podía cruzar el total del CollateralManager con sus
 * órdenes. Este endpoint devuelve, orden por orden, cuánto tiene retenido, en
 * qué red y en qué estado, para que el desglose sea transparente.
 *
 * Fuente de verdad: la BLOCKCHAIN. Para cada orden activa leemos el lock real
 * (getOrderLock) en la red donde se congeló. El monto "contratado" en DB se usa
 * como respaldo cuando el lock no se puede leer o aún no existe (hold). Es de
 * solo lectura: no mueve fondos.
 */
const getMyCollateralBreakdown = async (req, res) => {
  try {
    const sellerId = req.user._id;

    // Estados en los que una orden puede tener colateral del vendedor retenido
    // (o reservando capacidad, en el caso de un hold aún sin depositar).
    const HOLDING_STATUSES = [
      "awaiting_collateral",
      "pending_payment",
      "verifying_payment",
      "paid",
      "shipped",
      "reception_confirmed",
    ];

    const orders = await Order.find({
      seller: sellerId,
      status: { $in: HOLDING_STATUSES },
      $or: [
        { collateralTxHash: { $exists: true, $ne: "" } },
        { "collateralHold.status": "pending" },
      ],
    })
      .populate("buyer", "username firstName lastName")
      .select(
        "status totalAmount financials collateralChainId collateralTxHash releaseTxHash collateralHold createdAt itemsSnapshot buyer",
      )
      .sort({ createdAt: -1 });

    const breakdown = await Promise.all(
      orders.map(async (order) => {
        const chainId = order.collateralChainId || DEFAULT_CHAIN_ID;

        // Monto que la orden reserva/retiene según la DB (referencia).
        const contractedUsd =
          Number(order.financials?.sellerNetReleaseUsd) ||
          Number(order.financials?.totalUsd) ||
          Number(order.totalAmount) ||
          0;

        // Hold aún sin depositar (todavía no hay lock on-chain).
        const isPendingHold =
          order.status === "awaiting_collateral" &&
          order.collateralHold?.status === "pending";

        // Lock real on-chain (solo cuando ya se congeló y no se liberó).
        let onChainLockUsd = null;
        let onChainReadable = false;
        if (order.collateralTxHash && !order.releaseTxHash) {
          const lock = await getOrderLock(order._id.toString(), chainId);
          if (lock.success) {
            onChainReadable = true;
            onChainLockUsd = lock.lockUsd;
          }
        }

        // Monto mostrado: preferimos el lock on-chain cuando está disponible.
        const effectiveLockedUsd =
          onChainLockUsd != null && onChainLockUsd > 0
            ? onChainLockUsd
            : isPendingHold
              ? 0
              : contractedUsd;

        const reasonByStatus = {
          awaiting_collateral: "Esperando depósito de garantía",
          pending_payment: "Esperando pago del comprador",
          verifying_payment: "Verificando pago",
          paid: "Pago confirmado, en preparación",
          shipped: "Pedido en camino",
          reception_confirmed: "Recibido por el comprador (período de seguridad)",
        };

        const buyerName =
          [order.buyer?.firstName, order.buyer?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          order.buyer?.username ||
          "El comprador";

        return {
          orderId: order._id,
          code: String(order._id).slice(-6).toUpperCase(),
          status: order.status,
          createdAt: order.createdAt,
          buyerName,
          itemsCount: Array.isArray(order.itemsSnapshot)
            ? order.itemsSnapshot.length
            : 0,
          chainId,
          // Referencia de negocio (lo que la orden requiere en garantía).
          contractedUsd: Number(contractedUsd.toFixed(2)),
          // Lo que realmente está congelado on-chain (null si no se pudo leer).
          onChainLockUsd,
          onChainReadable,
          // Cuánto cuenta para el total (lo que mostramos al vendedor).
          lockedUsd: Number(effectiveLockedUsd.toFixed(2)),
          isPendingHold,
          holdExpiresAt: isPendingHold ? order.collateralHold?.expiresAt : null,
          reason: reasonByStatus[order.status] || order.status,
        };
      }),
    );

    const totals = breakdown.reduce(
      (acc, r) => {
        acc.lockedUsd += r.lockedUsd;
        if (r.isPendingHold) acc.pendingHoldCount += 1;
        return acc;
      },
      { lockedUsd: 0, pendingHoldCount: 0 },
    );

    res.status(200).json({
      success: true,
      count: breakdown.length,
      totals: {
        lockedUsd: Number(totals.lockedUsd.toFixed(2)),
        activeOrders: breakdown.length,
        pendingHoldCount: totals.pendingHoldCount,
      },
      orders: breakdown,
    });
  } catch (error) {
    console.error("Error al obtener desglose de colateral:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  createOrder,
  getMyOrders,
  getMyCollateralBreakdown,
  markAsPaid,
  getOrderById,
  updateOrder,
  cancelOrder,
  vendorConfirmsRefund,
  buyerConfirmsRefundReceived,
  requestAdminRelease,
  adminCompleteOrder,
  adminReleaseGuarantee,
  adminGetCollateralStatus,
  adminCancelOrder,
  retryCollateral,
  cancelCollateralHold,
  openDispute,
  reportOrderIssue,
  uploadPaymentProof,
  adminResolvePaymentDispute,
  adminOpenDispute,
  adminCloseDispute,
  // Helpers de recompensas (reserva/consumo) reutilizados por el flujo crypto
  // (orderCryptoController) y por el servicio de holds de colateral.
  commitRewardsOnComplete,
  releaseOrderRewardsReservation,
};
