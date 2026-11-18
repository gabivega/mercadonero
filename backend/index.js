import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './src/config/database.js';
import authRoutes from './src/routes/authRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import cartRoutes from './src/routes/cartRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';
import messageRoutes from './src/routes/messageRoutes.js';
import reviewRoutes from './src/routes/reviewRoutes.js';
import cashbackRoutes from './src/routes/cashbackRoutes.js';
import referralRoutes from './src/routes/referralRoutes.js';
import rewardsRoutes from './src/routes/rewardsRoutes.js';
import poolRoutes from './src/routes/poolRoutes.js';
import gasRoutes from './src/routes/gasRoutes.js';
import shippingRoutes from './src/routes/shippingRoutes.js';
import elitRoutes from './src/routes/elitRoutes.js';
import flamingRoutes from './src/routes/flamingRoutes.js';
import directcarRoutes from './src/routes/directcarRoutes.js';
import tiendanubeRoutes from './src/routes/tiendanubeRoutes.js';
import myStoreRoutes from './src/routes/myStoreRoutes.js';
import adminStoreRoutes from './src/routes/adminStoreRoutes.js';
import redirectRoutes from './src/routes/redirectRoutes.js';
import startOrderCleanup from './src/services/orderCleanup.js';
import startElitSyncCron from './src/services/elitSyncCron.js';
import { getSitemap } from './src/controllers/seoController.js';
import { getEscrowPaymentOptions } from './src/config/chains.js';

const PORT = process.env.PORT || 3000;
const app = express();

// TRUST PROXY: detras de Nginx, sin esto req.ip es siempre 127.0.0.1 y se
// rompen el rate-limit por IP y las auditorias de IP. 1 = un salto de proxy.
// NO usar true: confiaria en el X-Forwarded-For que manda el cliente.
app.set('trust proxy', 1);

const allowedOrigins = [
  'https://mercadonero.com',
  'https://www.mercadonero.com',
  'http://localhost:5173'
];

// ── DEV: permitir el origen de LAN ───────────────────────────────────────
// El QR del kit promocional se escanea con un CELULAR, que abre el front por
// la IP de la maquina (ej. http://192.168.0.17:5173) y NO por localhost (en
// el telefono, "localhost" apunta al propio telefono).
//
// Sin esto el celular carga la pagina pero cada llamada a la API falla por
// CORS y la ficha queda vacia. Solo aplica en desarrollo.
//
// Se evalua como FUNCION (no como lista estatica) para aceptar cualquier IP
// privada sin reiniciar el server cuando cambia la IP de la maquina.
const isPrivateLanOrigin = (origin) => {
  if (process.env.NODE_ENV === "production") return false;
  // http://192.168.x.x:5173 / http://10.x.x.x:5173 / http://172.16-31.x.x:5173
  return /^http:\/\/(?:192\.168|10|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}:(?:5173|4173)$/.test(
    origin || ""
  );
};

// En tu server.js o app.js
app.use(cors({
 origin: function (origin, callback) {
    // Permite peticiones sin origen (como apps móviles o curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isPrivateLanOrigin(origin)) {
      return callback(null, true);
    }
    const msg = 'El cliente CORS para este sitio no permite el acceso desde el origen especificado.';
    return callback(new Error(msg), false);
  }, // La URL de tu app de Vite
  methods: ['GET', 'POST','PATCH','DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Sin exposedHeaders, el navegador NO deja leer cabeceras custom del
  // response cuando el origen es distinto (front 5173 -> API 3000). El kit
  // de referidos devuelve metadata util (URL corta y clicks) en headers,
  // asi que las exponemos explicitamente.
  exposedHeaders: ['X-Kit-Short-Url', 'X-Kit-Clicks', 'Retry-After', 'ETag']
}));
app.use(express.json());

try {
  await connectDB();
  app.use('/api/auth', authRoutes);
  app.use('/api/product', productRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/order', orderRoutes);
    app.use('/api/cart', cartRoutes);
  app.use('/api/admin', adminRoutes);
    app.use('/api/notification', notificationRoutes);
  app.use('/api/message', messageRoutes);
    app.use('/api/review', reviewRoutes);
  app.use('/api/cashback', cashbackRoutes);
  app.use('/api/referral', referralRoutes);
  app.use('/api/rewards', rewardsRoutes);
  app.use('/api/pool', poolRoutes);
  // Gas patrocinado (drip multi-chain): el frontend lo llama antes de firmar
  // send/colateral para asegurar que la smart wallet tenga gas nativo.
  app.use('/api/gas', gasRoutes);
  app.use('/api/shipping', shippingRoutes);
  app.use('/api/elit', elitRoutes);
    app.use('/api/flaming', flamingRoutes);
  app.use('/api/directcar', directcarRoutes);
  app.use('/api/tiendanube', tiendanubeRoutes);
  // Importador de Tiendanube del USUARIO (scopeado a su StoreConnection verificada).
  app.use('/api/my-store', myStoreRoutes);
  // Gestión de ADMIN de las conexiones de tienda (habilitar/verificar por OTP).
  app.use('/api/admin/store-connections', adminStoreRoutes);
  // Enlaces cortos de referido: /r/<code> → /producto/<slug>?ref=<id>
  app.use('/r', redirectRoutes);
  // Sitemap dinámico para motores de búsqueda (SEO orgánico)
  app.get('/sitemap.xml', getSitemap);
  // Config PÚBLICA de medios de pago crypto: redes con escrow desplegado y su
  // token de pago (USDT en BSC, USDC en Base, USDXM en Polygon). El Checkout
  // la consume para ofrecer al comprador en qué red/token pagar y mostrarle su
  // saldo real. No expone secretos: solo direcciones de contratos públicos.
  app.get('/api/config/payment-options', (req, res) => {
    try {
      res.json({ success: true, options: getEscrowPaymentOptions() });
    } catch (error) {
      console.error('Error al obtener payment-options:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  // Healthcheck: no toca DB ni logica de negocio. Lo usa deploy.sh para rollback.
  app.get('/health', (req, res) => {
    res.json({ success: true, status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  });
  app.get('/', (req, res) => res.json({ success: true, message: 'API running' }));
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // Iniciar el servicio de limpieza de órdenes
  startOrderCleanup();

  // Iniciar el cron de sincronización con Elit (desactivado salvo env).
  startElitSyncCron();
} catch (err) {
  console.error('DB connection failed', err);
  process.exit(1);
}



