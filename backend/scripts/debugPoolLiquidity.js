/**
 * DIAGNÓSTICO RÁPIDO: balance real de USDT del pool vs garantías contables.
 *
 * Uso (desde backend/):
 *   node scripts/debugPoolLiquidity.js [walletVendedor]
 *   node scripts/debugPoolLiquidity.js 0xB468B666B9753E109891Ce7F7DcfD049027d220E
 *
 * Muestra cuánto USDT tiene REALMENTE el contrato pool vs cuánto cree deber
 * (totalCollateral de todos sus vendedores no consultable de golpe; por eso se
 * contrasta contra la wallet pasada). Si el balance del pool es ~0 pero
 * totalCollateral > 0, el pool NO tiene liquidez para devolver garantías → por
 * eso las cancelaciones/lanzamientos revientan con "transfer amount exceeds
 * balance".
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  getPoolLiquidityDiagnostic,
} from "../src/services/blockchainServices.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

(async () => {
  const vendor = process.argv[2];
  console.log("▶ Diagnóstico de liquidez del pool.");

  const diag = await getPoolLiquidityDiagnostic(vendor || null);
  if (!diag.success) {
    console.log("✘ No se pudo diagnosticar:", diag.error);
    process.exit(1);
  }

  console.log("══════════════════════════════════════════════════════");
  console.log("  BALANCE REAL DE USDT DEL CONTRATO POOL");
  console.log("══════════════════════════════════════════════════════");
  console.log("  Pool (contrato) :", diag.poolContract);
  console.log("  USDT testnet    :", diag.usdtAddress);
  console.log("  Balance USDT del pool REAL :", diag.poolUsdtBalance, "USDT");
  console.log("");
  if (vendor) {
    console.log("  Vendedor consultado:", vendor);
    console.log("  totalCollateral (contable on-chain):", diag.vendorTotalCollateral, "USDT");
    console.log("  lockedCollateral (bloqueado)       :", diag.vendorLockedCollateral, "USDT");
    console.log("  ¿Pool alcanza para devolverle?      :", diag.poolSuficienteParaDevolverVendor ? "SÍ" : "NO ⚠️");
  }
  console.log("══════════════════════════════════════════════════════");
  if (diag.poolUsdtBalance === 0) {
    console.log("  ⚠️ El pool NO tiene USDT → imposible liberar/retirar garantías.");
    console.log("     Hay que fondear el contrato con USDT (testnet) o revisar cómo");
    console.log("     se depositaron las garantías de los vendedores (deben entrar");
    console.log("     tokens reales al pool vía depositCollateral + approve).");
  }
  process.exit(0);
})();
