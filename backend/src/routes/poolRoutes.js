import express from "express";
const router = express.Router();

import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  createPool,
  joinPool,
  leavePool,
  cancelPool,
  rollbackPool,
  getPoolsByProduct,
  getPoolById,
  getActivePools,
  getSellerPools,
  getBuyerPools,
  preparePoolFunding,
  confirmPoolFunding,
  closePool,
  releasePoolMember,
} from "../controllers/poolController.js";

// ── Públicas ────────────────────────────────────────────────────────
// Listado global de pools activos (carousels de Home).
router.get("/", getActivePools);
// Pools de un producto específico (sección de Compra en Grupo).
router.get("/product/:productId", getPoolsByProduct);

// ── Protegidas (requieren sesión) ───────────────────────────────────
// ⚠️ Debe ir ANTES de "/:id" (si no, "/seller" matchea como un id).
router.get("/seller", verifyAuth, attachUser, getSellerPools);
// Grupos en los que participa el usuario logueado (creador o miembro).
// ⚠️ También ANTES de "/:id".
router.get("/mine", verifyAuth, attachUser, getBuyerPools);

// Detalle de un pool por id (deep-link /pool/:id).
router.get("/:id", getPoolById);

router.post("/create", verifyAuth, attachUser, createPool);
router.post("/:id/join", verifyAuth, attachUser, joinPool);
router.delete("/:id/leave", verifyAuth, attachUser, leavePool);
router.patch("/:id/cancel", verifyAuth, attachUser, cancelPool);
// Rollback de un pool provisional (creación sin fondeo completado).
router.delete("/:id/rollback", verifyAuth, attachUser, rollbackPool);

// ── ESCROW ON-CHAIN DEL GRUPO ───────────────────────────────────────
// 1) Preparar el fondeo (datos + gas drip) antes de que el comprador firme.
router.post(
  "/:id/prepare-funding",
  verifyAuth,
  attachUser,
  preparePoolFunding,
);
// 2) Confirmar el fondeo on-chain (verifica la tx + reserva stock).
router.post(
  "/:id/escrow/fund",
  verifyAuth,
  attachUser,
  confirmPoolFunding,
);
// 3) Cerrar el grupo (SOLO ADMIN): fija precio final + crea las órdenes.
router.post("/:id/close", verifyAuth, attachUser, isAdmin, closePool);
// 4) Liberar la porción de un comprador (confirmó recepción).
//
// ⛔ C5: SOLO ADMIN. Antes esta ruta solo exigía `verifyAuth` + `attachUser`:
// el handler comprobaba que quien llama fuera MIEMBRO del grupo, pero unirse a
// un grupo es gratis. Cualquier usuario podía crear/se unir a un pool y
// disparar una liberación de escrow firmada por la wallet admin, sin que
// estuvieran validados el estado del grupo, de la orden ni del pago. En
// combinación con el fondeo nativo (C4) eso permitía vaciar el balance nativo
// del contrato de escrow.
// Liberar fondos es una acción privilegiada: la decide el admin, no el
// comprador. (Las compras grupales están deshabilitadas hoy: no rompe nada.)
router.post(
  "/:id/release-member",
  verifyAuth,
  attachUser,
  isAdmin,
  releasePoolMember,
);

export default router;
