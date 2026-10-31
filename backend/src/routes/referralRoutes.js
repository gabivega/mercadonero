// routes/referralRoutes.js
import express from "express";
const router = express.Router();
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import {
  getMyReferral,
  getMyReferralStatus,
  requestReferral,
  withdrawMyReferral,
} from "../controllers/referralController.js";

// Estado del usuario frente al programa de referidores (gate de la vista).
// Va ANTES de "/" para no colisionar con rutas genéricas.
router.get("/status", verifyAuth, attachUser, getMyReferralStatus);

// Solicitar ser referidor (requiere perfil completo; aprobación manual).
router.post("/request", verifyAuth, attachUser, requestReferral);

// Consultar mis referidos (balance, histórico, tope de % que aplica).
router.get("/", verifyAuth, attachUser, getMyReferral);

// Retirar saldo de referidos fuera de la plataforma (a la wallet del usuario).
router.post("/withdraw", verifyAuth, attachUser, withdrawMyReferral);

export default router;
