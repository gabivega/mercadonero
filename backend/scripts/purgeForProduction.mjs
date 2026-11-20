/**
 * scripts/purgeForProduction.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * LIMPIEZA pre-producción: deja SOLO a los 3 usuarios reales y borra todo el
 * contenido operativo (productos, órdenes y sus dependencias).
 *
 * CONSERVA (por email):
 *   - info@mercadonero.com       (admin, tienda "Techstore")
 *   - rafaelarepuestos@gmail.com (vendedor real)
 *   - gabi.vega1988@gmail.com    (vendedor real)
 * Todo lo demás se ELIMINA.
 *
 * QUÉ BORRA:
 *   - products      (TODOS)
 *   - orders        (TODAS)
 *   - pools         (TODAS)
 *   - reviews       (TODAS — dependen de orders/productos)
 *   - sellercredits (TODOS — dependen de orders)
 *   - referrallinks (TODOS — apuntan a productos)
 *   - referrals     (TODOS — dependen de órdenes/compradores)
 *   - conversations + messages (TODAS — dependen de productos/órdenes/usuarios)
 *   - notifications (TODAS — casi todas cuelgan de eventos de órdenes/productos)
 *   - gasdrips      (SOLO de usuarios que se borran)
 *   - users         (TODOS menos los 3 reales)
 *
 * QUÉ LIMPIA en los 3 usuarios conservados:
 *   - Arrays de punteros que quedarían huérfanos: favorites, purchases,
 *     reviews, shop.products, shop.sales, shop.reviews.
 *   - Historiales de movimientos atados a órdenes: cashback.transactions,
 *     referral.transactions (con refType "order"/"checkout" o refId de orden).
 *     (Se vacían completos: el historial viejo NO aplica tras borrar todo.)
 *   - Contadores de accounting que dependían de órdenes/productos borrados.
 *   - Balances de cashback/referral (saldo) → se dejan en 0 porque el saldo
 *     provenía de órdenes que ya no existen. ⚠️ REVISAR: si querés conservar
 *     saldos reales de los vendedores, sacá el bloque marcado BALANCES.
 *
 * MODO:
 *   node scripts/purgeForProduction.mjs            → DRY-RUN (solo muestra)
 *   node scripts/purgeForProduction.mjs --apply    → EJECUTA el borrado
 *
 * ⚠️ NO hay vuelta atrás con --apply. Hacé un backup/export de la DB antes.
 */
import "dotenv/config";
import mongoose from "mongoose";

const KEEP_EMAILS = [
  "info@mercadonero.com",
  "rafaelarepuestos@gmail.com",
  "gabi.vega1988@gmail.com",
];

const APPLY = process.argv.includes("--apply");
const URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!URI) {
  console.error("❌ Falta MONGO_URI / MONGODB_URI en backend/.env");
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log("=".repeat(72));
  console.log("MODO:", APPLY ? "🔥 APPLY (borra de verdad)" : "👀 DRY-RUN (no borra nada)");
  console.log("Base:", mongoose.connection.name, "| Host:", mongoose.connection.host);
  console.log("=".repeat(72));

  const U = db.collection("users");
  const P = db.collection("products");
  const O = db.collection("orders");
  const Pool = db.collection("pools");
  const Reviews = db.collection("reviews");
  const SellerCredits = db.collection("sellercredits");
  const RefLinks = db.collection("referrallinks");
  const Referrals = db.collection("referrals");
  const Convs = db.collection("conversations");
  const Msgs = db.collection("messages");
  const Notifs = db.collection("notifications");
  const GasDrips = db.collection("gasdrips");

  // ── 1) Identificar usuarios a conservar y a borrar ──────────────────────
  const keepUsers = await U.find(
    { email: { $in: KEEP_EMAILS } },
    { projection: { email: 1, _id: 1 } },
  ).toArray();
  const keepIds = keepUsers.map((u) => u._id);
  const keepEmailsFound = keepUsers.map((u) => u.email);

  const missing = KEEP_EMAILS.filter((e) => !keepEmailsFound.includes(e));
  if (missing.length) {
    console.error("\n❌ ABORTADO: faltan usuarios a conservar en la DB:", missing.join(", "));
    console.error("   (Los emails deben existir tal cual, en minúsculas).");
    await mongoose.disconnect();
    process.exit(1);
  }

  const deleteUsersFilter = { _id: { $nin: keepIds } };
  const usersToDelete = await U.find(deleteUsersFilter, { projection: { email: 1 } }).toArray();
  const deleteUserIds = usersToDelete.map((u) => u._id);

  console.log("\n--- USUARIOS ---");
  console.log("  CONSERVAR:", keepEmailsFound.join(" | "));
  console.log("  BORRAR   :", usersToDelete.length, "→", usersToDelete.map((u) => u.email).join(", "));

  // ── 2) Conteos de lo que se borra ───────────────────────────────────────
  const counts = {
    products: await P.countDocuments(),
    orders: await O.countDocuments(),
    pools: await Pool.countDocuments(),
    reviews: await Reviews.countDocuments(),
    sellercredits: await SellerCredits.countDocuments(),
    referrallinks: await RefLinks.countDocuments(),
    referrals: await Referrals.countDocuments(),
    conversations: await Convs.countDocuments(),
    messages: await Msgs.countDocuments(),
    notifications: await Notifs.countDocuments(),
    // gasdrips: solo los de usuarios que se van (los de los 3 reales se conservan)
    gasdrips: await GasDrips.countDocuments({ user: { $in: deleteUserIds } }),
    users: usersToDelete.length,
  };

  console.log("\n--- CONTEO A BORRAR ---");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(6)}`);
  }

  // Aviso de gasdrips de usuarios conservados (no se tocan).
  const gasDripsKeep = await GasDrips.countDocuments({ user: { $in: keepIds } });
  if (gasDripsKeep) console.log(`  (gasdrips de usuarios conservados: ${gasDripsKeep} — NO se tocan)`);

  if (!APPLY) {
    console.log("\n" + "=".repeat(72));
    console.log("DRY-RUN OK. Nada fue borrado. Para ejecutar:");
    console.log("  node scripts/purgeForProduction.mjs --apply");
    console.log("=".repeat(72));
    await mongoose.disconnect();
    return;
  }

  // ── 3) BORRADO (orden: dependencias primero, luego los padres) ──────────
  console.log("\n🔥 Ejecutando borrado...");
  const r = {};
  r.messages = (await Msgs.deleteMany({})).deletedCount;
  r.conversations = (await Convs.deleteMany({})).deletedCount;
  r.notifications = (await Notifs.deleteMany({})).deletedCount;
  r.reviews = (await Reviews.deleteMany({})).deletedCount;
  r.sellercredits = (await SellerCredits.deleteMany({})).deletedCount;
  r.referrallinks = (await RefLinks.deleteMany({})).deletedCount;
  r.referrals = (await Referrals.deleteMany({})).deletedCount;
  r.pools = (await Pool.deleteMany({})).deletedCount;
  r.orders = (await O.deleteMany({})).deletedCount;
  r.products = (await P.deleteMany({})).deletedCount;
  r.gasdrips = (await GasDrips.deleteMany({ user: { $in: deleteUserIds } })).deletedCount;
  r.users = (await U.deleteMany(deleteUsersFilter)).deletedCount;

  console.log("  Borrados:");
  for (const [k, v] of Object.entries(r)) console.log(`    ${k.padEnd(16)} ${v}`);

  // ── 4) LIMPIAR punteros huérfanos de los 3 usuarios conservados ─────────
  // Tras borrar todo, los arrays de estos usuarios apuntan a docs inexistentes.
  // Los vaciamos (no afecta datos de tienda ni wallet). BALANCES → si NO querés
  // resetear saldos de cashback/referral, comentá el $set de esos dos.
  const { ObjectId } = mongoose.Types;
  const resetUsers = await U.updateMany(
    { _id: { $in: keepIds.map((id) => id) } },
    {
      $set: {
        favorites: [],
        purchases: [],
        reviews: [],
        "shop.products": [],
        "shop.sales": [],
        "shop.reviews": [],
        // ── BALANCES (ver nota en el header) ──
        "cashback.balance": 0,
        "cashback.earned": 0,
        "cashback.spent": 0,
        "cashback.withdrawn": 0,
        "cashback.reservedUsd": 0,
        "cashback.transactions": [],
        "referral.balance": 0,
        "referral.earned": 0,
        "referral.spent": 0,
        "referral.withdrawn": 0,
        "referral.reservedUsd": 0,
        "referral.transactions": [],
        // ── Contadores de accounting atados a órdenes/productos borrados ──
        "accounting.cancellationsAsBuyer": 0,
        "accounting.refundsRequested": 0,
        "accounting.claimsOpened": 0,
        "accounting.returnsRequested": 0,
        "accounting.expiredOrdersAsBuyer": 0,
        "accounting.cancellationsAsSeller": 0,
        "accounting.refundsPending": 0,
        "accounting.expiredCollateralHolds": 0,
        "accounting.collateralRejectedBySeller": 0,
        "accounting.collateralHoldCancelledByBuyer": 0,
        "accounting.completedPurchases": 0,
        "accounting.completedSales": 0,
        "accounting.restricted": false,
        "accounting.restrictionReason": "",
        rating: 0,
        "shop.rating": 0,
        "shop.totalSalesCount": 0,
      },
    },
  );
  console.log(`\n  Usuarios conservados actualizados: ${resetUsers.modifiedCount}`);

  // ── 5) Verificación final ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(72));
  console.log("VERIFICACIÓN FINAL:");
  const finalUsers = await U.find({}, { projection: { email: 1, role: 1, "shop.name": 1, "shop.approved": 1 } }).toArray();
  console.log("  Usuarios restantes:", finalUsers.length);
  for (const u of finalUsers) {
    console.log(`    - ${u.email}  (shop="${u.shop?.name || ""}" approved=${!!u.shop?.approved})`);
  }
  for (const c of ["products", "orders", "pools", "reviews", "sellercredits", "referrallinks", "referrals", "conversations", "messages", "notifications"]) {
    console.log(`  ${c.padEnd(16)} ${await db.collection(c).countDocuments()}`);
  }

  await mongoose.disconnect();
  console.log("\n🎉 Limpieza completada.");
}

main().catch((e) => {
  console.error("❌ ERROR:", e);
  process.exit(1);
});
