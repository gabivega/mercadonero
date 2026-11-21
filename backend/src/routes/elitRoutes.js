import express from 'express';
import {
  getElitProductos,
  elitHealth,
  importElitImages,
  previewElitSync,
  applyElitSync,
  importElitProduct,
  bulkImportElit,
} from '../controllers/elitController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';
import requireElitAccess from '../middleware/requireElitAccess.js';
import requireSellerOnboarding from '../middleware/requireSellerOnboarding.js';

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

// ── Importación a la tienda (individual y masiva) ─────────────────────────
// Además del gate de proveedor, exigimos requireSellerOnboarding: publicar
// (aunque sea importando) requiere onboarding completo + tienda APROBADA, tal
// como POST /api/product/create y /api/product/bulk-import (ver AGENTS.md §5b).
// Así un usuario con acceso al catálogo pero SIN tienda habilitada no puede
// llenar sus publicaciones de productos del proveedor.
router.post('/import', ...gate, requireSellerOnboarding, importElitProduct);
router.post('/bulk-import', ...gate, requireSellerOnboarding, bulkImportElit);

export default router;

