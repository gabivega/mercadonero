// routes/cashbackRoutes.js
import express from "express";
const router = express.Router();
import verifyPrivyToken from "../middleware/auth.js";
import attachUser from "../middleware/attachUser.js";
import {
  getMyCashback,
  useCashback,
  withdrawMyCashback,
} from "../controllers/cashbackController.js";

// Consultar mi cashback (balance, histórico y reglas que me aplican)
router.get("/", verifyPrivyToken, attachUser, getMyCashback);

// Usar cashback para descontar una compra dentro de la plataforma
router.post("/use", verifyPrivyToken, attachUser, useCashback);

// Retirar cashback fuera de la plataforma
router.post("/withdraw", verifyPrivyToken, attachUser, withdrawMyCashback);

export default router;
