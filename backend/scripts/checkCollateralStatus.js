/**
 * SCRIPT DE DIAGNÓSTICO / RECONCILIACIÓN DE COLATERAL (Admin)
 *
 * Uso:
 *   node scripts/checkCollateralStatus.js <orderId> [--release]
 *
 * Ejemplo:
 *   node scripts/checkCollateralStatus.js 6a85a131c5d3955555570d46
 *   node scripts/checkCollateralStatus.js 6a85a131c5d3955555570d46 --release
 *
 * Sin --release: consulta el estado real on-chain del lock y del vendedor, y lo
 *   contrasta con lo que la DB cree. Es la PRIMERA acción recomendada ante una
 *   orden "cancelada" pero con garantía presuntamente congelada.
 *
 * Con --release: además de verificar, fuerza la liberación real on-chain
 *   (0% fee) y alinea la DB (status=cancelled + releaseTxHash). Úsalo SOLO si
 *   confirmaste con el comprador que no hubo pago o que recibió su reintegro.
 *
 * IMPORTANTE: requiere que el backend esté en la carpeta correcta para resolver
 *   las variables de entorno (.env). Se conecta a BSC Testnet con la PK del admin
 *   para las operaciones de escritura.
 *
 * Carga las variables de entorno desde ../.env
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import {
  getOrderLock,
  getVendorCollateral,
  cancelVendorCollateral,
} from "../src/services/blockchainServices.js";
import Order from "../src/models/Order.js";
import User from "../src/models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  const orderId = process.argv[2];
  const wantRelease = process.argv.includes("--release");

  if (!orderId) {
    console.error("Uso: node scripts/checkCollateralStatus.js <orderId> [--release]");
    process.exit(1);
  }
  if (!MONGO_URI) {
    console.error("No se encontró MONGO_URI / MONGODB_URI en el .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("▶ Conectado a MongoDB.\n");

  const order = await Order.findById(orderId);
  if (!order) {
    console.error("✘ Orden no encontrada en la DB.");
    process.exit(1);
  }

  const seller = await User.findById(order.seller);
  if (!seller || !seller.walletAddress) {
    console.error("✘ El vendedor no tiene walletAddress. No se puede operar el colateral.");
    process.exit(1);
  }

  console.log("══════════════════════════════════════════════════");
  console.log("  DATOS DE LA ORDEN (DB)");
  console.log("══════════════════════════════════════════════════");
  console.log("  orderId          :", order._id.toString());
  console.log("  status           :", order.status);
  console.log("  collateralTxHash :", order.collateralTxHash);
  console.log("  releaseTxHash    :", order.releaseTxHash || "(ninguno)");
  console.log("  vendedor         :", seller.walletAddress);
  console.log("");

  // 1) Estado on-chain del lock de esta orden
  const lock = await getOrderLock(order._id.toString());
  console.log("══════════════════════════════════════════════════");
  console.log("  ESTADO ON-CHAIN — LOCK DE LA ORDEN");
  console.log("══════════════════════════════════════════════════");
  if (!lock.success) {
    console.log("  ✘ No se pudo leer el lock:", lock.error);
  } else {
    console.log(`  lockUsd   : ${lock.lockUsd} USDT`);
    console.log(`  lock activo: ${lock.lockUsd > 0 ? "SÍ ⚠️ (CONGELADO)" : "NO (liberado)"}`);
  }
  console.log("");

  // 2) Estado on-chain del vendedor (total / bloqueado / disponible)
  const vendor = await getVendorCollateral(seller.walletAddress);
  console.log("══════════════════════════════════════════════════");
  console.log("  ESTADO ON-CHAIN — VENDEDOR");
  console.log("══════════════════════════════════════════════════");
  if (!vendor.success) {
    console.log("  ✘ No se pudo leer el vendedor:", vendor.error);
  } else {
    console.log(`  totalColater   : ${vendor.totalCollateral} USDT`);
    console.log(`  lockedColateral: ${vendor.lockedCollateral} USDT`);
    console.log(`  disponible     : ${vendor.available} USDT`);
  }
  console.log("");

  // Diagnóstico
  const lockActive = lock.success && lock.lockUsd > 0;
  console.log("══════════════════════════════════════════════════");
  console.log("  DIAGNÓSTICO");
  console.log("══════════════════════════════════════════════════");
  if (lockActive) {
    console.log("  ⚠️ El colateral SIGUE CONGELADO on-chain.");
    console.log("  La DB cree que fue liberado pero el lock existe en el contrato.");
    console.log("  => Hay que liberarlo. Usá --release SI confirmaste con el comprador,");
    console.log("     o hacelo desde el panel admin (Liberar Garantía - Admin).");
  } else {
    console.log("  ✔ El colateral YA está liberado on-chain (lock=0).");
    console.log("  La DB solo está desalineada. Se puede reconstruir/marcar sin tocar la blockchain.");
  }
  console.log("");

  // 3) Liberación opcional
  if (wantRelease) {
    if (!lockActive) {
      console.log("  【--release】 No hace falta: el colateral ya está liberado on-chain.");
    } else {
      console.log("  【--release】 Forzando liberación real on-chain (0% fee)...");
      const result = await cancelVendorCollateral(order._id.toString(), seller.walletAddress);
      if (!result.success) {
        console.log("  ✘ Falló la liberación:", result.error);
        process.exit(1);
      }
      console.log("  ✔ Liberación exitosa en blockchain. Tx:", result.txHash);

      // Alinear DB
      order.status = "cancelled";
      order.releaseTxHash = result.txHash;
      order.cancelledBy = "admin";
      order.pendingRequest.exists = false;
      if (order.releaseRequest) order.releaseRequest.status = "approved_released";
      await order.save();
      console.log("  ✔ DB alineada: status=cancelled, releaseTxHash registrado.");
    }
  }

  await mongoose.disconnect();
  console.log("\n▶ Listo.");
}

main().catch((err) => {
  console.error("Error global:", err);
  process.exit(1);
});
