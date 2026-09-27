import express from 'express';
import { getElitProductos, elitHealth, importElitImages } from '../controllers/elitController.js';
import verifyPrivyToken from '../middleware/auth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador de catálogo de Elit.
router.get('/productos', verifyPrivyToken, getElitProductos);
router.get('/health', verifyPrivyToken, elitHealth);
router.post('/import-images', verifyPrivyToken, importElitImages);

export default router;
