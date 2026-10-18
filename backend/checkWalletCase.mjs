import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI);

// 1. La wallet del error.
const target = '0xb468b666b9753e109891ce7f7dcfd049027d220e';
const withWallet = await User.find({ walletAddress: { $exists: true, $ne: null } })
  .select('_id email walletAddress supabaseId privyDid createdAt')
  .lean();

console.log('Usuarios con wallet:', withWallet.length);

// 2. ¿Cuántas están en MAYÚSCULAS (no normalizadas)?
const withUpper = withWallet.filter((u) => u.walletAddress !== u.walletAddress.toLowerCase());
console.log('Wallets con mayúsculas (checksum):', withUpper.length);
withUpper.forEach((u) =>
  console.log('  •', u.walletAddress, '|', u.email, '| supabase:', u.supabaseId || '—')
);

// 3. ¿La wallet del error a qué user pertenece?
const owner = withWallet.filter(
  (u) => u.walletAddress.toLowerCase() === target
);
console.log('\nDueños de la wallet del error (' + target + '):', owner.length);
owner.forEach((u) =>
  console.log('  •', u._id, '|', u.email, '| supabase:', u.supabaseId || '—', '| privy:', u.privyDid || '—')
);

// 4. Detectar colisiones case-insensitive (misma wallet en distinto case = 2 cuentas).
const seen = new Map();
const collisions = [];
for (const u of withWallet) {
  const key = u.walletAddress.toLowerCase();
  if (seen.has(key)) collisions.push([seen.get(key), u]);
  else seen.set(key, u);
}
console.log('\nColisiones case-insensitive (misma wallet, 2+ cuentas):', collisions.length);
collisions.forEach(([a, b]) =>
  console.log(`  ⚠️ ${a.walletAddress} (${a.email}) vs ${b.walletAddress} (${b.email})`)
);

await mongoose.disconnect();
