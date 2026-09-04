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

// Reseñas de un producto (públicas, para el detalle de producto)
router.get("/product/:productId", getProductReviews);

// Reseñas recibidas por un usuario (requiere sesión: solo usuarios
// registrados pueden ver el perfil de otro usuario y sus reseñas)
router.get("/user/:userId", verifyPrivyToken, getUserReviews);

export default router;
