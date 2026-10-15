import express from 'express';
const router = express.Router();
import { getCart, syncCart } from '../controllers/cartController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';

router.get('/', verifyAuth, attachUser, getCart);
router.post('/synccart', verifyAuth, attachUser, syncCart);

export default router;