import express from "express";
import verifySupabaseToken from "../middleware/authSupabase.js";

const router = express.Router();

/**
 * Ruta de prueba SOLO para validar el flujo de Supabase Auth.
 * No toca ninguna ruta de negocio ni el flujo de Privy.
 *
 *   GET /api/test-auth/me
 *   Header: Authorization: Bearer <supabase access_token>
 */
router.get("/me", verifySupabaseToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;
