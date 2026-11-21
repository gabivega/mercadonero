import express from "express";
const router = express.Router();
import User from "../models/User.js";
import verifyAuth from "../middleware/verifyAuth.js";

/**
 * Sincroniza (o crea) el usuario en Mongo a partir de la sesión autenticada
 * de SUPABASE (única fuente de auth tras eliminar Privy).
 *
 *   - `req.user.did` es el uuid de Supabase.
  *   - Buscamos por `supabaseId`, con fallbacks por `email` y `walletAddress`
 *     (para adoptar cuentas preexistentes sin duplicar).
 *
 * ⚠️ IMPORTANTE — LA WALLET NO SE ESCRIBE DESDE ACÁ (bug 2026-11):
 *   Antes este endpoint aceptaba `walletAddress` del body y lo guardaba en el
 *   usuario si el campo estaba vacío. Eso permitía que el CLIENTE dictara la
 *   wallet de una cuenta. Combinado con el `dbUser` de Zustand persistido en
 *   localStorage (que puede sobrevivir a un cambio de sesión sin logout),
 *   provocaba que un usuario NUEVO heredara la wallet del usuario ANTERIOR
 *   logueado. Visto en producción: `atomichardware@protonmail.com` quedó con
 *   la address del admin.
 *
 *   La wallet es un dato de NEGOCIO, no una identidad de auth: se vincula
 *   únicamente vía `POST /api/user/wallet` (saveWallet), que valida unicidad.
 *   Acá el `walletAddress` del body se usa SOLO como señal para detectar una
 *   colisión y responder 409; NUNCA para escribir en el documento.
 */
router.post("/sync-user", verifyAuth, async (req, res) => {
  try {
    const { did } = req.user;
    // El email del JWT es la fuente de verdad; usamos el del body como fallback.
        const email = (req.user.email || req.body?.email || "").toLowerCase().trim();
        // Normalizamos la wallet a minúsculas (las EVM son case-insensitive). Solo
    // se usa para BUSCAR/validar colisiones; NO se persiste desde este endpoint.
    const walletAddress = req.body?.walletAddress
      ? String(req.body.walletAddress).trim().toLowerCase()
      : undefined;

    // 1. Buscamos por el id de Supabase.
    let user = did ? await User.findOne({ supabaseId: did }) : null;
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
      // Generamos un username temporal a partir del uuid de Supabase.
      const shortId = String(did).replace(/[^a-z0-9]/gi, "").slice(-6) || "user";
      const tempUsername = `nero-${shortId}`;

            // ⚠️ El usuario NACE SIN WALLET (ver nota del encabezado). La wallet se
      // vincula luego con POST /api/user/wallet cuando crea su billetera.
      user = new User({
        email,
        username: tempUsername,
        role: "user",
        shop: {
          active: false,
          name: `Tienda de ${tempUsername}`,
        },
      });
    }

        // ── GUARD DE UNICIDAD DE WALLET (defensa en profundidad) ─────────────
    // Si el cliente nos manda una wallet que YA pertenece a OTRA cuenta, lo
    // rechazamos explícitamente. Sin esto, un `dbUser` viejo en localStorage
    // (del login anterior) podía hacer que sync-user intentara escribir la
    // address ajena. Devolvemos 409 para que el front limpie el estado y el
    // usuario vuelva a iniciar sesión / cree su propia billetera.
    if (walletAddress) {
      const owner = await User.findOne({ walletAddress }).select("_id");
      if (owner && String(owner._id) !== String(user._id)) {
        return res.status(409).json({
          message:
            "Esta billetera ya está vinculada a otra cuenta. Iniciá sesión con el email asociado a la billetera.",
          code: "WALLET_ALREADY_LINKED",
          walletAddress,
        });
      }
    }

    // 3. Persistimos el identificador del origen + migración pasiva de datos.
    //    ⚠️ `walletAddress` NO se asigna acá (ver nota del encabezado): la
    //    wallet sólo se vincula con POST /api/user/wallet.
        if (did) user.supabaseId = did;
    if (email && !user.email) user.email = email;

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

