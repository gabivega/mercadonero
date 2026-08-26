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
} from '../controllers/orderController.js';
import {
  adminGetCashbackConfig,
  adminUpdateCashbackConfig,
  adminAdjustUserCashback,
} from '../controllers/cashbackController.js';
import verifyPrivyToken from '../middleware/auth.js';
import { isAdmin } from '../middleware/isAdmin.js';

router.get('/orders', verifyPrivyToken, isAdmin, getAllOrders);
router.get('/users', verifyPrivyToken, isAdmin, getAllUsers);
router.get('/users/:id', verifyPrivyToken, isAdmin, getUserById);

// Cancelación manual de la orden (solo admin). NO libera la garantía:
// eso se resuelve aparte de forma manual con release-guarantee.
router.patch('/orders/:orderId/cancel', verifyPrivyToken, isAdmin, adminCancelOrder);

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

// ── CASHBACK (solo admin) ──
// Configuración global: activar/desactivar, importe, umbral, etc.
router.get('/cashback/config', verifyPrivyToken, isAdmin, adminGetCashbackConfig);
router.patch('/cashback/config', verifyPrivyToken, isAdmin, adminUpdateCashbackConfig);

// Ajuste de cashback de un usuario concreto (override / bonificación manual).
router.patch('/cashback/user/:userId', verifyPrivyToken, isAdmin, adminAdjustUserCashback);

export default router;