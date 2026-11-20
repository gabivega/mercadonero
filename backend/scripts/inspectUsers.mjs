// Script de SOLO LECTURA: lista usuarios con datos clave para decidir la limpieza
// previo al pase a producción. NO escribe nada.
// Uso:  cd backend && node scripts/inspectUsers.mjs
import "dotenv/config";
import mongoose from "mongoose";

const URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!URI) {
  console.error("Falta MONGO_URI / MONGODB_URI en backend/.env");
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log("Base:", mongoose.connection.name, "\n");

  const users = await db
    .collection("users")
    .find({}, {
      projection: {
        email: 1,
        role: 1,
        supabaseId: 1,
        walletAddress: 1,
        "shop.name": 1,
        "shop.active": 1,
        "shop.approved": 1,
        accountStatus: 1,
        createdAt: 1,
      },
    })
    .sort({ createdAt: 1 })
    .toArray();

  console.log("--- USUARIOS (" + users.length + ") ---");
  for (const u of users) {
    const shop = u.shop || {};
    console.log(
      [
        (u.email || "(sin email)").padEnd(42),
        ("role=" + (u.role || "-")).padEnd(14),
        ("shop active=" + !!shop.active).padEnd(18),
        ("approved=" + !!shop.approved).padEnd(16),
        ("acct=" + (u.accountStatus || "-")).padEnd(14),
        ("wallet=" + (u.walletAddress ? "sí" : "no")).padEnd(12),
        "id=" + String(u._id),
      ].join(" "),
    );
  }

  // Conteo de dependencias que apuntan a productos / órdenes, para saber qué
  // más hay que limpiar y no dejar referencias huérfanas.
  const P = db.collection("products");
  const O = db.collection("orders");

  console.log("\n--- DEPENDENCIAS ---");
  const reviewsWithProduct = await db.collection("reviews").countDocuments({ product: { $exists: true } });
  const reviewsTotal = await db.collection("reviews").countDocuments();
  console.log(`reviews total=${reviewsTotal}  con product=${reviewsWithProduct}`);

  const pools = await db.collection("pools").find({}, { projection: { status: 1, members: 1, product: 1 } }).toArray();
  console.log(`pools=${pools.length}`);
  for (const p of pools) {
    console.log(
      `  pool ${String(p._id)} status=${p.status || "-"} members=${Array.isArray(p.members) ? p.members.length : 0} product=${p.product || "-"}`,
    );
  }

  const notifTotal = await db.collection("notifications").countDocuments();
  console.log(`notifications=${notifTotal}`);

  const sellerCredits = await db.collection("sellercredits").countDocuments();
  console.log(`sellercredits=${sellerCredits}`);

  const refLinks = await db.collection("referrallinks").countDocuments();
  const referrals = await db.collection("referrals").countDocuments();
  console.log(`referrallinks=${refLinks} referrals=${referrals}`);

  const conv = await db.collection("conversations").countDocuments();
  const msgs = await db.collection("messages").countDocuments();
  console.log(`conversations=${conv} messages=${msgs}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
