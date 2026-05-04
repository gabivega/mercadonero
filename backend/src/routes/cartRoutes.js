import express from 'express';
const router = express.Router();
import { getCart, syncCart } from '../controllers/cartController.js';
import verifyPrivyToken from '../middleware/auth.js';
import attachUser from '../middleware/attachUser.js';

router.get('/', verifyPrivyToken, attachUser, getCart);
router.post('/synccart', verifyPrivyToken, attachUser, syncCart);

export default router;