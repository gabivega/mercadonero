/**
 * scripts/fixUserIndexes.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * Repara los índices de la colección `users` tras la migración Privy → Supabase.
 *
 * PROBLEMA:
 *   El índice `privyDid_1` quedó creado como `unique: true` SIN `sparse`
 *   (era de antes de la migración). Con usuarios de Supabase (que no tienen
 *   privyDid), Mongoose persiste `privyDid: null` para TODOS, y el índice único
 *   revienta con:
 *       E11000 duplicate key error ... index: privyDid_1 dup key: { privyDid: null }
 *
 *   `supabaseId_1` sí quedó bien (unique + sparse), pero lo recreamos igual para
 *   dejarlo con `partialFilterExpression` (más explícito y robusto que `sparse`).
 *
 * QUÉ HACE:
 *   1. Borra los índices `privyDid_1` y `supabaseId_1` viejos.
 *   2. Los vuelve a crear como ÍNDICES PARCIALES que solo indexan documentos
 *      donde el campo es un string no vacío. Así `null`/ausente NUNCA colisiona.
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

  // 2. Recrear como índices únicos SPARSE.
  //    `sparse: true` excluye del índice los documentos donde el campo está
  //    AUSENTE. Por eso es clave NO persistir `null`: los usuarios que no usan
  //    un identificador deben dejar el campo sin setear (undefined), no en null.
  await coll.createIndex({ privyDid: 1 }, { unique: true, sparse: true });
  console.log("✅ privyDid_1 recreado (unique + sparse)");

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
