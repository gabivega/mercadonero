// routes/cashbackRoutes.js
import express from "express";
const router = express.Router();
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import {
  getMyCashback,
  useCashback,
  withdrawMyCashback,
} from "../controllers/cashbackController.js";

// Consultar mi cashback (balance, histórico y reglas que me aplican)
router.get("/", verifyAuth, attachUser, getMyCashback);

// Usar cashback para descontar una compra dentro de la plataforma
router.post("/use", verifyAuth, attachUser, useCashback);

// Retirar cashback fuera de la plataforma
router.post("/withdraw", verifyAuth, attachUser, withdrawMyCashback);

export default router;
