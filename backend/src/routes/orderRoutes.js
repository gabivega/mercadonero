import express from 'express';
const router = express.Router();
import { createOrder, getMyOrders, markAsPaid, getOrderById, updateOrder, cancelOrder, vendorConfirmsRefund, buyerConfirmsRefundReceived, requestAdminRelease, retryCollateral, cancelCollateralHold, confirmEscrowFunding, getEscrowStatus, cancelCryptoOrder } from '../controllers/orderController.js';
import verifyPrivyToken from '../middleware/auth.js';
import attachUser from '../middleware/attachUser.js';

router.post('/create', verifyPrivyToken, attachUser, createOrder);
router.get('/my-orders', verifyPrivyToken, attachUser, getMyOrders);
router.patch('/mark-as-paid/:orderId', verifyPrivyToken, attachUser, markAsPaid);
router.get('/:orderId', verifyPrivyToken, attachUser, getOrderById);
router.patch('/:orderId', verifyPrivyToken, attachUser, updateOrder);

// Cancelación (comprador)
router.patch('/:orderId/cancel', verifyPrivyToken, attachUser, cancelOrder);
// Cancelación con escrow crypto (comprador/vendedor) - devuelve USDT al comprador
router.patch('/:orderId/cancel-crypto', verifyPrivyToken, attachUser, cancelCryptoOrder);
// Ver estado on-chain del escrow de una orden crypto
router.get('/:orderId/escrow-status', verifyPrivyToken, attachUser, getEscrowStatus);
// Confirmar fondeo del escrow (comprador reporta txHash, backend verifica on-chain)
router.post('/:orderId/escrow/fund', verifyPrivyToken, attachUser, confirmEscrowFunding);
// Colateral en espera: vendedor deposita y activa la orden / comprador no espera más
router.post('/:orderId/retry-collateral', verifyPrivyToken, attachUser, retryCollateral);
router.patch('/:orderId/cancel-collateral-hold', verifyPrivyToken, attachUser, cancelCollateralHold);
// Reembolso: vendedor confirma que reembolsó
router.patch('/:orderId/vendor-confirms-refund', verifyPrivyToken, attachUser, vendorConfirmsRefund);
// Reembolso: comprador confirma que recibió el reintegro
router.patch('/:orderId/buyer-confirms-refund-received', verifyPrivyToken, attachUser, buyerConfirmsRefundReceived);
// Vendedor solicita liberación manual al admin
router.patch('/:orderId/request-admin-release', verifyPrivyToken, attachUser, requestAdminRelease);

export default router;