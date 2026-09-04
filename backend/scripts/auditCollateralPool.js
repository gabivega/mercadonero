/**
 * AUDITORÍA TOTAL DEL POOL DE GARANTÍAS.
 *
 * Uso (desde backend/, con el PK/entorno del backend):
 *   node --env-file=.env scripts/auditCollateralPool.js
 *
 * Qué hace:
 *   1) Lee el balance REAL de USDT en poder del contrato pool (el respaldo físico).
 *   2) Recorre en la DB todos los usuarios con walletAddress (vendedores) y lee
 *      on-chain sus vendors[...] (totalCollateral / lockedCollateral / available).
 *   3) Suma totalCollateral y lockedCollateral de TODOS los vendedores y compara
 *      contra el balance físico del pool.
 *
 * Conclusión posible:
 *   - Si balanceFisicoPool >= sumaLocked → hay respaldo para devolver garantías.
 *   - Si balanceFisicoPool << sumaLocked → el pool NO tiene los tokens reales de
 *     los depósitos ⇒ por eso liberar/cancelar revienta con "transfer amount
 *     exceeds balance". Es un problema de fondeo/estado del pool, no del código
 *     de cancelación.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { getVendorCollateral } from "../src/services/blockchainServices.js";
import User from "../src/models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const POOL = process.env.CONTRACT_ADDRESS;
const USDT = process.env.USDT_TESTNET_ADDRESS;

if (!MONGO_URI) {
  console.error("Falta MONGO_URI / MONGODB_URI en el .env.");
  process.exit(1);
}
if (!POOL || !USDT) {
  console.error("Faltan CONTRACT_ADDRESS / USDT_TESTNET_ADDRESS en el .env.");
  process.exit(1);
}

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log("▶ Conectado a MongoDB.\n");

  // 1) Balance físico real de USDT del pool.
  const provider = new ethers.JsonRpcProvider(
    process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
  );
  const usdt = new ethers.Contract(USDT, ["function balanceOf(address) view returns (uint256)"], provider);
  const poolBalanceWei = await usdt.balanceOf(POOL);
  const poolBalance = parseFloat(ethers.formatUnits(poolBalanceWei, 18));

  console.log("══════════════════════════════════════════════════════════");
  console.log("  BALANCE FÍSICO DEL POOL (USDT real respaldando)");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Pool contract : ${POOL}`);
  console.log(`  USDT testnet  : ${USDT}`);
  console.log(`  Balance USDT real del pool: ${poolBalance.toFixed(6)} USDT\n`);

  // 2) Vendedores (usuarios con wallet) y su contabilidad on-chain.
  const sellers = await User.find({ walletAddress: { $ne: "" } }).select(
    "username firstName lastName walletAddress role",
  ).lean();

  console.log("══════════════════════════════════════════════════════════");
  console.log("  CONTABILIDAD ON-CHAIN POR VENDEDOR (leída del contrato)");
  console.log("══════════════════════════════════════════════════════════");
  let sumTotal = 0;
  let sumLocked = 0;
  const rows = [];
  for (const s of sellers) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(s.walletAddress)) continue;
    const v = await getVendorCollateral(s.walletAddress);
    if (!v.success) continue;
    const name = `${s.username || ""} ${s.firstName || ""}`.trim() || s._id;
    sumTotal += v.totalCollateral || 0;
    sumLocked += v.lockedCollateral || 0;
    rows.push({
      name,
      wallet: s.walletAddress,
      total: v.totalCollateral || 0,
      locked: v.lockedCollateral || 0,
      available: (v.available || 0).toFixed(6),
    });
  }
  if (rows.length === 0) {
    console.log("  (sin vendedores con wallet y contabilidad on-chain)");
  } else {
    for (const r of rows) {
      console.log(
        `  • ${r.name}\n    wallet  : ${r.wallet}\n    total   : ${r.total.toFixed(6)} USDT\n    locked  : ${r.locked.toFixed(6)} USDT\n    free    : ${r.available} USDT\n`,
      );
    }
  }

  console.log("══════════════════════════════════════════════════════════");
  console.log("  CONCLUSIÓN / CONCILIACIÓN");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Balance físico del pool      : ${poolBalance.toFixed(6)} USDT`);
  console.log(`  Suma totalCollateral (vends) : ${sumTotal.toFixed(6)} USDT`);
  console.log(`  Suma lockedCollateral        : ${sumLocked.toFixed(6)} USDT`);
  console.log("");
  const faltanteLocked = poolBalance - sumLocked;
  const faltanteTotal = poolBalance - sumTotal;
  console.log(`  Pool - SumaLocked  = ${faltanteLocked.toFixed(6)} USDT`);
  console.log(`  Pool - SumaTotal   = ${faltanteTotal.toFixed(6)} USDT`);
  console.log("");
  if (poolBalance >= sumLocked) {
    console.log("  ✅ El pool alcanza para devolver TODAS las garantías bloqueadas.");
  } else {
    console.log(
      `  ❌ El pool FALTA US$ ${Math.abs(faltanteLocked).toFixed(6)} para cubrir los locked on-chain.`,
    );
    console.log("     ⇒ Liberar/cancelar fallará con 'transfer amount exceeds balance'.");
    console.log(
      "     ⇒ Es un problema de fondeo físico del contrato (los USDT no entraron a este",
      "       pool en esta dirección), NO del código de cancelación.",
    );
  }
  console.log("");
  console.log("Recordá: el pool físico solo se nutre cuando un vendedor ejecuta");
  console.log("  depositCollateral con approve (transfiere USDT real al contrato).");
  console.log("El 'lock' NO mueve tokens: solo escribe la contabilidad on-chain.");
  console.log("El 'release' SÍ mueve tokens reales del pool hacia el vendedor.");

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("Error global:", err);
  process.exit(1);
});
