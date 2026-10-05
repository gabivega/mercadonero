import cron from 'node-cron';
import { syncElitFull } from './elitSyncService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cron de sincronización con Elit.
//
// Por defecto DESACTIVADO (igual que la limpieza de órdenes): en producción
// preferimos que el sync se dispare a mano desde el panel, o desde el
// Programador de tareas del sistema. Se activa con ENABLE_ELIT_SYNC_CRON=true.
//
// Variables de entorno:
//   ENABLE_ELIT_SYNC_CRON   → "true" para activar el scheduler embebido.
//   ELIT_SYNC_CRON          → expresión cron (default: "0 4 * * *" = 04:00 diario).
//   ELIT_SYNC_UPDATE_PRICES → "true" para recalcular precios (default: false).
//   ELIT_SYNC_MARKUP        → markup por defecto (default: 0.20).
// ─────────────────────────────────────────────────────────────────────────────

// Lock en memoria para evitar solapamiento de pasadas.
let running = false;

/**
 * Ejecuta UNA pasada de sincronización full.
 * Exportada para poder invocarla desde un script (Task Scheduler/cron del SO)
 * sin depender de node-cron.
 *
 * @param {Object} [opts] Se pasa tal cual a syncElitFull.
 */
export const runElitSyncOnce = async (opts = {}) => {
  if (running) {
    console.warn('[ElitSync] Ya hay una sincronización en curso; se omite esta pasada.');
    return { skipped: true, reason: 'already_running' };
  }
  running = true;

  const updatePrices =
    opts.updatePrices ?? String(process.env.ELIT_SYNC_UPDATE_PRICES).toLowerCase() === 'true';

  console.log(`🚀 [ElitSync] Iniciando ${opts.dryRun ? 'DRY-RUN ' : ''}sincronización full...`);
  try {
    const result = await syncElitFull({
      dryRun: opts.dryRun ?? false,
      updatePrices,
      defaultMarkup: opts.defaultMarkup,
    });
    console.log(
      `[ElitSync] Finalizado. Cambios: ${result.totalChanges ?? result.wouldChange ?? 0}, ` +
        `actualizados: ${result.updated?.length ?? 0}, errores: ${result.errors?.length ?? 0}.`
    );
    return result;
  } catch (error) {
    console.error('[ElitSync] Error crítico en la sincronización:', error?.message || error);
    return { error: error?.message || 'error desconocido' };
  } finally {
    running = false;
  }
};

/**
 * Arranca el scheduler embebido (node-cron). No-op si está desactivado por env.
 */
const startElitSyncCron = () => {
  if (String(process.env.ENABLE_ELIT_SYNC_CRON).toLowerCase() !== 'true') {
    console.log(
      '[ElitSync] Cron DESACTIVADO (seteá ENABLE_ELIT_SYNC_CRON=true para activarlo).'
    );
    return;
  }

  const schedule = process.env.ELIT_SYNC_CRON || '0 4 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[ElitSync] Expresión cron inválida: "${schedule}". Cron no iniciado.`);
    return;
  }

  cron.schedule(schedule, () => {
    runElitSyncOnce();
  });

  console.log(`[ElitSync] Cron activo con schedule "${schedule}".`);
};

export default startElitSyncCron;
