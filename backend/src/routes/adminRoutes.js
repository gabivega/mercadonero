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
  adminSetShopStatus,
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

// Aprobar o desactivar la TIENDA de un vendedor (solo admin).
// Body: { approved: true|false, reason? }. Requiere onboarding completo para aprobar.
router.patch('/users/:id/shop', verifyAuth, attachUser, isAdmin, adminSetShopStatus);

// EstadÃ­sticas globales del panel (KPIs, GMV, ganancias, tops).
router.get('/stats', verifyAuth, attachUser, isAdmin, getStats);

// â”€â”€ MODERACIÃ“N DE PUBLICACIONES (solo admin) â”€â”€
// Lista publicaciones por estado de revisiÃ³n (default: pending).
// Query: ?moderation=pending|approved|rejected|all&search=&page=&limit=
router.get('/products', verifyAuth, attachUser, isAdmin, adminGetProducts);
// Aprobar o rechazar una publicaciÃ³n. Body: { action: 'approve'|'reject', reason? }.
router.patch('/products/:id/moderate', verifyAuth, attachUser, isAdmin, adminModerateProduct);
// Aprobar o rechazar EN BLOQUE. Body: { ids: [...], action, reason? }
// o { selectAll: true, moderation, search, action, reason? } para todo lo filtrado.
router.post('/products/moderate-bulk', verifyAuth, attachUser, isAdmin, adminModerateProductsBulk);

// CancelaciÃ³n manual de la orden (solo admin). NO libera la garantÃ­a:
// eso se resuelve aparte de forma manual con release-guarantee.
router.patch('/orders/:orderId/cancel', verifyAuth, attachUser, isAdmin, adminCancelOrder);

// COMPLETAR la orden tras el buffer de seguridad (FASE 1 - MANUAL).
// Libera la garantÃ­a (transferencia) o el escrow (crypto) de una orden en
// 'reception_confirmed'. Body: { note?, force? }. Es el ÃšNICO camino que libera
// la garantÃ­a de una orden dada por recibida por el comprador.
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
// la resoluciÃ³n; el admin mueve fondos/estado con los botones de reembolso/
// completar/liberar. Body: { favor: 'buyer' | 'seller', note? }.
router.patch('/orders/:orderId/close-dispute', verifyAuth, attachUser, isAdmin, adminCloseDispute);


// LiberaciÃ³n manual de garantÃ­a del vendedor (solo admin)
router.patch('/orders/:orderId/release-guarantee', verifyAuth, attachUser, isAdmin, adminReleaseGuarantee);

// Verificar estado real del colateral on-chain (solo admin) â€” PRIMER paso ante
// una orden cancelada con garantÃ­a presuntamente congelada.
router.get('/orders/:orderId/collateral-status', verifyAuth, attachUser, isAdmin, adminGetCollateralStatus);

// AUDITORÃA GLOBAL del colateral (solo admin, solo lectura). Contrasta la DB
// con la blockchain y lista las Ã³rdenes que necesitan acciÃ³n (liberar,
// completar tras el buffer o reconciliar). Query: ?since=<dÃ­as|ISO>&attention=true.
// Va ANTES de las rutas con `:orderId` para no colisionar con ellas.
router.get('/collateral/audit', verifyAuth, attachUser, isAdmin, auditCollateralHandler);

// â”€â”€ GESTIÃ“N DEL ESCROW DE PAGOS CRIPTO (solo admin) â”€â”€
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
// Leer la configuraciÃ³n on-chain del escrow (fee, feeWallet, admin).
router.get('/escrow/config', verifyAuth, attachUser, isAdmin, adminGetEscrowConfig);
// Actualizar parÃ¡metros de plataforma del escrow (plazo de liberaciÃ³n).
router.patch('/escrow/config', verifyAuth, attachUser, isAdmin, adminUpdateEscrowConfig);
// Listar Ã³rdenes con pago cripto (escrow) para gestiÃ³n.
router.get('/crypto-orders', verifyAuth, attachUser, isAdmin, adminListCryptoOrders);
// Recordar al comprador que confirme la recepciÃ³n (escrow fondeado).
router.post('/orders/:orderId/notify-buyer-escrow', verifyAuth, attachUser, isAdmin, adminNotifyBuyerEscrow);

// â”€â”€ CASHBACK (solo admin) â”€â”€
// ConfiguraciÃ³n global: activar/desactivar, importe, umbral, etc.
router.get('/cashback/config', verifyAuth, attachUser, isAdmin, adminGetCashbackConfig);
router.patch('/cashback/config', verifyAuth, attachUser, isAdmin, adminUpdateCashbackConfig);

// Ajuste de cashback de un usuario concreto (override / bonificaciÃ³n manual).
router.patch('/cashback/user/:userId', verifyAuth, attachUser, isAdmin, adminAdjustUserCashback);

// â”€â”€ REFERIDOS (solo admin) â”€â”€
// ConfiguraciÃ³n global: tope de %, default, activar/desactivar, etc.
router.get('/referral/config', verifyAuth, attachUser, isAdmin, adminGetReferralConfig);
router.patch('/referral/config', verifyAuth, attachUser, isAdmin, adminUpdateReferralConfig);

// Solicitudes de REFERIDOR (aprobacion manual).
// Lista por estado. Query: ?status=pending|approved|rejected|all&search=
router.get('/referral/requests', verifyAuth, attachUser, isAdmin, adminGetReferralRequests);
// Aprobar o rechazar una solicitud. Body: { action: 'approve'|'reject', reason? }.
router.patch('/referral/requests/:id', verifyAuth, attachUser, isAdmin, adminReviewReferralRequest);

export default router;
