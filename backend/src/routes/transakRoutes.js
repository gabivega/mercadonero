import express from 'express';
const router = express.Router();

router.post('/create-session', async (req, res) => {
  console.log("========== TRANSAK CREATE SESSION ==========");

  try {
    const API_KEY = '5bf81dff-ea44-409d-8a93-406387690b9e';
    const API_SECRET = 'vk8Z8xN1sL0AS7HHCnYG/Q==';

    console.log("API KEY:", API_KEY ? "OK" : "MISSING");
    console.log("API SECRET:", API_SECRET ? "OK" : "MISSING");

    // ==========================================
    // 1. ACCESS TOKEN
    // ==========================================

    const authResponse = await fetch(
      'https://api-stg.transak.com/partners/api/v2/refresh-token',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-secret': API_SECRET,
        },
        body: JSON.stringify({
          apiKey: API_KEY,
        }),
      }
    );

    const authData = await authResponse.json();

    console.log("AUTH STATUS:", authResponse.status);
    console.log("AUTH RESPONSE:", authData);

    if (!authResponse.ok) {
      return res.status(authResponse.status).json(authData);
    }

    const accessToken = authData?.data?.accessToken;

    if (!accessToken) {
      throw new Error("Transak no devolvió accessToken");
    }

    // ==========================================
    // 2. CREATE WIDGET SESSION
    // ==========================================

    const widgetParams = {
      apiKey: API_KEY,
      referrerDomain: 'localhost:5173',

    //   productsAvailed: 'BUY',

    //   fiatCurrency: 'USD',
    //   fiatAmount: 100,

    //   cryptoCurrencyCode: 'USDT',
    //   network: 'bsc',

    //   paymentMethod: 'credit_debit_card',

    //   language: 'es',
    };

    console.log("WIDGET PARAMS:", widgetParams);
    const userIp =
  req.headers['cf-connecting-ip'] ||
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.ip;


    const sessionResponse = await fetch(
        'https://api-gateway-stg.transak.com/api/v2/auth/session',
        {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                
                'access-token': accessToken,
                
                'x-api-key': API_KEY,
                
                'x-user-ip': userIp,
    },
    
    body: JSON.stringify({
        widgetParams: {
            apiKey: API_KEY,
            referrerDomain: 'localhost:5173',
            
            productsAvailed: 'BUY',
            
            fiatCurrency: 'USD',
            fiatAmount: 100,
            
            cryptoCurrencyCode: 'USDT',
            
            paymentMethod: 'credit_debit_card',
            
            language: 'es',
        },
    }),
}
);

    const sessionData = await sessionResponse.json();


    if (!sessionResponse.ok) {
      return res.status(sessionResponse.status).json(sessionData);
    }

    const widgetUrl = sessionData?.data?.widgetUrl;

    console.log("REFERRER DOMAIN:", "localhost:5173");
console.log("USER IP:", req.ip);
console.log("API KEY:", API_KEY);
console.log("WIDGET URL:", sessionData.data.widgetUrl);
    

    if (!widgetUrl) {
      throw new Error("Transak no devolvió widgetUrl");
    }

 
    res.json({
      widgetUrl,
    });

  } catch (error) {
    console.error("TRANSAK ERROR:", error);

    res.status(500).json({
      error: 'Error interno en el servidor al procesar Transak',
      details: error.message,
    });
  }
});

export default router;