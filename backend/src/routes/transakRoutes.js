import express from 'express';
const router = express.Router();

router.post('/create-session', async (req, res) => {
    console.log("endpoint hitted")
  try {
    const STAGING_API_KEY = process.env.TRANSAK_STAGING_API_KEY; // Tu API Key de Staging

    // Petición a Transak para crear la sesión de transacción
    const response = await fetch('https://api-stg.transak.com/api/v2/auth/session', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-secret': 'fkjEeEOZ2YyT1u2oGXWrCA=='
      },
      body: {"apiKey":"5bf81dff-ea44-409d-8a93-406387690b9e"}
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Devuelve el sessionId generado por Transak al Frontend
    res.json({ sessionId: data.response.sessionId });
  } catch (error) {
    console.error('Error creando sesión de Transak:', error);
    res.status(500).json({ error: 'Error al conectar con Transak' });
  }
});
export default router;