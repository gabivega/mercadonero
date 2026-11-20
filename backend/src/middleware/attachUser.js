import User from '../models/User.js';

/**
 * Middleware que vincula el usuario autenticado (req.user) con su documento
 * de Mongo y lo carga en req.user._id, req.user.role, etc.
 *
 * Desde la eliminación de Privy, la ÚNICA identidad de auth es `supabaseId`
 * (el uuid del JWT de Supabase). El fallback por `privyDid` se quitó junto con
 * el paquete @privy-io: todos los usuarios de la base tienen `supabaseId`, así
 * que no queda ninguna cuenta que dependa del campo viejo.
 *
 * Fallback que SÍ se conserva:
 *   1. Si no aparece por `supabaseId`, probamos por `email`. Esto adopta
 *      cuentas preexistentes cuyo `supabaseId` quedó vacío (p. ej. un doc
 *      creado por un importador/scraper) y lo rellena para el próximo login.
 */
const attachUser = async (req, res, next) => {
  try {
    const { did, email } = req.user;

    // 1. Buscamos por el id de Supabase.
    let user = null;
    if (did) {
      user = await User.findOne({ supabaseId: did });
    }
        // 2. Fallback por email (vinculación pasiva de cuentas preexistentes).
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
      if (user && did && !user.supabaseId) {
        // Rellenamos el id que faltaba para acelerar los próximos logins.
        user.supabaseId = did;
        try {
          await user.save();
        } catch (saveErr) {
          // No bloqueamos el request si falla el "touch" (p.ej. índice único).
          console.warn(
            'attachUser: no se pudo vincular el supabaseId al usuario existente:',
            saveErr.message,
          );
        }
      }
    }
    if (!user) {
      return res.status(404).json({ message: "Usuario no vinculado en la DB" });
    }

    // ── BLOQUEO POR ESTADO DE CUENTA ──
    // Si la cuenta fue suspendida/desactivada/eliminada, NO permitimos operar.
    // Devolvemos 403 con un código claro para que el front muestre el mensaje
    // correspondiente y cierre la sesión. Excepción: si es admin por email/rol
    // dejamos pasar (evita que un admin se auto-bloquee por error).
    const accountStatus = user.accountStatus || "active";
    if (accountStatus !== "active") {
      const isAdminAccount =
        user.role === "admin" ||
        (email &&
          String(process.env.ADMIN_EMAILS || "")
            .toLowerCase()
            .split(/[,;]+/)
            .map((e) => e.trim())
            .includes(String(email).toLowerCase().trim()));
      if (!isAdminAccount) {
        const messages = {
          suspended: "Tu cuenta está suspendida. Contactá a soporte.",
          deactivated: "Tu cuenta está desactivada.",
          deleted: "Esta cuenta fue eliminada.",
        };
        return res.status(403).json({
          message: messages[accountStatus] || "Tu cuenta no está habilitada.",
          code: "ACCOUNT_NOT_ACTIVE",
          accountStatus,
        });
      }
    }

    // Inyectamos el ID de MongoDB y otros datos útiles
    req.user._id = user._id;
    req.user.role = user.role; // "user" | "admin"
    req.user.accountStatus = accountStatus;
    // Wallet Web3 (para flujos de escrow on-chain: pools, crypto, etc.).
    req.user.walletAddress = user.walletAddress || "";

    next();
  } catch (error) {
    console.error("attachUser error:", error);
    res.status(500).json({ message: "Error al identificar usuario" });
  }
};


export default attachUser;