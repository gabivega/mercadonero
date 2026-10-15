import User from '../models/User.js';

/**
 * Middleware que vincula el usuario autenticado (req.user) con su documento
 * de Mongo y lo carga en req.user._id, req.user.role, etc.
 *
 * Durante la migración Privy → Supabase el usuario puede venir con:
 *   - authSource = "supabase"  → buscamos por `supabaseId` (uuid)
 *   - authSource = "privy"     → buscamos por `privyDid`
 *
 * Fallbacks (para no romper nada en la transición):
 *   1. Si no aparece por el id correspondiente, probamos por `email`.
 *      Esto permite "adoptar" cuentas preexistentes (creadas con Privy)
 *      cuando el usuario entra por primera vez con Supabase, sin duplicar.
 *   2. Al encontrar la cuenta por email, rellenamos el id faltante
 *      (`supabaseId` o `privyDid`) para que el próximo login sea directo.
 */
const attachUser = async (req, res, next) => {
  try {
    const { did, email, authSource } = req.user;

    // 1. Buscamos por el id que corresponda según el origen del token.
    let user = null;
    if (authSource === 'supabase') {
      user = await User.findOne({ supabaseId: did });
    } else if (authSource === 'privy') {
      user = await User.findOne({ privyDid: did });
    } else {
      // Compatibilidad con middlewares viejos que solo setean `did`.
      user = await User.findOne({ privyDid: did });
    }

    // 2. Fallback por email (vinculación pasiva de cuentas preexistentes).
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
      if (user) {
        // Rellenamos el id que faltaba para acelerar los próximos logins.
        let touched = false;
        if (authSource === 'supabase' && !user.supabaseId) {
          user.supabaseId = did;
          touched = true;
        }
        if (authSource === 'privy' && !user.privyDid) {
          user.privyDid = did;
          touched = true;
        }
        if (touched) {
          try {
            await user.save();
          } catch (saveErr) {
            // No bloqueamos el request si falla el "touch" (p.ej. índice único).
            console.warn(
              'attachUser: no se pudo vincular el id al usuario existente:',
              saveErr.message,
            );
          }
        }
      }
    }

    if (!user) {
      return res.status(404).json({ message: "Usuario no vinculado en la DB" });
    }

    // Inyectamos el ID de MongoDB y otros datos útiles
    req.user._id = user._id;
    req.user.role = user.role; // "user" | "admin"
    // Wallet Web3 (para flujos de escrow on-chain: pools, crypto, etc.).
    req.user.walletAddress = user.walletAddress || "";

    next();
  } catch (error) {
    console.error("attachUser error:", error);
    res.status(500).json({ message: "Error al identificar usuario" });
  }
};


export default attachUser;