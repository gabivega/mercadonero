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
import startOrderCleanup from './src/services/orderCleanup.js';

const PORT = process.env.PORT || 3000;
const app = express();

const allowedOrigins = [
  'https://mercadonero.com',
  'https://www.mercadonero.com',
  'http://localhost:5173'
];

// En tu server.js o app.js
app.use(cors({
 origin: function (origin, callback) {
    // Permite peticiones sin origen (como apps móviles o curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'El cliente CORS para este sitio no permite el acceso desde el origen especificado.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }, // La URL de tu app de Vite
  methods: ['GET', 'POST','PATCH','DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
  app.get('/', (req, res) => res.json({ success: true, message: 'API running' }));
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  // Iniciar el servicio de limpieza de órdenes
  startOrderCleanup();
} catch (err) {
  console.error('DB connection failed', err);
  process.exit(1);
}


