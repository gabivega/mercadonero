import express from 'express';
const router = express.Router();
import { createOrder, getMyOrders, markAsPaid, getOrderById } from '../controllers/orderController.js';
import verifyPrivyToken from '../middleware/auth.js';
import attachUser from '../middleware/attachUser.js';

router.post('/create', verifyPrivyToken, attachUser, createOrder);
router.get('/my-orders', verifyPrivyToken, attachUser, getMyOrders);
router.patch('/mark-as-paid/:orderId', verifyPrivyToken, attachUser, markAsPaid);
router.get('/:orderId', verifyPrivyToken, attachUser, getOrderById);

export default router;