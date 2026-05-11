import express from 'express';
const router = express.Router();
import User from '../models/User.js'; 
import verifyPrivyToken from '../middleware/auth.js';

// Esta ruta está protegida por el middleware
router.post('/sync-user', verifyPrivyToken, async (req, res) => {
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
    console.log("User route hit Endpoint at: ", formato.format(ahora));
    const { did } = req.user; // Viene del middleware
    const { email, walletAddress } = req.body;
    console.log("email:", email)
    console.log("walletAddress:", walletAddress)

    // Buscamos si ya existe
    let user = await User.findOne({ privyDid: did });

    if (!user) {
      // generamos un username utilizando el id de privy
      const shortId = did.split(':').pop().slice(-6); 
      const tempUsername = `nero-${shortId}`;
      // Si no existe, es un registro nuevo
      user = new User({
        privyDid: did,
        email: email,
        walletAddress: walletAddress,
        username: tempUsername,
        shop: {
          active: false, // Por defecto la tienda está apagada
          name: `Tienda de ${tempUsername}`
        }
      });
      await user.save();
      console.log("Nuevo usuario registrado en Mongo:", did);
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Error al sincronizar usuario" });
  }
});

export default router;
