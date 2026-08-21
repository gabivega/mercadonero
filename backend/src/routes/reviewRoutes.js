import express from "express";
const router = express.Router();
import verifyPrivyToken from "../middleware/auth.js";
import attachUser from "../middleware/attachUser.js";
import {
  createProductReview,
  createUserReview,
  getOrderReviews,
  getProductReviews,
  getUserReviews,
} from "../controllers/reviewController.js";

// Rutas protegidas (requieren sesión)
router.post("/product", verifyPrivyToken, attachUser, createProductReview);
router.post("/user", verifyPrivyToken, attachUser, createUserReview);
router.get("/order/:orderId", verifyPrivyToken, attachUser, getOrderReviews);

// Rutas públicas (para mostrar ratings en el detalle de producto y perfil)
router.get("/product/:productId", getProductReviews);
router.get("/user/:userId", getUserReviews);

export default router;
