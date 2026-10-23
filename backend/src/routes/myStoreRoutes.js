import express from 'express';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import {
  getMyStoreStatus,
  getMyStoreCategories,
  getMyStoreProducts,
  getMyStoreProduct,
  importMyStoreProduct,
  bulkImportMyStore,
  getMyStoreSyncPreview,
  applyMyStoreSync,
  mapCategoryInfo,
} from '../controllers/myStoreController.js';

const router = express.Router();

// Todas las rutas requieren autenticación + doc de usuario.
router.use(verifyAuth, attachUser);

// Estado de la conexión del usuario.
router.get('/status', getMyStoreStatus);

// Exploración del catálogo del proveedor (scopeado al dominio conectado).
router.get('/categories', getMyStoreCategories);
router.get('/products', getMyStoreProducts);
router.get('/product', getMyStoreProduct);

// Import.
router.post('/import', importMyStoreProduct);
router.post('/bulk-import', bulkImportMyStore);

// Sync stock/precio.
router.get('/sync/preview', getMyStoreSyncPreview);
router.post('/sync/apply', applyMyStoreSync);

// Helper de mapeo de categorías (para preview del front).
router.post('/map-category', mapCategoryInfo);

export default router;
