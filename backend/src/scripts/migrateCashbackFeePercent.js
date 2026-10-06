// scripts/migrateCashbackFeePercent.js
//
// MIGRACIÓN del cálculo de cashback.
//
// ANTES: feePercent se interpretaba como "% de la comisión (3%) a reintegrar".
//        El default era 0.3  → cashback = platformFeeUsd * 0.3 = 0.9% del total.
//
// AHORA: feePercent se interpreta como "% del SUBTOTAL DE PRODUCTOS a reintegrar".
//        El default es 0.025 → cashback = totalUsd * 0.025 = 2.5% de productos.
//
// Este script ajusta el documento singleton de CashbackConfig si detecta el
// valor viejo (0.3) para que pase a 0.025.
//
// Uso:
//   node src/scripts/migrateCashbackFeePercent.js
//
// Es idempotente: si ya está en 0.025 no hace nada.

import "dotenv/config";
import connectDB from "../config/database.js";
import CashbackConfig from "../models/CashbackConfig.js";

const OLD_VALUE = 0.3;   // valor viejo (30% de la comisión)
const NEW_VALUE = 0.025; // valor nuevo (2.5% de productos)

async function run() {
  await connectDB();

  const config = await CashbackConfig.findOne({});
  if (!config) {
    console.log("No existe CashbackConfig. No hay nada que migrar.");
    process.exit(0);
  }

  console.log(`Valor actual de feePercent: ${config.feePercent}`);

  if (config.feePercent === OLD_VALUE) {
    config.feePercent = NEW_VALUE;
    await config.save();
    console.log(`✅ feePercent migrado: ${OLD_VALUE} → ${NEW_VALUE} (2.5% de productos)`);
  } else if (config.feePercent === NEW_VALUE) {
    console.log("ℹ️  feePercent ya está en el valor nuevo (0.025). Nada que hacer.");
  } else {
    console.log(
      `⚠️  feePercent tiene un valor custom (${config.feePercent}). ` +
        `No lo modifico automáticamente. Si querías 2.5%, cambialo a 0.025 desde el panel admin.`,
    );
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
