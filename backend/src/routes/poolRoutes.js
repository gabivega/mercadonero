import express from "express";
const router = express.Router();

import verifyPrivyToken from "../middleware/auth.js";
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
router.get("/seller", verifyPrivyToken, attachUser, getSellerPools);
// Grupos en los que participa el usuario logueado (creador o miembro).
// ⚠️ También ANTES de "/:id".
router.get("/mine", verifyPrivyToken, attachUser, getBuyerPools);

// Detalle de un pool por id (deep-link /pool/:id).
router.get("/:id", getPoolById);

router.post("/create", verifyPrivyToken, attachUser, createPool);
router.post("/:id/join", verifyPrivyToken, attachUser, joinPool);
router.delete("/:id/leave", verifyPrivyToken, attachUser, leavePool);
router.patch("/:id/cancel", verifyPrivyToken, attachUser, cancelPool);
// Rollback de un pool provisional (creación sin fondeo completado).
router.delete("/:id/rollback", verifyPrivyToken, attachUser, rollbackPool);

// ── ESCROW ON-CHAIN DEL GRUPO ───────────────────────────────────────
// 1) Preparar el fondeo (datos + gas drip) antes de que el comprador firme.
router.post(
  "/:id/prepare-funding",
  verifyPrivyToken,
  attachUser,
  preparePoolFunding,
);
// 2) Confirmar el fondeo on-chain (verifica la tx + reserva stock).
router.post(
  "/:id/escrow/fund",
  verifyPrivyToken,
  attachUser,
  confirmPoolFunding,
);
// 3) Cerrar el grupo (SOLO ADMIN): fija precio final + crea las órdenes.
router.post("/:id/close", verifyPrivyToken, isAdmin, closePool);
// 4) Liberar la porción de un comprador (confirmó recepción).
router.post(
  "/:id/release-member",
  verifyPrivyToken,
  attachUser,
  releasePoolMember,
);

export default router;
