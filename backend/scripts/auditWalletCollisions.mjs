// Script de AUDITORÍA de wallets duplicadas / sospechosas entre usuarios.
//
// ── POR QUÉ EXISTE (bug 2026-11) ──────────────────────────────────────────
// `POST /api/auth/sync-user` aceptaba la `walletAddress` del body y la escribía
// en el usuario si el campo estaba vacío. Combinado con el `dbUser` de Zustand
// persistido en localStorage (que sobrevivía a un cambio de sesión sin logout),
// un usuario NUEVO podía heredar la wallet del usuario ANTERIOR logueado en ese
// navegador. Incidente real: `atomichardware@protonmail.com` quedó con la
// address del admin (`info@mercadonero.com`).
//
// El fix ya está aplicado (sync-user NO escribe wallet). Este script sirve para
// revisar el ESTADO actual de la base y, si se pide explícitamente, limpiar los
// casos donde la wallet de un usuario coincida con la de un ADMIN.
//
// Uso:
//   cd backend && node scripts/auditWalletCollisions.mjs
//   cd backend && node scripts/auditWalletCollisions.mjs --fix
//
// `--fix` (opcional) SOLO actúa sobre el caso "wallet de un NO-admin == wallet
// de un ADMIN": le quita la address al NO-admin. Cualquier OTRO conflicto se
// reporta para revisión manual (no se toca nada a ciegas).
import "dotenv/config";
import mongoose from "mongoose";

const URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!URI) {
  console.error("Falta MONGO_URI / MONGODB_URI en backend/.env");
  process.exit(1);
}

const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || "")
  .split(/[,;]+/)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const isFix = process.argv.includes("--fix");

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log("Base:", mongoose.connection.name);
  console.log("Modo:", isFix ? "FIX (escribe)" : "SOLO LECTURA", "\n");

  const users = await db
    .collection("users")
    .find(
      { walletAddress: { $exists: true, $nin: [null, ""] } },
      { projection: { email: 1, role: 1, walletAddress: 1, supabaseId: 1, isSeller: 1 } },
    )
    .toArray();

  if (users.length === 0) {
    console.log("No hay usuarios con walletAddress seteada. Nada que revisar.");
    await mongoose.disconnect();
    return;
  }

  // Agrupamos por address normalizada (minúsculas) para detectar duplicados
  // que pudieran haberse colado antes de aplicar la normalización del índice.
  const byAddress = new Map();
  for (const u of users) {
    const key = String(u.walletAddress).trim().toLowerCase();
    if (!byAddress.has(key)) byAddress.set(key, []);
    byAddress.get(key).push(u);
  }

  const isAdmin = (u) =>
    u.role === "admin" || ADMIN_EMAILS.includes(String(u.email || "").toLowerCase());

  let problems = 0;

  // 1) DUPLICADOS REALES (misma address en 2+ usuarios).
  for (const [addr, list] of byAddress.entries()) {
    if (list.length < 2) continue;
    problems++;
    console.log(`⚠️  DUPLICADO ${addr}`);
    for (const u of list) {
      console.log(
        `     ${isAdmin(u) ? "[ADMIN]" : "[user ]"} ${u.email}  id=${String(u._id)}  seller=${!!u.isSeller}`,
      );
    }
  }

  // 2) USUARIO NO-ADMIN CON LA WALLET DE UN ADMIN (el incidente).
  const adminWallets = new Map();
  for (const u of users) {
    if (isAdmin(u)) adminWallets.set(String(u.walletAddress).trim().toLowerCase(), u);
  }
  const toClean = [];
  for (const u of users) {
    if (isAdmin(u)) continue;
    const key = String(u.walletAddress).trim().toLowerCase();
    if (adminWallets.has(key)) {
      problems++;
      console.log(
        `🚨 ${u.email} (id=${String(u._id)}) tiene la wallet de un ADMIN (${adminWallets.get(key).email}): ${key}`,
      );
      toClean.push(u);
    }
  }

  if (problems === 0) {
    console.log(`✅ Revisadas ${users.length} wallets. Sin conflictos.`);
  } else {
    console.log(`\nTotal de conflictos detectados: ${problems}`);
  }

  // 3) Limpieza opcional.
  if (toClean.length > 0) {
    if (!isFix) {
      console.log(
        `\nPara quitarle la wallet a esas ${toClean.length} cuenta(s) huerfana(s), corré con --fix.`,
      );
    } else {
      for (const u of toClean) {
        await db.collection("users").updateOne(
          { _id: u._id },
          { $unset: { walletAddress: "" } },
        );
        console.log(`   → wallet quitada a ${u.email} (id=${String(u._id)})`);
      }
      console.log(`\n✅ ${toClean.length} cuenta(s) limpiada(s). Deben volver a crear su billetera.`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
