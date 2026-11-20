/**
 * scripts/fixUserIndexes.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * Asegura los índices de la colección `users`.
 *
 * HISTORIA: este script nació para reparar el índice `privyDid_1` (creado como
 * `unique` SIN `sparse`, que reventaba con E11000 cuando los usuarios de
 * Supabase tenían `privyDid: null`). Como Privy fue ELIMINADO del proyecto y el
 * campo `privyDid` ya no existe en el schema, el script ahora:
 *   1. BORRA el índice viejo `privyDid_1` (si quedó dando vueltas en la DB).
 *   2. Deja `supabaseId_1` como `unique + sparse`.
 *
 * ⚠️ POR QUÉ BORRAR `privyDid_1`: un índice huérfano sobre un campo que ya no
 * existe no molesta funcionalmente, pero confunde (el panel de Mongo lo muestra
 * y alguien puede creer que el campo se usa). Además, si el índice sigue como
 * unique y algún documento recibe `privyDid: null`, vuelve a colisionar.
 *
 * ⚠️ REGLA VIGENTE: `supabaseId` NUNCA se persiste en `null` (dejar AUSENTE).
 * `sparse` excluye campos ausentes, pero `null` SÍ entraría al índice único.
 *
 * Uso:
 *   cd backend && node scripts/fixUserIndexes.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Falta MONGODB_URI en el .env");

  await mongoose.connect(uri);
  console.log("✅ Conectado a Mongo");

  const coll = mongoose.connection.collection("users");

  // 1. Borrar índices viejos (ignoramos si no existen).
  for (const name of ["privyDid_1", "supabaseId_1"]) {
    try {
      await coll.dropIndex(name);
      console.log(`🗑️  Índice ${name} eliminado`);
    } catch (e) {
      if (e.codeName === "IndexNotFound" || e.code === 27) {
        console.log(`ℹ️  ${name} no existía (ok)`);
      } else {
        throw e;
      }
    }
  }

    // 2. Recrear solo el de Supabase (el único identificador de auth vigente).
  //    `sparse: true` excluye del índice los documentos donde el campo está
  //    AUSENTE. Por eso es clave NO persistir `null`: los usuarios que no usan
  //    un identificador deben dejar el campo sin setear (undefined), no en null.
  await coll.createIndex({ supabaseId: 1 }, { unique: true, sparse: true });
  console.log("✅ supabaseId_1 recreado (unique + sparse)");

  // 3. Verificación final.
  const idx = await coll.indexes();
  console.log("\nÍNDICES FINALES:");
  idx.forEach((i) =>
    console.log(
      " -",
      i.name,
      JSON.stringify(i.key),
      "unique:",
      !!i.unique,
      "partial:",
      i.partialFilterExpression ? JSON.stringify(i.partialFilterExpression) : "no",
    ),
  );

  await mongoose.disconnect();
  console.log("\n🎉 Listo.");
}

run().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
