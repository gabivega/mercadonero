import express from 'express';
import {
  getDirectcarProductos,
  getDirectcarCategories,
  directcarHealth,
  bulkImportDirectcar,
} from '../controllers/directcarController.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador del catálogo de DirectCar.
router.get('/productos', verifyAuth, getDirectcarProductos);
router.get('/categories', verifyAuth, getDirectcarCategories);
router.get('/health', verifyAuth, directcarHealth);

// Import masivo del catálogo a la tienda del admin autenticado.
router.post('/bulk-import', verifyAuth, bulkImportDirectcar);

export default router;
