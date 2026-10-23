import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './src/models/Product.js';
import User from './src/models/User.js';
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await mongoose.connect(process.env.MONGODB_URI);
const P = mongoose.model('Product');

const RUN = process.argv.includes('--run');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/productsScrape/directcar_productos.json'), 'utf-8'));
const zeroIds = new Set(
  (raw.products || [])
    .filter((p) => !(Number(p.price) > 0))
    .map((p) => Number(p.id))
    .filter(Number.isFinite)
);
console.log('Ids sin precio en JSON:', zeroIds.size);

// Productos directcar en DB cuyo providerRef.id está en zeroIds.
const all = await P.find({ 'providerRef.provider': 'directcar' }, { 'providerRef.id': 1, name: 1 }).lean();
const toDelete = all.filter((p) => zeroIds.has(Number(p.providerRef?.id)));
console.log('Productos directcar en DB:', all.length);
console.log('A eliminar (sin precio real):', toDelete.length);

// Seguridad: ninguno de los borrados debería tener costPvpArs > 0.
console.log('\nMuestra:');
toDelete.slice(0, 5).forEach((p) => console.log('  •', p.providerRef?.id, p.name?.slice(0, 50)));

if (!RUN) {
  console.log('\nDRY-RUN. Para eliminar: node deleteDirectcarNoPrice.mjs --run');
} else {
  const ids = toDelete.map((p) => p._id);
  // También los quitamos del array User.products para no dejar referencias colgadas.
  await User.updateMany({ products: { $in: ids } }, { $pull: { products: { $in: ids } } });
  const r = await P.deleteMany({ _id: { $in: ids } });
  console.log('\n✅ Eliminados:', r.deletedCount);
}
await mongoose.disconnect();
