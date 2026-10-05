// routes/referralRoutes.js
import express from "express";
const router = express.Router();
import verifyPrivyToken from "../middleware/auth.js";
import attachUser from "../middleware/attachUser.js";
import { getMyReferral, withdrawMyReferral } from "../controllers/referralController.js";

// Consultar mis referidos (balance, histórico, tope de % que aplica).
router.get("/", verifyPrivyToken, attachUser, getMyReferral);

// Retirar saldo de referidos fuera de la plataforma (a la wallet del usuario).
router.post("/withdraw", verifyPrivyToken, attachUser, withdrawMyReferral);

export default router;
