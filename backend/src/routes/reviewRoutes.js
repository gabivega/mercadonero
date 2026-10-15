import express from "express";
const router = express.Router();
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import {
  createProductReview,
  createUserReview,
  getOrderReviews,
  getProductReviews,
  getUserReviews,
} from "../controllers/reviewController.js";

// Rutas protegidas (requieren sesión)
router.post("/product", verifyAuth, attachUser, createProductReview);
router.post("/user", verifyAuth, attachUser, createUserReview);
router.get("/order/:orderId", verifyAuth, attachUser, getOrderReviews);

// Reseñas de un producto (públicas, para el detalle de producto)
router.get("/product/:productId", getProductReviews);

// Reseñas recibidas por un usuario (requiere sesión: solo usuarios
// registrados pueden ver el perfil de otro usuario y sus reseñas)
router.get("/user/:userId", verifyAuth, getUserReviews);

export default router;
