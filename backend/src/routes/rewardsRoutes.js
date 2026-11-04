// routes/rewardsRoutes.js
import express from "express";
const router = express.Router();
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import {
  getMyRewardsSummary,
  claimMySellerCredit,
  quoteRewardsForCheckout,
} from "../controllers/rewardsController.js";

// Resumen de saldo de recompensas (usable en checkout + retirable + crédito seller).
router.get("/summary", verifyAuth, attachUser, getMyRewardsSummary);

// Cotización del descuento por recompensas para un pedido (solo productos).
router.post("/quote", verifyAuth, attachUser, quoteRewardsForCheckout);

// Reclamar saldo a favor del seller (créditos por compras pagadas con saldo).
router.post("/seller-claim", verifyAuth, attachUser, claimMySellerCredit);

export default router;
