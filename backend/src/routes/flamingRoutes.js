import express from 'express';
import {
  getFlamingProductos,
  getFlamingCategories,
  flamingHealth,
  bulkImportFlaming,
} from '../controllers/flamingController.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador del catálogo de Flaming.
router.get('/productos', verifyAuth, getFlamingProductos);
router.get('/categories', verifyAuth, getFlamingCategories);
router.get('/health', verifyAuth, flamingHealth);

// Import masivo del catálogo a la tienda del admin autenticado.
router.post('/bulk-import', verifyAuth, bulkImportFlaming);

export default router;
