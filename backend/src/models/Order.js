// models/Order.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const orderSchema = new Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Array de IDs para facilitar queries rápidas de "quién compró qué"
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

    itemsSnapshot: [
      {
        // --- Vínculo y Cantidad (Esenciales) ---
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, required: true, default: 1 },

        // --- Datos capturados del producto ---
        title: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, default: "ARS" },
        condition: String,

        // --- Logística capturada ---
        shipping: {
          free: { type: Boolean, default: false },
          cost: { type: Number, default: 0 },
          isDigital: { type: Boolean, default: false },
          mode: {
            type: String,
            enum: ["shipping_service", "pickup", "both"],
            default: "both",
          },
          // Modo de envío a domicilio elegido por el vendedor al publicar:
          //   "zipnova" → cotización dinámica (la paga Nero, se descuenta del
          //               neto del vendedor).
          //   "fixed"   → precio fijo (shipping.cost) que se le liquida al
          //               vendedor.
          //   "arrange" → a convenir (Fase 2, sin costo en checkout).
          homeDeliveryMode: {
            type: String,
            enum: ["zipnova", "fixed", "arrange"],
            default: "zipnova",
          },
          dimensions: {
            weight: Number,
            width: Number,
            height: Number,
            depth: Number,
          },
          shippingTime: {
            type: String,
            enum: ["24h", "48h", "72h", "more"],
            default: "48h",
          },
        },
        images: [String],
        category: String,
        subCategory: String,
        brand: String,
        specifications: [{ key: String, value: String }],
      },
    ],

    shippingAddress: {
      street: String,
      streetNumber: String,
      city: String,
      province: String,
      zipCode: String,
      addressType: String,
    },

    // ────────────────────────────────────────────────
    // MÉTODO DE ENTREGA ELEGIDO POR EL COMPRADOR
    //   "shipping" → envío a domicilio (Zipnova / vendedor)
    //   "pickup"   → retiro en sucursal del vendedor (GRATIS)
    // Para "pickup", guardamos también el punto elegido en `pickupLocation`
    // (snapshot con los datos del local al momento de la compra).
    // ────────────────────────────────────────────────
    deliveryMethod: {
      type: String,
      enum: ["shipping", "pickup"],
      default: "shipping",
    },
    pickupLocation: {
      locationId: { type: String, default: "" },
      name: String,
      street: String,
      city: String,
      state: String,
      zipcode: String,
      floor: String,
      apartment: String,
      betweenStreets: String,
      references: String,
      hours: String,
      notes: String,
    },
    productsAmount: { type: Number, required: true },
    shippingAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "awaiting_collateral",
        "pending_payment",
        "verifying_payment",
        "paid",
        "shipped",
        // El comprador confirmó la recepción. NO es el cierre definitivo:
        // queda en un período de "buffer" (ver releaseEligibleAt) durante el
        // cual puede reclamar (producto dañado/equivocado) SIN que la garantía
        // ya esté liberada. Recién el admin, tras el buffer, libera (on-chain)
        // y la orden pasa a "completed".
        "reception_confirmed",
        "completed",
        "cancelled",
        "expired",
      ],
      default: "pending_payment",
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: [
            "awaiting_collateral",
            "pending_payment",
            "verifying_payment",
            "paid",
            "shipped",
            "reception_confirmed",
            "completed",
            "cancelled",
            "expired",
          ],
          required: true,
        },
        changedAt: { type: Date, default: Date.now },
        comment: { type: String }, // Útil para cuando el admin cancela manualmente
      },
    ],
    paymentProof: { type: String },
    paymentVerifiedAt: { type: Date }, // Cuando el vendedor da el OK al pago
    // Momento en que el COMPRADOR notificó el pago (la orden pasó a
    // 'verifying_payment'). Se usa para permitir al vendedor abrir una
    // disputa por "el pago no ingresó" solo pasado un plazo (ventana de
    // espera) desde esta marca. A diferencia de 'updatedAt', esta fecha queda
    // congelada al momento de la notificación aunque la orden se toque luego.
    verifyingPaymentNotifiedAt: { type: Date, default: null },
    completedAt: { type: Date }, // Cierre final (disparo de Smart Contract)
    // ── BUFFER DE SEGURIDAD ANTES DE LIBERAR LA GARANTÍA ──
    // Cuando el comprador marca la orden como recibida, NO pasa directo a
    // "completed": pasa a "reception_confirmed" y arranca un período de
    // buffer (ver RELEASE_BUFFER_HOURS, default 24h). Durante ese lapso el
    // comprador puede reclamar (dañado/equivocado) sin que la garantía ya
    // esté liberada. Recién cumplido el buffer, el ADMIN libera on-chain y
    // la orden pasa a "completed". En esta etapa la liberación es 100% manual
    // (el admin aprieta el botón); estos campos quedan preparados para la
    // Fase 2 (auto-release por cron) sin retrabajo.
    receptionConfirmedAt: { type: Date, default: null },
    releaseEligibleAt: { type: Date, default: null },
    releaseTxHash: { type: String }, // Hash de la transacción de liberación
    collateralTxHash: { type: String }, // Hash de la transacción de congelamiento del colateral
    // Red (chainId EVM) donde se congeló el colateral de ESTA orden. Se persiste
    // al bloquear para que release/cancel/dispute operen SIEMPRE sobre la misma
    // cadena (evita locks "fantasma" al mezclar redes como BSC y Polygon Amoy).
    collateralChainId: { type: Number, default: null },
    shippingDetails: {
      provider: { type: String }, // Carrier elegido (ej. "Correo Argentino")
      serviceName: { type: String }, // Servicio elegido (ej. "Clásico", "Sucursal")
      quotedPrice: { type: Number }, // Precio cotizado del envío (ARS), auditoría
      trackingNumber: { type: String },
      shippedAt: { type: Date },
      deliveredAt: { type: Date },
      // Nombre del punto de entrega (para envíos a sucursal). NOTA: antes se
      // usaba este campo para guardar el nombre del SERVICIO; ahora el servicio
      // va en `serviceName` y acá queda el nombre del punto de entrega.
      otherProviderDetail: { type: String },
      // ────────────────────────────────────────────────
      // PUNTO DE ENTREGA (Zipnova: Correo Argentino / OCA, etc.)
      // Sucursal donde el COMPRADOR retira su compra cuando el servicio
      // elegido no es entrega a domicilio. Snapshot del punto al momento de
      // la compra (usa `pickup_points` de la cotización de Zipnova).
      // ────────────────────────────────────────────────
      pickupPoint: {
        pointId: { type: Schema.Types.Mixed, default: null }, // id de Zipnova
        name: { type: String, default: "" },
        street: { type: String, default: "" },
        streetNumber: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        zipcode: { type: String, default: "" },
        openHours: { type: String, default: "" },
        phone: { type: String, default: "" },
      },
    },
    financials: {
      usdRate: { type: Number, required: true }, // Cotización usada al momento de la orden
      totalUsd: { type: Number, required: true }, // Valor total de la orden en USD
      // Comisión TOTAL que se descuenta del colateral del vendedor en un solo
      // saque on-chain. = baseFeeUsd (3%) + referralFeeUsd (reward de referidos).
      // El contrato recibe este monto como `feeAmount` al liberar y lo manda a
      // la main wallet de la plataforma; de ahí se paga el reward a los referidos.
      platformFeeUsd: { type: Number, required: true },
      // Desglose (auditoría). baseFeeUsd es la comisión fija de Nero (3%);
      // referralFeeUsd es el % del producto destinado al Programa de Referidos
      // (referidor + comprador, 50/50). Si no hay referido, referralFeeUsd = 0
      // y platformFeeUsd === baseFeeUsd.
      baseFeeUsd: { type: Number, default: 0 },
      referralFeeUsd: { type: Number, default: 0 },
      referralPercent: { type: Number, default: 0 },
      shippingCostUsd: { type: Number, default: 0 }, // Costo de envío en USD (si aplica)
      sellerNetReleaseUsd: { type: Number, required: true }, // Lo que efectivamente recibe el vendedor
    },

    // ────────────────────────────────────────────────
    // REFERIDOS (reintegros por compartir) - auditoría por orden
    // Cuando la orden nace referida (el comprador llegó por un enlace ?ref=)
    // guardamos quién refirió y el % ofrecido por el producto. Al completarse
    // se acredita el reward repartido 50/50 (ver referralService).
    // ────────────────────────────────────────────────
    referral: {
      // Usuario que compartió el enlace (referidor). null = sin referido.
      referrer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      // % total ofrecido por el producto al momento de crear la orden.
      percent: { type: Number, default: 0 },
      // Si la recompensa ya fue acreditada (evita doble acreditación).
      creditAccrued: { type: Boolean, default: false },
      // ── Montos acreditados (se completan al acreditar, para mostrar en la
      //    ficha de la orden sin consultar otra colección) ──
      totalUsd: { type: Number, default: 0 },    // reward total repartido
      referrerUsd: { type: Number, default: 0 }, // parte del referidor
      buyerUsd: { type: Number, default: 0 },    // reintegro del COMPRADOR
    },

    // ────────────────────────────────────────────────
    // CASHBACK (acumulación en BD) - auditoría por orden
    // ────────────────────────────────────────────────
    cashback: {
      // Monto de cashback acreditado al comprador al completarse la orden.
      earnedUsd: { type: Number, default: 0 },
      // Tasa efectiva usada (feePercent de la config global o override).
      // Es el % del SUBTOTAL de productos que se reintegró (ej: 0.025 = 2.5%).
      feePercentUsed: { type: Number, default: 0 },
      // Si el comprador usó cashback para descontar el pago de ESTA orden.
      usedInCheckout: { type: Number, default: 0 }, // USD descontados con cashback
      // Si el cashback de esta orden fue acreditado (evita acreditación doble).
      creditAccrued: { type: Boolean, default: false },
    },
    // Fecha de expiración del plazo de pago. Para órdenes por TRANSFERENCIA
    // bancaria es obligatoria (15 min para pagar/notificar). Para órdenes con
    // pago en CRIPTO (escrow) NO aplica: el dinero queda retenido on-chain y
    // la orden solo puede cancelarla el vendedor o el admin (nunca expira sola).
    expiresAt: { type: Date, default: null },

    // ────────────────────────────────────────────────
    // PAGO CON CRIPTOMONEDAS (Escrow NeroEscrow)
    // Cuando payment.method === "crypto", el comprador fondea USDT/USDC/DAI
    // en el contrato escrow y los fondos quedan retenidos hasta que el admin
    // libera (comprador confirmó recepción) o cancela (reembolso al comprador).
    // ────────────────────────────────────────────────
    payment: {
      method: {
        type: String,
        enum: ["bank_transfer", "crypto"],
        default: "bank_transfer",
      },
      token: {
        type: String,
        // "POL"/"ETH"/"BNB" = moneda NATIVA de la red (fondeo native en redes
        // donde la smart wallet Crossmint no puede pagar gas con el token).
        enum: ["USDT", "USDC", "DAI", "BNB", "POL", "ETH"],
        default: "USDT",
      },
      status: {
        type: String,
        enum: ["unpaid", "funding", "funded", "released", "cancelled_refunded"],
        default: "unpaid",
      },
      // ── RED DEL ESCROW ─────────────────────────────────────────────
      // chainId EVM donde se fondeó (o se va a fondear) el escrow. Se persiste
      // al crear la orden para que verify/release/cancel del admin operen
      // SIEMPRE sobre el mismo contrato. Sin esto, liberar una orden fondeada
      // en Polygon Amoy contra el contrato de BSC revertía con "Sin fondos".
      chainId: { type: Number, default: null },
      // ── MODELO DE FONDEO ────────────────────────────────────────────
      //   "token"  → el comprador fondeó con stablecoin (fundOrder).
      //   "native" → fondeó con la moneda nativa (fundOrderNative), obligatorio
      //              en la smart wallet Crossmint (paymaster sponsor: el gas no
      //              se puede pagar con el token de prueba).
      fundingMode: {
        type: String,
        enum: ["token", "native"],
        default: "token",
      },
      // ── MARCA DE COMPRA GRUPAL ─────────────────────────────────────
      // true cuando la orden nació de un pool (social selling). Sirve para:
      //   - NO re-liberar el escrow en updateOrder (el pool ya liberó on-chain).
      //   - Diferenciar el origen de la orden en backoffice/reportes.
      groupBuy: { type: Boolean, default: false },

      amountUsdRetained: { type: Number, default: 0 },    // monto total USDT retenido (productos + envío)
      // Dirección "espejo" con la que realmente se fondeó on-chain:
      // address(0) si fue NATIVO. Permite auditar sin releer el contrato.
      escrowTokenAddress: { type: String, default: "" },
      feeBps: { type: Number, default: 0 },               // fee global del contrato en puntos base al momento de la orden
      feeUsd: { type: Number, default: 0 },               // comisión del backend (feeBps sobre el total)
      sellerNetUsd: { type: Number, default: 0 },         // lo que recibe el vendedor (neto)
      fundTxHash: { type: String, default: "" },          // tx del comprador fondeando el escrow
      releaseTxHash: { type: String, default: "" },       // tx del admin liberando al vendedor
      cancelTxHash: { type: String, default: "" },        // tx del admin devolviendo al comprador
      fundedAt: { type: Date, default: null },            // cuándo se fondeó on-chain
      releasedAt: { type: Date, default: null },          // cuándo se liberó (vendió)
      cancelledRefundedAt: { type: Date, default: null }, // cuándo se reembolsó
    },

    // ────────────────────────────────────────────────
    // HOLD DE COLATERAL (estado "awaiting_collateral")
    // Cuando el vendedor no tiene saldo de garantía libre suficiente para
    // cubrir una orden, ésta entra a un estado intermedio de espera hasta que
    // el vendedor deposite (15 min) o el comprador la cancele/expire.
    // ────────────────────────────────────────────────
    collateralHold: {
      requestedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },       // Dead-line del vend, 15 min
      reserveUsd: { type: Number, default: 0 },       // Monto USDT reservado en capacidad
      reason: { type: String, default: "" },          // "insufficient_collateral"
      status: {
        type: String,
        enum: ["pending", "fulfilled", "expired", "cancelled"],
        default: "pending",
      },
      fulfilledAt: { type: Date, default: null },      // Cuando el vendedor depositó
      expiredAt: { type: Date, default: null },        // Cuando venció el plazo
      cancelledAt: { type: Date, default: null },      // Cuando se canceló la espera
      // Nota: cuando el vendedor deposita y la orden pasa a 'pending_payment',
      // status -> "fulfilled" y se libera el campo collateralTxHash con el
      // hash real del lock on-chain (guardado en collateralTxHash como hoy).
    },

    // Quién canceló (o expiró) la orden. Sirve para decidir qué ratings de
    // usuario ("seller_rating" / "buyer_rating") están habilitados cuando la
    // orden terminó cancelada. Valores: "buyer" | "seller" | "admin" | "system".
    // Usamos default: null (no "") para que el enum NO falle al crear una orden
    // que todavía no fue cancelada (Mongoose solo valida el enum si no es null).
    cancelledBy: { type: String, enum: ["buyer", "seller", "admin", "system"], default: null },

    // ────────────────────────────────────────────────
    // RETIRO EN SUCURSAL (deliveryMethod === "pickup")
    // No aplica tracking de correo: el vendedor prepara el pedido y lo deja
    // disponible en el local; avisa al comprador cuando está listo para
    // retirar (con un mensaje/nota opcional) y luego confirma la entrega.
    // ────────────────────────────────────────────────
    pickupDetails: {
      // El vendedor marcó el pedido como listo para retirar.
      readyForPickup: { type: Boolean, default: false },
      readyAt: { type: Date },
      // Mensaje/nota del vendedor (horario, referencia, quién atiende, etc.).
      readyNote: { type: String, default: "" },
      // El vendedor o el comprador confirmó que el producto fue retirado.
      pickedUp: { type: Boolean, default: false },
      pickedUpAt: { type: Date },
    },

    // Solicitud de cancelación pendiente (cuando el pago ya fue abonado y
    // falta que el vendedor reembolse para cerrar la cancelación).
    pendingRequest: {
      exists: { type: Boolean, default: false },
      paidStatus: { type: String, enum: ["not_paid", "paid"], default: "paid" },
      status: {
        type: String,
        enum: ["pending", "refunded_by_vendor", "completed"],
        default: "pending",
      },
      reason: { type: String, default: "" },
      refundBankAccount: {
        bankName: String,
        holderName: String,
        cbuCvu: String,
        alias: String,
        cuitCuil: String,
        accountType: String,
      },
      createdAt: { type: Date, default: Date.now },
    },

    // Solicitud del vendedor al admin para liberar su garantía manualmente
    // (por seguridad, el vendedor no libera su colateral por sí mismo).
    releaseRequest: {
      exists: { type: Boolean, default: false },
      requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, default: "" },
      status: {
        type: String,
        // - "pending":           esperando resolución del admin.
        // - "approved_released": el admin aprobó y liberó la garantía.
        // - "declined":          el admin rechazó la solicitud de liberación.
        // - "resolved_by_cancel":la orden se canceló por otra vía (p. ej. el
        //   admin canceló manualmente), dejando la solicitud sin efecto.
        enum: ["pending", "approved_released", "declined", "resolved_by_cancel"],
        default: "pending",
      },
      createdAt: { type: Date, default: Date.now },
    },

    // ────────────────────────────────────────────────
    // DISPUTA (comprador reporta un problema con el pedido despachado)
    // Cuando el comprador abre una disputa, la garantía del vendedor queda
    // retenida y el admin debe resolverla manualmente. Mientras exists=true,
    // el comprador NO puede marcar la orden como recibida.
    // ────────────────────────────────────────────────
    dispute: {
      exists: { type: Boolean, default: false },
      raisedBy: { type: Schema.Types.ObjectId, ref: "User" },
      issueType: { type: String, default: "" },
      description: { type: String, default: "" },
      status: {
        type: String,
        enum: ["open", "resolved_refund", "resolved_release", "dismissed"],
        default: "open",
      },
      txHash: { type: String, default: "" },
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      resolution: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
      resolvedAt: { type: Date, default: null },
    },

    // ────────────────────────────────────────────────
    // COMPRA GRUPAL / SOCIAL SELLING
    // Cuando la orden proviene de un Pool (compra en grupo), guardamos acá
    // el vínculo con el pool y el member on-chain. `stockConsumed` marca que
    // el pool YA descontó stock + reservedStock al crear la orden 'paid', así
    // `updateOrder` NO lo vuelve a descontar al completarse.
    // ────────────────────────────────────────────────
    groupBuy: {
      poolId: { type: Schema.Types.ObjectId, ref: "Pool", default: null },
      memberId: { type: Schema.Types.ObjectId, default: null },
      chainGroupId: { type: String, default: null }, // groupId on-chain (string)
      units: { type: Number, default: 1 },           // unidades compradas
      unitPriceUsd: { type: Number, default: 0 },
      stockConsumed: { type: Boolean, default: false },
    },
    // Flag rápido para queries/filtros.
    isGroupBuy: { type: Boolean, default: false, index: true },

    // ────────────────────────────────────────────────
    // CANCELACIONES / DEVOLUCIONES / RECLAMOS
    // Registro de acciones anti-abuso. Cada evento de
    // cancelación/reembolso/reclamo se anota acá con su
    // resultado, para poder auditarlo y limitar abusos.
    // ────────────────────────────────────────────────
    orderActions: [
      {
        type: {
          type: String,
          enum: [
            "cancel_request", // Solicitud de cancelación (se registra, pendiente)
            "cancel_executed", // Cancelación efectiva (se liberó colateral / se cerró)
            "refund_request", // Comprador pidió reembolso porque ya abonó
            "refund_confirmed", // Vendedor confirmó que reembolsó
            "refund_declined", // Vendedor no reembolsará (queda para soporte/admin)
            "claim", // Reclamo del comprador (post-envío)
            "return_request", // Devolución post-despacho
            "admin_intervention", // Intervención del admin
            "admin_cancel", // Admin canceló la orden manualmente (sin liberar garantía)
            "dispute_opened", // Comprador reportó un problema → se abre disputa
          ],
          required: true,
        },
        initiator: {
          type: String,
          enum: ["buyer", "seller", "admin", "system"],
          required: true,
        },
        paidStatus: {
          type: String,
          enum: ["not_paid", "paid", "unknown"],
          default: "unknown",
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "completed", "declined"],
          default: "pending",
        },
        reason: { type: String, default: "" },
        // Datos bancarios que el comprador provee para recibir el reembolso
        refundBankAccount: {
          bankName: String,
          holderName: String,
          cbuCvu: String,
          alias: String,
          cuitCuil: String,
          accountType: String,
        },
        // Hash de la liberación de colateral asociada (si aplica)
        releaseTxHash: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
