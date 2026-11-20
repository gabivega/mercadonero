// Script de SOLO LECTURA: saca un inventario de la BD para decidir qué limpiar
// antes de cargar productos reales y hacer pruebas en testnet.
// NO escribe nada. Solo cuenta documentos por colección y muestra lo mínimo
// para identificar productos/usuarios/órdenes de prueba.
//
// Uso:  cd backend && node scripts/dbInventory.mjs
import "dotenv/config";
import mongoose from "mongoose";

const URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!URI) {
  console.error("Falta MONGO_URI / MONGODB_URI en backend/.env");
  process.exit(1);
}

// Nombre de base de datos para mostrarlo y saber a qué entorno apunta.
const dbName = (() => {
  try {
    return new URL(URI.replace(/^mongodb(\+srv)?:\/\//, "http://")).pathname.slice(1) || "(default)";
  } catch {
    return "(desconocida)";
  }
})();

async function main() {
  await mongoose.connect(URI);
  console.log("\nConectado.");
  console.log("Base de datos:", mongoose.connection.name);
  console.log("Host:", mongoose.connection.host);
  console.log("=".repeat(70));

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const rows = [];
  for (const c of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const count = await db.collection(c.name).countDocuments();
    rows.push({ Coleccion: c.name, Docs: count });
  }

  console.log("\n--- CONTEO POR COLECCION ---");
  for (const r of rows) {
    console.log(`  ${r.Coleccion.padEnd(28)} ${String(r.Docs).padStart(7)}`);
  }

  // ── Productos: cuántos por origen/provider y por estado de moderación ──
  const P = db.collection("products");
  if (rows.some((r) => r.Coleccion === "products")) {
    console.log("\n--- PRODUCTOS por providerRef.provider ---");
    const byProvider = await P.aggregate([
      {
        $group: {
          _id: { $ifNull: ["$providerRef.provider", "(manual)" ] },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
    ]).toArray();
    for (const p of byProvider) console.log(`  ${String(p._id).padEnd(28)} ${String(p.n).padStart(7)}`);

    console.log("\n--- PRODUCTOS por moderation.status ---");
    const byMod = await P.aggregate([
      { $group: { _id: { $ifNull: ["$moderation.status", "(sin campo)"] }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]).toArray();
    for (const p of byMod) console.log(`  ${String(p._id).padEnd(28)} ${String(p.n).padStart(7)}`);

    console.log("\n--- PRODUCTOS por status ---");
    const byStatus = await P.aggregate([
      { $group: { _id: { $ifNull: ["$status", "(sin campo)"] }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]).toArray();
    for (const p of byStatus) console.log(`  ${String(p._id).padEnd(28)} ${String(p.n).padStart(7)}`);

    console.log("\n--- Top 8 vendedores por cantidad de productos ---");
    const bySeller = await P.aggregate([
      { $group: { _id: "$seller", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 8 },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
      { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
      { $project: { n: 1, email: "$u.email", shop: "$u.shop.name" } },
    ]).toArray();
    for (const s of bySeller) {
      console.log(
        `  ${String(s.n).padStart(5)}  ${(s.email || "(sin email)").padEnd(34)} ${s.shop || ""}`,
      );
    }
  }

  // ── Usuarios: cuántos admin / vendedores / compradores ──
  const U = db.collection("users");
  if (rows.some((r) => r.Coleccion === "users")) {
    console.log("\n--- USUARIOS ---");
    const total = await U.countDocuments();
    const admins = await U.countDocuments({ role: "admin" });
    const approvedShop = await U.countDocuments({ "shop.active": true, "shop.approved": true });
    const waitingShop = await U.countDocuments({ "shop.active": true, "shop.approved": { $ne: true } });
    const withWallet = await U.countDocuments({ walletAddress: { $nin: [null, ""] } });
    console.log(`  total                      ${String(total).padStart(7)}`);
    console.log(`  role=admin                 ${String(admins).padStart(7)}`);
    console.log(`  tienda aprobada            ${String(approvedShop).padStart(7)}`);
    console.log(`  tienda en lista de espera  ${String(waitingShop).padStart(7)}`);
    console.log(`  con walletAddress          ${String(withWallet).padStart(7)}`);
  }

  // ── Órdenes: por estado (para ver si hay basura de pruebas) ──
  const O = db.collection("orders");
  if (rows.some((r) => r.Coleccion === "orders")) {
    console.log("\n--- ORDENES por status ---");
    const byStatus = await O.aggregate([
      { $group: { _id: { $ifNull: ["$status", "(sin campo)"] }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]).toArray();
    for (const o of byStatus) console.log(`  ${String(o._id).padEnd(28)} ${String(o.n).padStart(7)}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("FIN del inventario (no se modifico nada).\n");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
