import express from 'express';
const router = express.Router();
import verifyPrivyToken from '../middleware/auth.js'; // Tu archivo de Privy
import attachUser from '../middleware/attachUser.js';
import { updateProfile, getUserProfile, newAddress, deleteAddress, getBankAccounts, getPublicUserProfile, completeSellerOnboarding, getSellerOnboardingStatus, updateShop, getFavorites, addFavorite, removeFavorite, getPickupLocations, createPickupLocation, updatePickupLocation, deletePickupLocation, getSellerPickupLocations } from '../controllers/userController.js';

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

// Perfil de un usuario (requiere sesión: solo usuarios registrados pueden verlo)
router.get('/public/:userId', verifyPrivyToken, getPublicUserProfile);

// ── FAVORITOS (requieren sesión) ───────────────────────────────────────
router.get('/favorites', verifyPrivyToken, attachUser, getFavorites);
router.post('/favorites/:productId', verifyPrivyToken, attachUser, addFavorite);
router.delete('/favorites/:productId', verifyPrivyToken, attachUser, removeFavorite);

// ── PUNTOS DE RETIRO ───────────────────────────────────────────────────
// CRUD del vendedor (requieren sesión).
router.get('/pickup-locations', verifyPrivyToken, attachUser, getPickupLocations);
router.post('/pickup-locations', verifyPrivyToken, attachUser, createPickupLocation);
router.put('/pickup-locations/:locationId', verifyPrivyToken, attachUser, updatePickupLocation);
router.delete('/pickup-locations/:locationId', verifyPrivyToken, attachUser, deletePickupLocation);
// Público: puntos activos de un vendedor (para el comprador).
router.get('/pickup-locations/seller/:sellerId', getSellerPickupLocations);


export default router;