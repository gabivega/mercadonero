import { PrivyClient } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

const verifyPrivyToken = async (req, res, next) => {
  const ahora = new Date(Date.now());

const formato = new Intl.DateTimeFormat('es-ES', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit', // Opcional
  hour12: false      // Formato 24h o 12h
});
  try {
    // console.log("User route hit middleware at: ", formato.format(ahora));

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const token = authHeader.split(' ')[1];
    
    // Validamos el token y obtenemos los claims (datos del usuario)
    const verifiedClaims = await privy.verifyAuthToken(token);
    // console.log("Verified claims:", verifiedClaims)
    // Guardamos el ID de Privy en el objeto req para usarlo en las rutas
    req.user = { did: verifiedClaims.userId };
    // console.log("User ID from Privy:", verifiedClaims.userId);
    
    next();
  } catch (error) {
    console.error("Error validando token de Privy:", error);
    res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export default verifyPrivyToken;
