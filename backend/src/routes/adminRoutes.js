import express from 'express';
const router = express.Router();
import { getAllOrders } from '../controllers/adminController.js';
import verifyPrivyToken from '../middleware/auth.js';
import attachUser from '../middleware/attachUser.js';

router.get('/orders', verifyPrivyToken, attachUser, getAllOrders);

export default router;