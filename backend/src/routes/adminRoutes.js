import express from 'express';
const router = express.Router();
import { getAllOrders } from '../controllers/adminController.js';
import verifyPrivyToken from '../middleware/auth.js';
import { isAdmin } from '../middleware/isAdmin.js';

router.get('/orders', verifyPrivyToken, isAdmin, getAllOrders);

export default router;