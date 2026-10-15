import express from 'express';
import {
  getElitProductos,
  elitHealth,
  importElitImages,
  previewElitSync,
  applyElitSync,
} from '../controllers/elitController.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = express.Router();

// Sólo usuarios autenticados pueden usar el explorador de catálogo de Elit.
router.get('/productos', verifyAuth, getElitProductos);
router.get('/health', verifyAuth, elitHealth);
router.post('/import-images', verifyAuth, importElitImages);

// ── Sincronización de stock/precios (flujo híbrido) ──────────────────────
// preview: compara y devuelve la tabla de diferencias (no escribe).
// apply:   aplica únicamente los cambios seleccionados por el usuario.
router.post('/sync/preview', verifyAuth, previewElitSync);
router.post('/sync/apply', verifyAuth, applyElitSync);

export default router;
