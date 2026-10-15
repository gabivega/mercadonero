import express from "express";
const router = express.Router();
import User from "../models/User.js";
import verifyAuth from "../middleware/verifyAuth.js";

/**
 * Sincroniza (o crea) el usuario en Mongo a partir de la sesión autenticada.
 * Durante la migración Privy → Supabase:
 *   - `req.user.authSource` indica el origen ("supabase" | "privy").
 *   - Buscamos por `supabaseId`/`privyDid` según corresponda, con fallback
 *     por `email` (para adoptar cuentas preexistentes sin duplicar).
 *   - Persistimos el id del origen en el campo que corresponda.
 */
router.post("/sync-user", verifyAuth, async (req, res) => {
  try {
    const { did, authSource } = req.user;
    // El email del JWT es la fuente de verdad; usamos el del body como fallback.
    const email = (req.user.email || req.body?.email || "").toLowerCase().trim();
    const { walletAddress } = req.body;

    // 1. Buscamos según el origen del token.
    let user = null;
    if (authSource === "supabase") {
      user = await User.findOne({ supabaseId: did });
    } else {
      user = await User.findOne({ privyDid: did });
    }

    // 2. Fallback por email (vinculación de cuentas preexistentes).
    if (!user && email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      // Generamos un username temporal a partir del id (uuid o did:privy:...).
      const shortId = String(did).replace(/[^a-z0-9]/gi, "").slice(-6) || "user";
      const tempUsername = `nero-${shortId}`;

      user = new User({
        email,
        walletAddress: walletAddress || undefined,
        username: tempUsername,
        role: "user",
        shop: {
          active: false,
          name: `Tienda de ${tempUsername}`,
        },
      });
    }

    // 3. Persistimos el identificador del origen + migración pasiva de datos.
    if (authSource === "supabase" && did) user.supabaseId = did;
    if (authSource === "privy" && did) user.privyDid = did;
    if (email && !user.email) user.email = email;
    if (!user.walletAddress && walletAddress) user.walletAddress = walletAddress;

    await user.save();
    res.status(200).json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al sincronizar usuario" });
  }
});

export default router;
