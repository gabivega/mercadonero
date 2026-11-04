// routes/redirectRoutes.js
// Montado en la raíz: /r/<code>
import express from "express";
const router = express.Router();
import { resolveReferralLink } from "../controllers/referralLinkController.js";

// Enlace corto público de referido: cuenta el clic y redirige al producto.
router.get("/:code", resolveReferralLink);

export default router;
