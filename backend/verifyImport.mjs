import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './src/models/Product.js';
import User from './src/models/User.js';

dotenv.config();

const uid = '6ad42370346a42d3347d5f58';

await mongoose.connect(process.env.MONGODB_URI);

const [total, mine, approved, pending, noStock, noImg] = await Promise.all([
  Product.countDocuments({ 'providerRef.provider': 'directcar' }),
  Product.countDocuments({ seller: uid }),
  Product.countDocuments({ seller: uid, 'moderation.status': 'approved', status: 'active' }),
  Product.countDocuments({ seller: uid, 'moderation.status': 'pending' }),
  Product.countDocuments({ seller: uid, stock: 0 }),
  Product.countDocuments({ seller: uid, 'images.0': { $exists: false } }),
]);

const user = await User.findById(uid).lean();
const sample = await Product.findOne({ seller: uid }).lean();
const prices = await Product.distinct('price', { seller: uid });

console.log('Total DirectCar en DB:                 ', total);
console.log('Productos del user:                    ', mine);
console.log('User.products (array en User):         ', Array.isArray(user.products) ? user.products.length : '(sin campo)');
console.log('Visibles publicos (active + approved): ', approved);
console.log('En pending (no visibles):              ', pending);
console.log('Con stock 0 (no deberia haber):        ', noStock);
console.log('Sin imagen (no deberia haber):         ', noImg);
console.log('Precios distintos (deberia ser [40000]):', prices);
console.log('');
console.log('Ejemplo:', sample.name);
console.log('  precio: $' + sample.price, '| stock:', sample.stock, '| status:', sample.status, '| moderation:', sample.moderation.status);
console.log('  img:', sample.images[0].url);
console.log('  cat:', sample.category + ' / ' + sample.subCategory);
console.log('  seller:', sample.sellerName, '| providerRef.id:', sample.providerRef.id, '| costPvpArs:', sample.providerRef.costPvpArs);

const stats = await mongoose.connection.db.command({ dbStats: 1, scale: 1024 * 1024 });
console.log('');
console.log('DB dataSize:', stats.dataSize.toFixed(2), 'MB | storageSize:', stats.storageSize.toFixed(2), 'MB | objetos:', stats.objects);

await mongoose.disconnect();
