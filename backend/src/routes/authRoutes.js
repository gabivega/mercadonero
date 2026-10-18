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
    // Normalizamos la wallet a minúsculas (las EVM son case-insensitive). Así
    // la búsqueda por wallet y el guardado usan SIEMPRE la misma forma, y una
    // address en formato checksum no esquivar el índice único.
    const walletAddress = req.body?.walletAddress
      ? String(req.body.walletAddress).trim().toLowerCase()
      : undefined;

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

    // 2.b Fallback por walletAddress.
    // ────────────────────────────────────────────────────────────────────
    // La wallet es una identidad ALTERNATIVA del usuario. Si llega un login
    // con otro email/supabaseId pero con una wallet YA registrada en otra
    // cuenta, NO debemos crear un user nuevo: eso dispara E11000 en el índice
    // único `walletAddress_1`. En su lugar, ADOPTAMOS la cuenta existente y le
    // vinculamos la nueva identidad de auth (igual lógica que el fallback por
    // email). Esto cubre el caso típico de "entrar con otro proveedor/mail
    // pero la misma billetera Crossmint".
    let byWallet = null;
    if (!user && walletAddress) {
      byWallet = await User.findOne({ walletAddress });
    }
    if (!user && byWallet) {
      user = byWallet;

      // Si la cuenta adoptada ya tenía OTRO email, no lo pisamos silenciosamente:
      // devolvemos 409 con contexto para que el front lo resuelva (o el usuario
      // confirme el vínculo). Evita fusionar identidades distintas de forma
      // accidental, que podría mezclar historial/órdenes.
      if (
        email &&
        user.email &&
        String(user.email).toLowerCase() !== email
      ) {
        return res.status(409).json({
          message:
            "Esta billetera ya está vinculada a otra cuenta. Iniciá sesión con el email asociado a la billetera.",
          code: "WALLET_ALREADY_LINKED",
          walletAddress,
        });
      }
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
    // ── Red de seguridad ante colisión de identidad (carrera entre find/save) ──
    // Si dos requests simultáneos intentan crear/actualizar el mismo user con
    // la misma wallet/email, el índice único puede saltar igual. Lo traducimos
    // a un 409 claro en vez de un 500 genérico.
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "campo único";
      console.warn(
        `[sync-user] Colisión de clave única (${field}): ${JSON.stringify(error.keyValue)}`
      );
      return res.status(409).json({
        message:
          field === "walletAddress"
            ? "Esta billetera ya está vinculada a otra cuenta."
            : "Ya existe una cuenta con estos datos.",
        code: "DUPLICATE_KEY",
        field,
      });
    }

    console.log(error);
    res.status(500).json({ message: "Error al sincronizar usuario" });
  }
});

export default router;

