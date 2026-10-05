import express from 'express';
import {
  getElitProductos,
  elitHealth,
  importElitImages,
  previewElitSync,
  applyElitSync,
} from '../controllers/elitController.js';
import verifyPrivyToken from '../middleware/auth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador de catálogo de Elit.
router.get('/productos', verifyPrivyToken, getElitProductos);
router.get('/health', verifyPrivyToken, elitHealth);
router.post('/import-images', verifyPrivyToken, importElitImages);

// ── Sincronización de stock/precios (flujo híbrido) ──────────────────────
// preview: compara y devuelve la tabla de diferencias (no escribe).
// apply:   aplica únicamente los cambios seleccionados por el usuario.
router.post('/sync/preview', verifyPrivyToken, previewElitSync);
router.post('/sync/apply', verifyPrivyToken, applyElitSync);

export default router;
