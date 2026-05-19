// middleware/isAdmin.js
export const isAdmin = (req, res, next) => {
  const ADMIN_ID = process.env.ADMIN_PRIVY_ID;

  // El did viene inyectado desde verifyPrivyToken
  if (req.user && req.user.did === ADMIN_ID) {
    return next();
  }

  // Si no coincide, bloqueamos el acceso antes de llegar al controlador
  return res.status(403).json({ 
    message: "Acceso denegado: No tienes permisos de administrador." 
  });
};