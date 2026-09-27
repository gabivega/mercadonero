/**
 * Ejecuta MANUALMENTE una pasada de la limpieza de órdenes expiradas
 * (la misma lógica del cron, pero a demanda).
 *
 * Útil en el modelo actual donde el cron está DESACTIVADO por defecto
 * (ENABLE_ORDER_CLEANUP_CRON no seteado). Corré esto puntualmente cuando
 * lo necesites, sin dejar un proceso corriendo 24/7.
 *
 * Uso (desde /backend, con acceso a la DB):
 *   node src/scripts/runOrderCleanupOnce.js
 */
import "dotenv/config";
import connectDB from "../config/database.js";
import { runOrderCleanupOnce } from "../services/orderCleanup.js";

const run = async () => {
  await connectDB();
  await runOrderCleanupOnce();
  console.log("✅ Limpieza puntual finalizada.");
  process.exit(0);
};

run().catch((err) => {
  console.error("Error en runOrderCleanupOnce:", err);
  process.exit(1);
});
