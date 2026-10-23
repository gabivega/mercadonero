// backend/src/services/collateralAuditService.js
//
// ════════════════════════════════════════════════════════════════
// AUDITORÍA DEL COLATERAL DE VENDEDORES (reconciliación DB ↔ on-chain)
// ════════════════════════════════════════════════════════════════
// La fuente de verdad del colateral es la BLOCKCHAIN (contratos
// NeroCollateral, uno por red). La DB guarda referencias (collateralChainId,
// collateralTxHash, releaseTxHash) que pueden desincronizarse por:
//   - un release cuya tx se minó pero revirtió internamente,
//   - órdenes "canceladas" cuyo lock nunca se liberó,
//   - locks congelados en una red distinta a la que la DB cree,
//   - orden en reception_confirmed que superó el buffer sin completar.
//
// Este servicio recorre las órdenes relevantes y contrasta, para cada una, el
// estado real del lock on-chain. NO mueve fondos: solo detecta y reporta, para
// que el admin decida la liberación (release-guarantee) o el cierre
// (adminCompleteOrder) desde el panel. Es idempotente y de solo lectura.
//
// Se exponen:
//   - findOrdersEndingSoon(since): órdenes que cerrarán si el cron de la
//     Fase 2 corre (para simularlo en dry-run).
//   - auditCollateral({ since }): pool de trabajo de la auditoría.
//   - summarizeAudit(results): contadores agregados para el panel.

import Order from "../models/Order.js";
import User from "../models/User.js";
import { getOrderLock } from "./blockchainServices.js";
import {
  DEFAULT_CHAIN_ID,
  getConfiguredChains,
} from "../config/chains.js";

// Ventana de gracia: pedidos "cerrados" hace menos de N segundos pueden tener
// locks aún en curso (race entre el save() y la liberación on-chain). Los
// excluimos para evitar falsos positivos en la auditoría en tiempo real.
const AUDIT_GRACE_MS = Number(process.env.COLLATERAL_AUDIT_GRACE_MS || 90_000);

// Cota de órdenes a auditar por pasada. Evita golpear RPCs masivamente.
const AUDIT_POOL_LIMIT = Number(process.env.COLLATERAL_AUDIT_LIMIT || 200);

export const COLLATERAL_AUDIT_STATES = {
  LOCKED_CANCELLED: "locked_cancelled",
  LOCKED_COMPLETED: "locked_completed",
  RELEASE_TX_STILL_LOCKED: "release_tx_still_locked",
  UNDECLARED_LOCK: "undeclared_lock",
  MISSING_LOCK: "missing_lock",
  CLEAN: "clean",
  UNREADABLE: "unreadable",
};

// Estados en los que la orden se considera LEGÍTIMAMENTE cerrada (no debería
// tener colateral congelado).
const CLOSED_STATUSES = ["cancelled", "completed", "expired"];
// Estados "vivos" donde es NORMAL que haya un lock on-chain.
const ACTIVE_STATUSES = [
  "awaiting_collateral",
  "pending_payment",
  "verifying_payment",
  "paid",
  "shipped",
  "reception_confirmed",
];

/**
 * Devuelve las órdenes de la plataforma que deben auditarse, con el vendedor
 * populado para conocer su wallet.
 *
 * @param {Object} opts
 * @param {Date}[opts.since] Fecha mínima de creación (default: hace 60 días).
 */
export async function auditCollateral({ since } = {}) {
  const sinceDate =
    since instanceof Date
      ? since
      : new Date(Date.now() - (since ? Number(since) : 60 * 24 * 60 * 60 * 1000));
  const graceCutoff = new Date(Date.now() - AUDIT_GRACE_MS);

  const orders = await Order.find({
    createdAt: { $gte: sinceDate },
    $or: [
      // Órdenes cerradas que aún declaran un lock (posible fuga).
      {
        status: { $in: CLOSED_STATUSES },
        collateralTxHash: { $exists: true, $ne: "" },
        updatedAt: { $lt: graceCutoff },
      },
      // Órdenes vivas con lock declarado (verificar que siga existiendo).
      {
        status: { $in: ACTIVE_STATUSES },
        collateralTxHash: { $exists: true, $ne: "" },
      },
      // Órdenes con releaseTxHash pero que siguen sin cerrar (posible release fallido).
      {
        releaseTxHash: { $exists: true, $ne: "" },
        status: { $nin: ["completed"] },
        updatedAt: { $lt: graceCutoff },
      },
      // Órdenes en reception_confirmed vencidas (candidatas a cierre automático).
      {
        status: "reception_confirmed",
        releaseEligibleAt: { $lte: new Date() },
      },
      // Órdenes con solicitud de liberación pendiente del admin.
      { "releaseRequest.exists": true, "releaseRequest.status": "pending" },
    ],
  })
    .populate("seller", "username firstName lastName email walletAddress shop")
    .populate("buyer", "username firstName lastName email")
    .select(
      "status totalAmount currency collateralTxHash releaseTxHash collateralChainId receptionConfirmedAt releaseEligibleAt releaseRequest pendingRequest seller buyer itemsSnapshot createdAt updatedAt",
    )
    .sort({ updatedAt: -1 })
    .limit(AUDIT_POOL_LIMIT);

  const configuredChainIds = getConfiguredChains().map((c) => c.chainId);

  const audited = await Promise.all(
    orders.map(async (order) => {
      const sellerWallet = order.seller?.walletAddress || null;

      // Red declarada por la orden; si no hay, probamos default + configuradas.
      const declaredChain = Number(order.collateralChainId) || null;
      const chainsToCheck = sellerWallet
        ? Array.from(
            new Set([declaredChain || DEFAULT_CHAIN_ID, ...configuredChainIds]),
          )
        : [];

      // Leemos el lock en todas las redes relevantes (en paralelo).
      const locks = {};
      if (chainsToCheck.length > 0) {
        const reads = await Promise.all(
          chainsToCheck.map(async (cid) => [cid, await getOrderLock(order._id.toString(), cid)]),
        );
        for (const [cid, res] of reads) {
          if (res.success) locks[cid] = res;
        }
      }

      // Red con lock activo (si existe). Preferimos la declarada.
      const activeEntry =
        Object.entries(locks).find(([, r]) => r.lockUsd > 0) || null;
      const lockedChainId = activeEntry ? Number(activeEntry[0]) : null;
      const lockUsd = activeEntry ? activeEntry[1].lockUsd : 0;
      const anyLockReadable = Object.keys(locks).length > 0;
      const hasReleaseTx = Boolean(order.releaseTxHash);
      const isClosed = CLOSED_STATUSES.includes(order.status);
      const hasReleaseRequest =
        order.releaseRequest?.exists && order.releaseRequest?.status === "pending";
      const bufferReached =
        order.status === "reception_confirmed" &&
        order.releaseEligibleAt &&
        new Date(order.releaseEligibleAt).getTime() <= Date.now();

      let state = COLLATERAL_AUDIT_STATES.CLEAN;

      if (!sellerWallet) {
        state = hasReleaseRequest
          ? COLLATERAL_AUDIT_STATES.UNREADABLE
          : COLLATERAL_AUDIT_STATES.CLEAN;
      } else if (!anyLockReadable) {
        // No pudimos leer ninguna red (RPC caído). No marcamos falsos positivos
        // por dinero excepto que haya una solicitud de liberación pendiente.
        state = COLLATERAL_AUDIT_STATES.UNREADABLE;
      } else if (isClosed && lockUsd > 0) {
        // Cerrada pero con dinero congelado: fuga grave.
        state = hasReleaseTx
          ? COLLATERAL_AUDIT_STATES.RELEASE_TX_STILL_LOCKED
          : order.status === "completed"
            ? COLLATERAL_AUDIT_STATES.LOCKED_COMPLETED
            : COLLATERAL_AUDIT_STATES.LOCKED_CANCELLED;
      } else if (hasReleaseTx && lockUsd > 0) {
        // Se registró un release pero el lock sigue vivo: release fallido.
        state = COLLATERAL_AUDIT_STATES.RELEASE_TX_STILL_LOCKED;
      } else if (lockUsd > 0 && !order.collateralTxHash && ACTIVE_STATUSES.includes(order.status)) {
        // Hay lock on-chain pero la DB dice que no hay colateral declarado.
        state = COLLATERAL_AUDIT_STATES.UNDECLARED_LOCK;
      } else if (
        bufferReached &&
        (state === COLLATERAL_AUDIT_STATES.CLEAN || !isClosed) &&
        (lockUsd > 0 || order.collateralTxHash)
      ) {
        // La orden superó el buffer y espera que el admin complete/release.
        // La clasificamos como MISSING_LOCK si la DB esperaba lock y no hay.
        if (!lockUsd && order.collateralTxHash && !hasReleaseTx) {
          state = COLLATERAL_AUDIT_STATES.UNDECLARED_LOCK; // lock declarado ya no existe
        }
      } else if (
        order.collateralTxHash &&
        ACTIVE_STATUSES.includes(order.status) &&
        lockUsd === 0 &&
        !hasReleaseTx
      ) {
        // El lock declarado por la DB ya no existe (fue liberado sin registrar
        // release). Requiere reconciliar la DB.
        state = COLLATERAL_AUDIT_STATES.MISSING_LOCK;
      }

      // Compatibilidad con la semántica histórica usada en el endpoint:
      // `needs_attention` indica que hay que accionar (liberar, completar o reconciliar).
      const needsAttention = state !== COLLATERAL_AUDIT_STATES.CLEAN || bufferReached;

      return {
        orderId: order._id,
        code: String(order._id).slice(-6).toUpperCase(),
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        seller: {
          _id: order.seller?._id || null,
          name:
            order.seller?.shop?.name ||
            [order.seller?.firstName, order.seller?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            order.seller?.username ||
            "—",
          walletAddress: sellerWallet,
        },
        buyer: {
          _id: order.buyer?._id || null,
          name:
            [order.buyer?.firstName, order.buyer?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            order.buyer?.username ||
            "—",
        },
        db: {
          believesLocked: Boolean(order.collateralTxHash) && !hasReleaseTx,
          believesReleased: hasReleaseTx,
          declaredChainId: declaredChain,
          releaseRequested: hasReleaseRequest,
        },
        onChain: {
          locked: lockUsd > 0,
          lockUsd,
          lockedChainId,
          readableChains: Object.keys(locks).map(Number),
        },
        reception: {
          confirmedAt: order.receptionConfirmedAt || null,
          releaseEligibleAt: order.releaseEligibleAt || null,
          bufferReached,
          hoursLeft:
            order.releaseEligibleAt && !bufferReached
              ? Math.max(
                  0,
                  (new Date(order.releaseEligibleAt).getTime() - Date.now()) / 3_600_000,
                )
              : 0,
        },
        state,
        needsAttention,
        recommendedAction: recommendAction(state, bufferReached),
      };
    }),
  );

  return { since: sinceDate, total: audited.length, orders: audited };
}

/**
 * Acción sugerida para el panel en función del estado detectado.
 */
function recommendAction(state, bufferReached) {
  switch (state) {
    case COLLATERAL_AUDIT_STATES.LOCKED_CANCELLED:
      return "release_guarantee";
    case COLLATERAL_AUDIT_STATES.LOCKED_COMPLETED:
      return "release_guarantee";
    case COLLATERAL_AUDIT_STATES.RELEASE_TX_STILL_LOCKED:
      return "release_guarantee";
    case COLLATERAL_AUDIT_STATES.UNDECLARED_LOCK:
      return "release_guarantee";
    case COLLATERAL_AUDIT_STATES.MISSING_LOCK:
      return "reconcile_db";
    case COLLATERAL_AUDIT_STATES.UNREADABLE:
      return "retry_read";
    case COLLATERAL_AUDIT_STATES.CLEAN:
    default:
      return bufferReached ? "complete_order" : "none";
  }
}

/**
 * Resumen cuantitativo para KPIs del panel.
 */
export function summarizeAudit(results) {
  const counts = {
    total: results.length,
    clean: 0,
    needsAttention: 0,
    bufferReady: 0,
    lockedCancelled: 0,
    lockedCompleted: 0,
    releaseTxStillLocked: 0,
    undeclaredLock: 0,
    missingLock: 0,
    unreadable: 0,
  };

  for (const r of results) {
    if (r.needsAttention) counts.needsAttention += 1;
    if (r.reception?.bufferReached) counts.bufferReady += 1;
    switch (r.state) {
      case COLLATERAL_AUDIT_STATES.CLEAN:
        counts.clean += 1;
        break;
      case COLLATERAL_AUDIT_STATES.LOCKED_CANCELLED:
        counts.lockedCancelled += 1;
        break;
      case COLLATERAL_AUDIT_STATES.LOCKED_COMPLETED:
        counts.lockedCompleted += 1;
        break;
      case COLLATERAL_AUDIT_STATES.RELEASE_TX_STILL_LOCKED:
        counts.releaseTxStillLocked += 1;
        break;
      case COLLATERAL_AUDIT_STATES.UNDECLARED_LOCK:
        counts.undeclaredLock += 1;
        break;
      case COLLATERAL_AUDIT_STATES.MISSING_LOCK:
        counts.missingLock += 1;
        break;
      case COLLATERAL_AUDIT_STATES.UNREADABLE:
        counts.unreadable += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}
