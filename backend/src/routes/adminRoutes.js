import express from 'express';
const router = express.Router();
import {
  getAllOrders,
  getAllUsers,
  getUserById,
  getStats,
        adminGetProducts,
  adminModerateProduct,
    adminModerateProductsBulk,
  auditCollateralHandler,
  adminSetUserStatus,
} from '../controllers/adminController.js';
import {
  adminCompleteOrder,
  adminReleaseGuarantee,
  adminCancelOrder,
  adminGetCollateralStatus,
  adminResolvePaymentDispute,
  adminOpenDispute,
  adminCloseDispute,
} from '../controllers/orderController.js';
// FASE 1 (refactor): handlers admin 100% crypto movidos a orderCryptoController.js
import {
  adminReleaseEscrow,
  adminCancelEscrow,
  adminSettleEscrow,
  adminUpdateEscrowFee,
  adminGetEscrowConfig,
  adminUpdateEscrowFeeWallet,
  adminUpdateEscrowConfig,
  adminListCryptoOrders,
  adminNotifyBuyerEscrow,
} from '../controllers/orderCryptoController.js';
import {
  adminGetCashbackConfig,
  adminUpdateCashbackConfig,
  adminAdjustUserCashback,
} from '../controllers/cashbackController.js';
import {
  adminGetReferralConfig,
  adminUpdateReferralConfig,
  adminGetReferralRequests,
  adminReviewReferralRequest,
} from '../controllers/referralController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import { isAdmin } from '../middleware/isAdmin.js';

// `attachUser` va ANTES de `isAdmin`: es quien puebla req.user.role desde la BD.
router.get('/orders', verifyAuth, attachUser, isAdmin, getAllOrders);
router.get('/users', verifyAuth, attachUser, isAdmin, getAllUsers);
router.get('/users/:id', verifyAuth, attachUser, isAdmin, getUserById);

// Cambiar el estado de una cuenta: suspender o reactivar (solo admin).
// Body: { status: 'active' | 'suspended', reason? }. Al suspender, oculta
// (pausa) sus publicaciones y bloquea el acceso del usuario.
router.patch('/users/:id/status', verifyAuth, attachUser, isAdmin, adminSetUserStatus);

// Estadísticas globales del panel (KPIs, GMV, ganancias, tops).
router.get('/stats', verifyAuth, attachUser, isAdmin, getStats);

// ── MODERACIÓN DE PUBLICACIONES (solo admin) ──
// Lista publicaciones por estado de revisión (default: pending).
// Query: ?moderation=pending|approved|rejected|all&search=&page=&limit=
router.get('/products', verifyAuth, attachUser, isAdmin, adminGetProducts);
// Aprobar o rechazar una publicación. Body: { action: 'approve'|'reject', reason? }.
router.patch('/products/:id/moderate', verifyAuth, attachUser, isAdmin, adminModerateProduct);
// Aprobar o rechazar EN BLOQUE. Body: { ids: [...], action, reason? }
// o { selectAll: true, moderation, search, action, reason? } para todo lo filtrado.
router.post('/products/moderate-bulk', verifyAuth, attachUser, isAdmin, adminModerateProductsBulk);

// Cancelación manual de la orden (solo admin). NO libera la garantía:
// eso se resuelve aparte de forma manual con release-guarantee.
router.patch('/orders/:orderId/cancel', verifyAuth, attachUser, isAdmin, adminCancelOrder);

// COMPLETAR la orden tras el buffer de seguridad (FASE 1 - MANUAL).
// Libera la garantía (transferencia) o el escrow (crypto) de una orden en
// 'reception_confirmed'. Body: { note?, force? }. Es el ÚNICO camino que libera
// la garantía de una orden dada por recibida por el comprador.
router.patch('/orders/:orderId/complete', verifyAuth, attachUser, isAdmin, adminCompleteOrder);

// Resolver una disputa de PAGO NO RECIBIDO (abierta por el vendedor en
// 'verifying_payment', transferencia bancaria).
// Body: { resolution: 'payment_received' | 'no_payment', note }.
router.patch('/orders/:orderId/resolve-payment-dispute', verifyAuth, attachUser, isAdmin, adminResolvePaymentDispute);

// ABRIR una disputa manualmente (solo admin). No cambia el estado de la orden
// ni mueve fondos: solo marca order.dispute como abierta y avisa a las partes.
// Body: { issueType?, description? }.
router.patch('/orders/:orderId/open-dispute', verifyAuth, attachUser, isAdmin, adminOpenDispute);

// CERRAR una disputa a favor de una de las partes (solo admin). Solo registra
// la resolución; el admin mueve fondos/estado con los botones de reembolso/
// completar/liberar. Body: { favor: 'buyer' | 'seller', note? }.
router.patch('/orders/:orderId/close-dispute', verifyAuth, attachUser, isAdmin, adminCloseDispute);


// Liberación manual de garantía del vendedor (solo admin)
router.patch('/orders/:orderId/release-guarantee', verifyAuth, attachUser, isAdmin, adminReleaseGuarantee);

// Verificar estado real del colateral on-chain (solo admin) — PRIMER paso ante
// una orden cancelada con garantía presuntamente congelada.
router.get('/orders/:orderId/collateral-status', verifyAuth, attachUser, isAdmin, adminGetCollateralStatus);

// AUDITORÍA GLOBAL del colateral (solo admin, solo lectura). Contrasta la DB
// con la blockchain y lista las órdenes que necesitan acción (liberar,
// completar tras el buffer o reconciliar). Query: ?since=<días|ISO>&attention=true.
// Va ANTES de las rutas con `:orderId` para no colisionar con ellas.
router.get('/collateral/audit', verifyAuth, attachUser, isAdmin, auditCollateralHandler);

// ── GESTIÓN DEL ESCROW DE PAGOS CRIPTO (solo admin) ──
// Liberar el escrow manualmente (fondos al vendedor, se cobra el fee).
router.patch('/orders/:orderId/release-escrow', verifyAuth, attachUser, isAdmin, adminReleaseEscrow);
// Cancelar/reembolsar el escrow (USDT al comprador).
router.patch('/orders/:orderId/cancel-escrow', verifyAuth, attachUser, isAdmin, adminCancelEscrow);
// Settle flexible del escrow (poder absoluto del admin, montos variables).
// Body: { sellerAmount, feeAmount, refundAmount } (USD). Suma = monto retenido.
router.patch('/orders/:orderId/settle-escrow', verifyAuth, attachUser, isAdmin, adminSettleEscrow);
// Actualizar el fee global del escrow en el contrato (puntos base).
router.patch('/escrow/fee', verifyAuth, attachUser, isAdmin, adminUpdateEscrowFee);
// Actualizar la feeWallet del escrow en el contrato.
router.patch('/escrow/fee-wallet', verifyAuth, attachUser, isAdmin, adminUpdateEscrowFeeWallet);
// Leer la configuración on-chain del escrow (fee, feeWallet, admin).
router.get('/escrow/config', verifyAuth, attachUser, isAdmin, adminGetEscrowConfig);
// Actualizar parámetros de plataforma del escrow (plazo de liberación).
router.patch('/escrow/config', verifyAuth, attachUser, isAdmin, adminUpdateEscrowConfig);
// Listar órdenes con pago cripto (escrow) para gestión.
router.get('/crypto-orders', verifyAuth, attachUser, isAdmin, adminListCryptoOrders);
// Recordar al comprador que confirme la recepción (escrow fondeado).
router.post('/orders/:orderId/notify-buyer-escrow', verifyAuth, attachUser, isAdmin, adminNotifyBuyerEscrow);

// ── CASHBACK (solo admin) ──
// Configuración global: activar/desactivar, importe, umbral, etc.
router.get('/cashback/config', verifyAuth, attachUser, isAdmin, adminGetCashbackConfig);
router.patch('/cashback/config', verifyAuth, attachUser, isAdmin, adminUpdateCashbackConfig);

// Ajuste de cashback de un usuario concreto (override / bonificación manual).
router.patch('/cashback/user/:userId', verifyAuth, attachUser, isAdmin, adminAdjustUserCashback);

// ── REFERIDOS (solo admin) ──
// Configuración global: tope de %, default, activar/desactivar, etc.
router.get('/referral/config', verifyAuth, attachUser, isAdmin, adminGetReferralConfig);
router.patch('/referral/config', verifyAuth, attachUser, isAdmin, adminUpdateReferralConfig);

// Solicitudes de REFERIDOR (aprobacion manual).
// Lista por estado. Query: ?status=pending|approved|rejected|all&search=
router.get('/referral/requests', verifyAuth, attachUser, isAdmin, adminGetReferralRequests);
// Aprobar o rechazar una solicitud. Body: { action: 'approve'|'reject', reason? }.
router.patch('/referral/requests/:id', verifyAuth, attachUser, isAdmin, adminReviewReferralRequest);

export default router;