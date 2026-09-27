/**
 * Script de limpieza: borra TODOS los usuarios EXCEPTO el admin.
 *
 * ⚠️  USAR CON CUIDADO. Por defecto corre en modo DRY-RUN (no borra nada,
 *     solo muestra qué haría). Para borrar de verdad, pasá el flag --confirm.
 *
 * Uso (desde /backend, con acceso a la DB):
 *   # 1) Ver qué se borraría (no toca nada):
 *   node src/scripts/deleteAllUsersExceptAdmin.js
 *
 *   # 2) Borrar de verdad:
 *   node src/scripts/deleteAllUsersExceptAdmin.js --confirm
 *
 *   # Borrar también los datos relacionados (productos, órdenes, etc.):
 *   node src/scripts/deleteAllUsersExceptAdmin.js --confirm --cascade
 *
 * Excepción (admin): se puede configurar por ObjectId o por email.
 *   - ADMIN_ID    = 6a0367c822962544f6c0dba1
 *   - ADMIN_EMAIL = info@mercadonero.com
 * Si un user coincide con CUALQUIERA de los dos, NO se borra.
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/database.js";
import User from "../models/User.js";

// ── Admin que se preserva ────────────────────────────────────────────
const ADMIN_ID = "6a0367c822962544f6c0dba1";
const ADMIN_EMAIL = "info@mercadonero.com";

const CONFIRM = process.argv.includes("--confirm");
const CASCADE = process.argv.includes("--cascade");

// Colecciones relacionadas (se borran solo con --cascade).
// Importamos de forma dinámica para no romper si algún modelo no existe.
const run = async () => {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(ADMIN_ID)) {
    throw new Error(`ADMIN_ID inválido: ${ADMIN_ID}`);
  }

  // Filtro: todos los que NO sean el admin (ni por id ni por email).
  const notAdmin = {
    $and: [
      { _id: { $ne: new mongoose.Types.ObjectId(ADMIN_ID) } },
      { email: { $ne: ADMIN_EMAIL.toLowerCase() } },
    ],
  };

  // Verificamos que el admin exista y no nos equivoquemos de DB.
  const admin = await User.findById(ADMIN_ID).select("email username");
  console.log(
    admin
      ? `✅ Admin encontrado: ${admin.email} (@${admin.username || "-"})`
      : `⚠️  NO se encontró el admin con _id ${ADMIN_ID}. Abortá si es la DB equivocada.`,
  );

  const toDelete = await User.find(notAdmin).select("_id email username");
  console.log(`\nUsuarios a borrar: ${toDelete.length}`);

  if (!CONFIRM) {
    console.log("\n🔎 DRY-RUN (no se borró nada). Muestra parcial:");
    toDelete.slice(0, 20).forEach((u) =>
      console.log(`   - ${u._id}  ${u.email}`),
    );
    if (toDelete.length > 20)
      console.log(`   ... y ${toDelete.length - 20} más.`);
    console.log(
      "\nPara borrar de verdad ejecutá con:  node src/scripts/deleteAllUsersExceptAdmin.js --confirm",
    );
    process.exit(0);
  }

  const ids = toDelete.map((u) => u._id);

  // Borramos los usuarios (excepto el admin).
  const res = await User.deleteMany(notAdmin);
  console.log(`\n🗑️  Usuarios borrados: ${res.deletedCount}`);

  // ── CASCADE opcional: borrar datos relacionados ──
  if (CASCADE && ids.length > 0) {
    console.log("\n♻️  Borrando datos relacionados (--cascade)...");
    try {
      const [{ default: Product }, { default: Order }] = await Promise.all([
        import("../models/Product.js"),
        import("../models/Order.js"),
      ]);

      const p = await Product.deleteMany({ seller: { $in: ids } });
      console.log(`   - Productos del sellers borrados: ${p.deletedCount}`);

      const o = await Order.deleteMany({
        $or: [{ buyer: { $in: ids } }, { seller: { $in: ids } }],
      });
      console.log(`   - Órdenes borradas: ${o.deletedCount}`);
    } catch (e) {
      console.warn(
        `   ⚠️  No se pudo completar el cascade (revisá los nombres de campos): ${e.message}`,
      );
    }
  }

  console.log("\n✅ Listo.");
  process.exit(0);
};

run().catch((err) => {
  console.error("Error en deleteAllUsersExceptAdmin:", err);
  process.exit(1);
});
