import express from 'express';
const router = express.Router();
import {
  getAllOrders,
  getAllUsers,
  getUserById,
} from '../controllers/adminController.js';
import {
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
import verifyPrivyToken from '../middleware/auth.js';
import { isAdmin } from '../middleware/isAdmin.js';

router.get('/orders', verifyPrivyToken, isAdmin, getAllOrders);
router.get('/users', verifyPrivyToken, isAdmin, getAllUsers);
router.get('/users/:id', verifyPrivyToken, isAdmin, getUserById);

// Cancelación manual de la orden (solo admin). NO libera la garantía:
// eso se resuelve aparte de forma manual con release-guarantee.
router.patch('/orders/:orderId/cancel', verifyPrivyToken, isAdmin, adminCancelOrder);

// Resolver una disputa de PAGO NO RECIBIDO (abierta por el vendedor en
// 'verifying_payment', transferencia bancaria).
// Body: { resolution: 'payment_received' | 'no_payment', note }.
router.patch('/orders/:orderId/resolve-payment-dispute', verifyPrivyToken, isAdmin, adminResolvePaymentDispute);


// Liberación manual de garantía del vendedor (solo admin)
router.patch('/orders/:orderId/release-guarantee', verifyPrivyToken, isAdmin, adminReleaseGuarantee);

// Verificar estado real del colateral on-chain (solo admin) — PRIMER paso ante
// una orden cancelada con garantía presuntamente congelada.
router.get('/orders/:orderId/collateral-status', verifyPrivyToken, isAdmin, adminGetCollateralStatus);

// ── GESTIÓN DEL ESCROW DE PAGOS CRIPTO (solo admin) ──
// Liberar el escrow manualmente (fondos al vendedor, se cobra el fee).
router.patch('/orders/:orderId/release-escrow', verifyPrivyToken, isAdmin, adminReleaseEscrow);
// Cancelar/reembolsar el escrow (USDT al comprador).
router.patch('/orders/:orderId/cancel-escrow', verifyPrivyToken, isAdmin, adminCancelEscrow);
// Actualizar el fee global del escrow en el contrato (puntos base).
router.patch('/escrow/fee', verifyPrivyToken, isAdmin, adminUpdateEscrowFee);
// Actualizar la feeWallet del escrow en el contrato.
router.patch('/escrow/fee-wallet', verifyPrivyToken, isAdmin, adminUpdateEscrowFeeWallet);
// Leer la configuración on-chain del escrow (fee, feeWallet, admin).
router.get('/escrow/config', verifyPrivyToken, isAdmin, adminGetEscrowConfig);
// Actualizar parámetros de plataforma del escrow (plazo de liberación).
router.patch('/escrow/config', verifyPrivyToken, isAdmin, adminUpdateEscrowConfig);
// Listar órdenes con pago cripto (escrow) para gestión.
router.get('/crypto-orders', verifyPrivyToken, isAdmin, adminListCryptoOrders);
// Recordar al comprador que confirme la recepción (escrow fondeado).
router.post('/orders/:orderId/notify-buyer-escrow', verifyPrivyToken, isAdmin, adminNotifyBuyerEscrow);

// ── CASHBACK (solo admin) ──
// Configuración global: activar/desactivar, importe, umbral, etc.
router.get('/cashback/config', verifyPrivyToken, isAdmin, adminGetCashbackConfig);
router.patch('/cashback/config', verifyPrivyToken, isAdmin, adminUpdateCashbackConfig);

// Ajuste de cashback de un usuario concreto (override / bonificación manual).
router.patch('/cashback/user/:userId', verifyPrivyToken, isAdmin, adminAdjustUserCashback);

// ── REFERIDOS (solo admin) ──
// Configuración global: tope de %, default, activar/desactivar, etc.
router.get('/referral/config', verifyPrivyToken, isAdmin, adminGetReferralConfig);
router.patch('/referral/config', verifyPrivyToken, isAdmin, adminUpdateReferralConfig);

export default router;