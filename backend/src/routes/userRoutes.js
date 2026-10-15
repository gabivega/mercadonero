import express from 'express';
const router = express.Router();
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import { updateProfile, getUserProfile, newAddress, deleteAddress, getBankAccounts, getPublicUserProfile, completeSellerOnboarding, getSellerOnboardingStatus, updateShop, getFavorites, addFavorite, removeFavorite, getPickupLocations, createPickupLocation, updatePickupLocation, deletePickupLocation, getSellerPickupLocations, saveWallet } from '../controllers/userController.js';

// ── WALLET WEB3 (Crossmint) ────────────────────────────────────────────
// El frontend crea la wallet y nos envía la address para asociarla a la cuenta.
router.post('/wallet', verifyAuth, attachUser, saveWallet);

// Ruta protegida
router.put('/update-profile', verifyAuth, attachUser, updateProfile);
router.get('/profile', verifyAuth, attachUser, getUserProfile);
router.post('/new-address', verifyAuth, attachUser, newAddress);
router.delete('/address/:addressId', verifyAuth, attachUser, deleteAddress);
router.get('/bank-accounts/:sellerId', getBankAccounts);

// Onboarding de vendedor
router.post('/seller-onboarding', verifyAuth, attachUser, completeSellerOnboarding);
router.get('/seller-onboarding/status', verifyAuth, attachUser, getSellerOnboardingStatus);

// Actualización de tienda (editar tienda, sin tocar cuentas bancarias)
router.put('/shop', verifyAuth, attachUser, updateShop);

// Perfil de un usuario (requiere sesión: solo usuarios registrados pueden verlo)
router.get('/public/:userId', verifyAuth, getPublicUserProfile);

// ── FAVORITOS (requieren sesión) ───────────────────────────────────────
router.get('/favorites', verifyAuth, attachUser, getFavorites);
router.post('/favorites/:productId', verifyAuth, attachUser, addFavorite);
router.delete('/favorites/:productId', verifyAuth, attachUser, removeFavorite);

// ── PUNTOS DE RETIRO ───────────────────────────────────────────────────
// CRUD del vendedor (requieren sesión).
router.get('/pickup-locations', verifyAuth, attachUser, getPickupLocations);
router.post('/pickup-locations', verifyAuth, attachUser, createPickupLocation);
router.put('/pickup-locations/:locationId', verifyAuth, attachUser, updatePickupLocation);
router.delete('/pickup-locations/:locationId', verifyAuth, attachUser, deletePickupLocation);
// Público: puntos activos de un vendedor (para el comprador).
router.get('/pickup-locations/seller/:sellerId', getSellerPickupLocations);


export default router;