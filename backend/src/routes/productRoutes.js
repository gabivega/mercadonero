import express from 'express';
const router = express.Router();
import { createProduct, getMyProducts, deleteProduct, toggleProductStatus , getProducts, getProductById, updateProduct} from '../controllers/productController.js';
import { importFromMercadoLibre } from '../controllers/importController.js';
import { bulkImport } from '../controllers/bulkImportController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import requireSellerOnboarding from '../middleware/requireSellerOnboarding.js';

// Ruta protegida
router.get('/my-products', verifyAuth, attachUser, getMyProducts);
router.get('/products',getProducts);
router.get('/:id', getProductById);
router.post('/create', verifyAuth, attachUser, requireSellerOnboarding, createProduct);
router.post('/bulk-import', verifyAuth, attachUser, requireSellerOnboarding, bulkImport);
router.post('/import-mercadolibre', verifyAuth, attachUser, importFromMercadoLibre);
router.post('/import-meli', verifyAuth, attachUser, importFromMercadoLibre);
router.put('/update/:id', verifyAuth, attachUser, updateProduct);
router.patch('/toggle-status/:id', verifyAuth, attachUser, toggleProductStatus);
router.delete('/delete/:id', verifyAuth, attachUser, deleteProduct);

export default router;