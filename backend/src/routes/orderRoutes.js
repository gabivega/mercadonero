import express from 'express';
const router = express.Router();
import { createOrder, getMyOrders, markAsPaid, getOrderById, updateOrder, cancelOrder, vendorConfirmsRefund, buyerConfirmsRefundReceived, requestAdminRelease } from '../controllers/orderController.js';
import verifyPrivyToken from '../middleware/auth.js';
import attachUser from '../middleware/attachUser.js';

router.post('/create', verifyPrivyToken, attachUser, createOrder);
router.get('/my-orders', verifyPrivyToken, attachUser, getMyOrders);
router.patch('/mark-as-paid/:orderId', verifyPrivyToken, attachUser, markAsPaid);
router.get('/:orderId', verifyPrivyToken, attachUser, getOrderById);
router.patch('/:orderId', verifyPrivyToken, attachUser, updateOrder);

// Cancelación (comprador)
router.patch('/:orderId/cancel', verifyPrivyToken, attachUser, cancelOrder);
// Reembolso: vendedor confirma que reembolsó
router.patch('/:orderId/vendor-confirms-refund', verifyPrivyToken, attachUser, vendorConfirmsRefund);
// Reembolso: comprador confirma que recibió el reintegro
router.patch('/:orderId/buyer-confirms-refund-received', verifyPrivyToken, attachUser, buyerConfirmsRefundReceived);
// Vendedor solicita liberación manual al admin
router.patch('/:orderId/request-admin-release', verifyPrivyToken, attachUser, requestAdminRelease);

export default router;