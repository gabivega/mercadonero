// routes/referralRoutes.js
import express from "express";
const router = express.Router();
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import { getMyReferral, withdrawMyReferral } from "../controllers/referralController.js";

// Consultar mis referidos (balance, histórico, tope de % que aplica).
router.get("/", verifyAuth, attachUser, getMyReferral);

// Retirar saldo de referidos fuera de la plataforma (a la wallet del usuario).
router.post("/withdraw", verifyAuth, attachUser, withdrawMyReferral);

export default router;
