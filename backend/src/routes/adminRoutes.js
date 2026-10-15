import express from 'express';
const router = express.Router();
import {
  getAllOrders,
  getAllUsers,
  getUserById,
  getStats,
} from '../controllers/adminController.js';
import {
  adminCompleteOrder,
  adminReleaseGuarantee,
  adminCancelOrder,
  adminGetCollateralStatus,
    adminReleaseEscrow,
  adminCancelEscrow,
    adminUpdateEscrowFee,
  adminGetEscrowConfig,
  adminUpdateEscrowFeeWallet,
  adminUpdateEscrowConfig,
  adminListCryptoOrders,
  adminNotifyBuyerEscrow,
  adminResolvePaymentDispute,
} from '../controllers/orderController.js';
import {
  adminGetCashbackConfig,
  adminUpdateCashbackConfig,
  adminAdjustUserCashback,
} from '../controllers/cashbackController.js';
import {
  adminGetReferralConfig,
  adminUpdateReferralConfig,
} from '../controllers/referralController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import { isAdmin } from '../middleware/isAdmin.js';

// `attachUser` va ANTES de `isAdmin`: es quien puebla req.user.role desde la BD.
router.get('/orders', verifyAuth, attachUser, isAdmin, getAllOrders);
router.get('/users', verifyAuth, attachUser, isAdmin, getAllUsers);
router.get('/users/:id', verifyAuth, attachUser, isAdmin, getUserById);

// Estadísticas globales del panel (KPIs, GMV, ganancias, tops).
router.get('/stats', verifyAuth, attachUser, isAdmin, getStats);

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


// Liberación manual de garantía del vendedor (solo admin)
router.patch('/orders/:orderId/release-guarantee', verifyAuth, attachUser, isAdmin, adminReleaseGuarantee);

// Verificar estado real del colateral on-chain (solo admin) — PRIMER paso ante
// una orden cancelada con garantía presuntamente congelada.
router.get('/orders/:orderId/collateral-status', verifyAuth, attachUser, isAdmin, adminGetCollateralStatus);

// ── GESTIÓN DEL ESCROW DE PAGOS CRIPTO (solo admin) ──
// Liberar el escrow manualmente (fondos al vendedor, se cobra el fee).
router.patch('/orders/:orderId/release-escrow', verifyAuth, attachUser, isAdmin, adminReleaseEscrow);
// Cancelar/reembolsar el escrow (USDT al comprador).
router.patch('/orders/:orderId/cancel-escrow', verifyAuth, attachUser, isAdmin, adminCancelEscrow);
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

export default router;