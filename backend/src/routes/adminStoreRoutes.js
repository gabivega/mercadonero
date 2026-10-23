import express from 'express';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import { isAdmin } from '../middleware/isAdmin.js';
import {
  listStoreConnections,
  createStoreConnection,
  sendVerificationOtp,
  verifyStoreConnection,
  updateStoreConnection,
  deleteStoreConnection,
} from '../controllers/adminStoreController.js';

const router = express.Router();

// Todas las rutas: auth + attachUser (para role) + isAdmin.
router.use(verifyAuth, attachUser, isAdmin);

router.get('/', listStoreConnections);
router.post('/', createStoreConnection);
router.post('/:id/send-otp', sendVerificationOtp);
router.post('/:id/verify', verifyStoreConnection);
router.patch('/:id', updateStoreConnection);
router.delete('/:id', deleteStoreConnection);

export default router;
