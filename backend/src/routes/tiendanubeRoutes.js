import express from 'express';
import {
  getTiendanubeProductos,
  getTiendanubeProducto,
  tiendanubeHealth,
  importTiendanubeProduct,
  bulkImportTiendanube,
} from '../controllers/tiendanubeController.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador del catálogo de Tiendanube.
router.get('/productos', verifyAuth, getTiendanubeProductos);
router.get('/producto', verifyAuth, getTiendanubeProducto);
router.get('/health', verifyAuth, tiendanubeHealth);

// Import individual (un producto puntual por URL).
router.post('/import', verifyAuth, importTiendanubeProduct);

// Import masivo del catálogo a la tienda del admin autenticado.
router.post('/bulk-import', verifyAuth, bulkImportTiendanube);

export default router;
