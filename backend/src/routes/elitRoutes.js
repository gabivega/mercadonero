import express from 'express';
import {
  getElitProductos,
  elitHealth,
  importElitImages,
  previewElitSync,
  applyElitSync,
} from '../controllers/elitController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import requireElitAccess from '../middleware/requireElitAccess.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GATE DE ACCESO AL PROVEEDOR ELIT
// ─────────────────────────────────────────────────────────────────────────────
// Todas las rutas exigen: sesión válida (verifyAuth) + usuario de Mongo
// (attachUser) + permiso de Elit (requireElitAccess → admin O email en
// ELIT_ALLOWED_EMAILS).
//
// ANTES solo había `verifyAuth`: cualquier usuario logueado podía consumir el
// catálogo del proveedor pegándole directo a la API. Ahora es una defensa REAL,
// no solo la ocultación del link en el menú.
const gate = [verifyAuth, attachUser, requireElitAccess];

// Catálogo del proveedor (paginado) y chequeo de conectividad.
router.get('/productos', ...gate, getElitProductos);
router.get('/health', ...gate, elitHealth);
// Subir imágenes del proveedor a nuestra cuenta de Cloudinary.
router.post('/import-images', ...gate, importElitImages);

// ── Sincronización de stock/precios (flujo híbrido) ──────────────────────
// preview: compara y devuelve la tabla de diferencias (no escribe).
// apply:   aplica únicamente los cambios seleccionados por el usuario.
router.post('/sync/preview', ...gate, previewElitSync);
router.post('/sync/apply', ...gate, applyElitSync);

export default router;

