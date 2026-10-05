/**
 * SCRIPT ONE-OFF — Eliminar el índice único conflictivo de bankAccounts.cbuCvu.
 *
 * CONTEXTO DEL BUG:
 * El schema dejó de definir `cbuCvu: { unique: true }` (era incorrecto: un
 * `unique` en un campo de un ARRAY crea un índice único GLOBAL, impidiendo que
 * dos usuarios tengan el mismo CBU/CVU). PERO Mongoose NO borra índices ya
 * creados en la base de datos automáticamente.
 *
 * Si ese índice sigue existiendo, al guardar una cuenta bancaria desde el
 * perfil (updateProfile con runValidators) MongoDB lanza:
 *   E11000 duplicate key error collection: users index: bankAccounts.cbuCvu_1
 * y el backend responde 500 → "Error al actualizar el perfil".
 *
 * ESTE SCRIPT elimina ese índice si existe. Es idempotente (puede correrse
 * varias veces sin problema).
 *
 * Uso:
 *   node scripts/dropBankAccountCbuUniqueIndex.js
 *
 * Requiere MONGO_URI / MONGODB_URI en backend/.env.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  if (!MONGO_URI) {
    console.error("No se encontró MONGO_URI / MONGODB_URI en el .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("▶ Conectado a MongoDB.\n");

  const collection = mongoose.connection.collection("users");

  // Listamos índices actuales para localizar el conflictivo.
  const indexes = await collection.indexes();
  console.log("Índices actuales en 'users':");
  for (const idx of indexes) {
    console.log(`  - ${idx.name}  keys=${JSON.stringify(idx.key)}  unique=${!!idx.unique}`);
  }

  // Buscamos cualquier índice único sobre bankAccounts.cbuCvu.
  const targetNames = indexes
    .filter(
      (idx) =>
        idx.unique &&
        Object.keys(idx.key || {}).includes("bankAccounts.cbuCvu"),
    )
    .map((idx) => idx.name);

  if (targetNames.length === 0) {
    console.log("\n✔ No hay índice único sobre bankAccounts.cbuCvu. Nada que hacer.");
  } else {
    for (const name of targetNames) {
      await collection.dropIndex(name);
      console.log(`\n✔ Índice eliminado: ${name}`);
    }
  }

  await mongoose.disconnect();
  console.log("\n▶ Listo.");
}

main().catch((err) => {
  console.error("Error global:", err);
  process.exit(1);
});
