import 'dotenv/config';
import connectDB from '../config/database.js';
import { runElitSyncOnce } from '../services/elitSyncCron.js';

// ─────────────────────────────────────────────────────────────────────────────
// Script one-shot de sincronización full con Elit.
//
// Pensado para correr desde el Programador de tareas de Windows / cron del SO:
//   node src/scripts/runElitSyncOnce.js            → aplica cambios
//   node src/scripts/runElitSyncOnce.js --dry-run  → sólo reporta
//   node src/scripts/runElitSyncOnce.js --prices   → también recalcula precios
//
// El precio sólo se recalcula si se pasa --prices o ELIT_SYNC_UPDATE_PRICES=true.
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const updatePrices = args.includes('--prices');

const main = async () => {
  try {
    await connectDB();
    console.log('[ElitSync] DB conectada. Corriendo sincronización full...');
    const result = await runElitSyncOnce({ dryRun, updatePrices });
    console.log('[ElitSync] Resultado:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('[ElitSync] Falló el script:', error?.message || error);
    process.exit(1);
  }
};

main();
