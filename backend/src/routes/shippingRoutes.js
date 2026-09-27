import express from "express";
const router = express.Router();

import verifyPrivyToken from "../middleware/auth.js";
import attachUser from "../middleware/attachUser.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  getZipnovaStatus,
  quoteShipping,
} from "../controllers/shippingController.js";

// Estado de configuración del provider (útil para debug en dev).
router.get("/zipnova/status", getZipnovaStatus);

// Cotización de envíos (requiere sesión de usuario).
// Rate limit por usuario: cada cotización consume cuota de la cuenta Zipnova.
// 40 cotizaciones cada 5 minutos es holgado para uso real y frena el abuso.
router.post(
  "/quote",
  verifyPrivyToken,
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 40,
    message:
      "Estás haciendo demasiadas cotizaciones. Esperá unos minutos e intentá de nuevo.",
  }),
  attachUser,
  quoteShipping,
);

export default router;
