/**
 * SCRIPT DE MIGRACIÓN ONE-OFF — Unificar cuentas bancarias.
 *
 * La fuente de verdad de cuentas bancarias es `user.bankAccounts` (el perfil,
 * BankAccountSection, gestiona las cuentas de compradores Y vendedores).
 * Antes existía una duplicación con `user.shop.bankAccounts` (llenada por el
 * onboarding de vendedor) que generaba bugs al mostrar los datos del vendedor
 * y cuentas desincronizadas.
 *
 * ESTE SCRIPT: por cada usuario que tenga cuentas en `shop.bankAccounts`,
 * las mueve/normaliza a `user.bankAccounts` y vacía `shop.bankAccounts`.
 *
 * Uso:
 *   node scripts/migrateShopBankAccounts.js
 *
 * Requiere variables de entorno (MONGO_URI / MONGODB_URI) en backend/.env.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../src/models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

/**
 * Convierte una cuenta del viejo shop (cbu/cuit) al formato del perfil
 * (cbuCvu/cuitCuil), conservando los campos comunes.
 */
function normalizeToUserFormat(acc) {
  return {
    bankName: acc.bankName || "",
    accountType:
      acc.accountType ||
      (String(acc.cbu || acc.cbuCvu || "").replace(/\D/g, "").length === 23
        ? "CVU"
        : "CBU"),
    holderName: acc.holderName || "",
    cuitCuil: acc.cuitCuil || acc.cuit || "",
    cbuCvu: acc.cbuCvu || acc.cbu || "",
    alias: acc.alias || "",
    isDefault: Boolean(acc.isDefault ?? false),
  };
}

async function main() {
  if (!MONGO_URI) {
    console.error("No se encontró MONGO_URI / MONGODB_URI en el .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("▶ Conectado a MongoDB.\n");

  // Todos los usuarios con cuentas en el viejo shop.bankAccounts.
  const users = await User.find({
    "shop.bankAccounts.0": { $exists: true },
  }).select("bankAccounts shop.bankAccounts");

  console.log(`Encontrados ${users.length} usuarios con shop.bankAccounts.\n`);

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const shopAccounts = user.shop?.bankAccounts || [];
    const rootAccounts = user.bankAccounts || [];

    const normalized = shopAccounts.map(normalizeToUserFormat);

    // Evitamos duplicados por CBU/CVU: no agregamos una cuenta al array raíz
    // si ya existe una con el mismo cbuCvu.
    const merged = [...rootAccounts];
    for (const acc of normalized) {
      const exists = merged.some(
        (r) => String(r.cbuCvu || "") === String(acc.cbuCvu || ""),
      );
      if (!exists) {
        merged.push(acc);
      }
    }

    // No tocamos si no hay nada que mover o ya estaba todo en la raíz.
    const hadSalesAtShop = shopAccounts.length > 0;
    const nothingNew = merged.length === rootAccounts.length;

    if (!hadSalesAtShop || (nothingNew && normalized.length === 0)) {
      skipped++;
      continue;
    }

    // Asignamos default al primero si ninguno lo es.
    if (merged.length && !merged.some((a) => a.isDefault)) {
      merged[0].isDefault = true;
    }

    // Evita warnings de Mongoose sobre _id en subdocumentos nuevos: limpiamos.
    const cleanMerged = merged.map(({ _id, __v, ...rest }) => rest);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          bankAccounts: cleanMerged,
          "shop.bankAccounts": [],
        },
      },
    );

    migrated++;
    console.log(
      `  ✔ Migrado ${user._id} → ${merged.length} cuenta(s) en user.bankAccounts (shop vaciado).`,
    );
  }

  console.log(
    `\n▶ Resumen: ${migrated} usuario(s) migrado(s), ${skipped} sin cambios.`,
  );

  await mongoose.disconnect();
  console.log("▶ Listo.");
}

main().catch((err) => {
  console.error("Error global:", err);
  process.exit(1);
});
