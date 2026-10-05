import express from 'express';
import {
  getFlamingProductos,
  getFlamingCategories,
  flamingHealth,
  bulkImportFlaming,
} from '../controllers/flamingController.js';
import verifyPrivyToken from '../middleware/auth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador del catálogo de Flaming.
router.get('/productos', verifyPrivyToken, getFlamingProductos);
router.get('/categories', verifyPrivyToken, getFlamingCategories);
router.get('/health', verifyPrivyToken, flamingHealth);

// Import masivo del catálogo a la tienda del admin autenticado.
router.post('/bulk-import', verifyPrivyToken, bulkImportFlaming);

export default router;
