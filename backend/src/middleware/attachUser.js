import User from '../models/User.js';

const attachUser = async (req, res, next) => {
  try {
    // req.user.did ya fue cargado por el middleware de Privy
    const user = await User.findOne({ privyDid: req.user.did });
    // console.log("en attach user: ", user)
    if (!user) {    
      return res.status(404).json({ message: "Usuario no vinculado en la DB" });
    }

    // Inyectamos el ID de MongoDB y otros datos útiles
    req.user._id = user._id; 
    req.user.role = user.role; // Por si después tenés admins
    
    next();
  } catch (error) {
    res.status(500).json({ message: "Error al identificar usuario" });
  }
};


export default attachUser;