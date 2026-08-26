import express from 'express';
const router = express.Router();
import verifyPrivyToken from '../middleware/auth.js'; // Tu archivo de Privy
import attachUser from '../middleware/attachUser.js';
import { updateProfile, getUserProfile, newAddress, deleteAddress, getBankAccounts, getPublicUserProfile, completeSellerOnboarding, getSellerOnboardingStatus, updateShop } from '../controllers/userController.js';

// Ruta protegida
router.put('/update-profile', verifyPrivyToken, attachUser, updateProfile);
router.get('/profile', verifyPrivyToken, attachUser, getUserProfile);
router.post('/new-address', verifyPrivyToken, attachUser, newAddress);
router.delete('/address/:addressId', verifyPrivyToken, attachUser, deleteAddress);
router.get('/bank-accounts/:sellerId', getBankAccounts);

// Onboarding de vendedor
router.post('/seller-onboarding', verifyPrivyToken, attachUser, completeSellerOnboarding);
router.get('/seller-onboarding/status', verifyPrivyToken, attachUser, getSellerOnboardingStatus);

// Actualización de tienda (editar tienda, sin tocar cuentas bancarias)
router.put('/shop', verifyPrivyToken, attachUser, updateShop);

// Perfil público de un usuario (sin autenticación: cualquiera puede verlo)
router.get('/public/:userId', getPublicUserProfile);


export default router;