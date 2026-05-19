import express from 'express';
const router = express.Router();
import verifyPrivyToken from '../middleware/auth.js'; // Tu archivo de Privy
import attachUser from '../middleware/attachUser.js';
import { updateProfile, getUserProfile, newAddress, deleteAddress, getBankAccounts } from '../controllers/userController.js';

// Ruta protegida
router.put('/update-profile', verifyPrivyToken, attachUser, updateProfile);
router.get('/profile', verifyPrivyToken, attachUser, getUserProfile);
router.post('/new-address', verifyPrivyToken, attachUser, newAddress);
router.delete('/address/:addressId', verifyPrivyToken, attachUser, deleteAddress);
router.get('/bank-accounts/:sellerId', getBankAccounts);


export default router;