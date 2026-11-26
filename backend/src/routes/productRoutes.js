import express from 'express';
const router = express.Router();
import { createProduct, getMyProducts, getMyProductById, deleteProduct, toggleProductStatus , getProducts, getProductById, updateProduct, getVisibleCategories, getProductsByIds} from '../controllers/productController.js';
import { importFromMercadoLibre } from '../controllers/importController.js';
import { bulkImport, getBulkImportQuota } from '../controllers/bulkImportController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import requireSellerOnboarding from '../middleware/requireSellerOnboarding.js';

// Ruta protegida
router.get('/my-products', verifyAuth, attachUser, getMyProducts);
// Detalle COMPLETO de un producto propio (para el modal de edición). Devuelve
// description/specifications, que el listado excluye por peso. Debe ir ANTES
// de '/:id' para que Express no lo matchee como un id público.
router.get('/my-products/:id', verifyAuth, attachUser, getMyProductById);
// ⚠️ ORDEN CRÍTICO: '/categories' va ANTES de '/:id'. Si estuviera después,
// Express matchearía '/categories' como un id de producto y devolvería 404
// desde getProductById (el error clásico de "ruta que no existe").
router.get('/categories', getVisibleCategories);
// Destacados del Home: lista MANUAL de ids (siempre antes de '/:id').
router.get('/featured', getProductsByIds);
router.get('/products',getProducts);
router.get('/:id', getProductById);
router.post('/create', verifyAuth, attachUser, requireSellerOnboarding, createProduct);
router.post('/bulk-import', verifyAuth, attachUser, requireSellerOnboarding, bulkImport);
// Cupo de publicaciones de la cuenta (informativo, para el panel de carga
// masiva). Va DESPUÉS de '/bulk-import' a propósito: si fuera un GET /:algo
// que matchee primero, taparía la ruta. Acá los métodos difieren (GET vs POST)
// así que no colisionan.
router.get('/bulk-import/quota', verifyAuth, attachUser, getBulkImportQuota);
router.post('/import-mercadolibre', verifyAuth, attachUser, importFromMercadoLibre);
router.post('/import-meli', verifyAuth, attachUser, importFromMercadoLibre);
router.put('/update/:id', verifyAuth, attachUser, updateProduct);
router.patch('/toggle-status/:id', verifyAuth, attachUser, toggleProductStatus);
router.delete('/delete/:id', verifyAuth, attachUser, deleteProduct);

export default router;