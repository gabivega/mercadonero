import express from 'express';
const router = express.Router();
import { createProduct, getMyProducts, deleteProduct, toggleProductStatus , getProducts, getProductById, updateProduct} from '../controllers/productController.js';
import { importFromMercadoLibre } from '../controllers/importController.js';
import { bulkImport } from '../controllers/bulkImportController.js';
import verifyPrivyToken from '../middleware/auth.js'; // Tu archivo de Privy
import attachUser from '../middleware/attachUser.js';
import requireSellerOnboarding from '../middleware/requireSellerOnboarding.js';

// Ruta protegida
router.get('/my-products', verifyPrivyToken, getMyProducts);
router.get('/products',getProducts);
router.get('/:id', getProductById);
router.post('/create', verifyPrivyToken, attachUser, requireSellerOnboarding, createProduct);
router.post('/bulk-import', verifyPrivyToken, attachUser, requireSellerOnboarding, bulkImport);
router.post('/import-mercadolibre', verifyPrivyToken, attachUser, importFromMercadoLibre);
router.post('/import-meli', verifyPrivyToken, attachUser, importFromMercadoLibre);
router.put('/update/:id', verifyPrivyToken, attachUser, updateProduct);
router.patch('/toggle-status/:id', verifyPrivyToken, attachUser, toggleProductStatus);
router.delete('/delete/:id', verifyPrivyToken, attachUser, deleteProduct);

export default router;