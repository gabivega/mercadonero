/**
 * Utils/opRateLimit.js
 * ────────────────────────────────────────────────────────────────────────────
 * RATE LIMIT CLIENT-SIDE para operaciones sensibles (gas patrocinado).
 *
 * POR QUÉ EXISTE:
 *   El flujo de firma es 100% client-side (SDK Crossmint), así que el backend
 *   no ve las tx. Este módulo implementa una cuota por hora + monto mínimo en
 *   el navegador (localStorage), leyendo la política de `config/opPolicy.js`.
 *
 * QUÉ HACE Y QUÉ NO:
 *   - Hace: avisar al usuario y (si enforce=true) bloquear operaciones que
 *     superan la cuota o no llegan al mínimo. Registra cada op exitosa.
 *   - NO hace: seguridad dura. Un script podría borrar localStorage. La barrera
 *     real es el DRIP del backend (si no das gas, no se puede firmar).
 *
 * DISEÑO:
 *   - Ventana deslizante: guardamos los timestamps de cada op y contamos los
 *     que caen dentro de `windowMs`. Sin ventanas fijas → no hay picos.
 *   - Clave por `address:chain:opType` para no mezclar wallets ni redes.
 *   - Esta API está pensada para ser reemplazada por un fetch al backend sin
 *     tocar los componentes (misma firma de funciones).
 */
import { OP_POLICY, getOpLimit } from "../config/opPolicy";

const STORAGE_PREFIX = "nero_oprl:";

function storageKey({ address, chain, opType }) {
  return `${STORAGE_PREFIX}${String(address || "").toLowerCase()}:${chain || "default"}:${opType}`;
}

/** Lee los timestamps registrados (dentro de la ventana), limpiando viejos. */
function readTimestamps(key, windowMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const cutoff = Date.now() - windowMs;
    // Sólo conservamos los que están dentro de la ventana.
    const fresh = arr.filter((t) => typeof t === "number" && t >= cutoff);
    // Si limpiamos algo, persistimos para no crecer indefinidamente.
    if (fresh.length !== arr.length) {
      localStorage.setItem(key, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
}

/**
 * Consulta si una operación está permitida según la cuota y el monto.
 *
 * @param {object} opts
 * @param {string} opts.address    - Wallet que firma (smart wallet).
 * @param {string} opts.chain      - Red (p.ej. "polygon-amoy").
 * @param {string} opts.opType     - "send" | "withdraw_collateral" | ...
 * @param {number} [opts.amountUsd] - Monto de la operación (para el mínimo).
 * @returns {{ allowed: boolean, blocked: boolean, used: number, max: number,
 *             minUsd: number, belowMin: boolean, enforce: boolean,
 *             retryInMs: number, reason?: string }}
 *   allowed  → se puede proceder (si enforce=false siempre true salvo... ver abajo).
 *   blocked  → true si está bloqueado de verdad (enforce=true y se pasó).
 *   belowMin → el monto no llega al mínimo (siempre bloquea el monto, con o sin enforce,
 *              porque el mínimo también protege el gas y es una regla de negocio).
 */
export function checkOpRateLimit({ address, chain, opType, amountUsd } = {}) {
  const cfg = getOpLimit(opType);
  const windowMs = OP_POLICY.windowMs;
  const enforce = Boolean(OP_POLICY.enforce);
  const max = Number(cfg.maxPerHour ?? 0);
  const minUsd = Number(cfg.minUsd ?? 0);

  // Sin address (todavía no hay wallet) no podemos limitar por wallet.
  if (!address) {
    return {
      allowed: true,
      blocked: false,
      used: 0,
      max,
      minUsd,
      belowMin: false,
      enforce,
      retryInMs: 0,
    };
  }

  const key = storageKey({ address, chain, opType });
  const stamps = readTimestamps(key, windowMs);
  const used = stamps.length;

  // ── Validación de MONTO MÍNIMO ──
  // El mínimo protege el gas (una op de US$0.01 cuesta más de gas que de valor)
  // y es una regla de negocio. Se aplica SIEMPRE, aunque enforce=false, porque
  // no tiene que ver con la cuota de frecuencia.
  const belowMin =
    minUsd > 0 && Number.isFinite(Number(amountUsd)) && Number(amountUsd) < minUsd;

  // ── Cuota de frecuencia ──
  const overQuota = max > 0 && used >= max;

  // Tiempo hasta que se libere un cupo (cuando el más viejo salga de la ventana).
  let retryInMs = 0;
  if (overQuota && stamps.length > 0) {
    const oldest = Math.min(...stamps);
    retryInMs = Math.max(0, oldest + windowMs - Date.now());
  }

  // Si enforce=true, la cuota bloquea; si enforce=false, sólo avisa.
  const blocked = enforce && overQuota;

  let reason;
  if (belowMin) reason = `min_amount`;
  else if (blocked) reason = `over_quota`;

  return {
    // allowed = se puede proceder con la firma.
    //   - belowMin siempre frena (regla de monto, no de frecuencia).
    //   - overQuota sólo frena si enforce=true.
    allowed: !belowMin && !blocked,
    blocked,
    used,
    max,
    minUsd,
    belowMin,
    enforce,
    retryInMs,
    reason,
  };
}

/**
 * Registra una operación EXITOSA (para contar en la ventana).
 * Llamar DESPUÉS de que la firma on-chain se completó con éxito.
 *
 * @param {object} opts
 * @param {string} opts.address
 * @param {string} opts.chain
 * @param {string} opts.opType
 */
export function registerOp({ address, chain, opType } = {}) {
  if (!address) return;
  const key = storageKey({ address, chain, opType });
  try {
    const windowMs = OP_POLICY.windowMs;
    const stamps = readTimestamps(key, windowMs);
    stamps.push(Date.now());
    localStorage.setItem(key, JSON.stringify(stamps));
  } catch {
    /* localStorage no disponible: no es crítico */
  }
}

/**
 * Arma un mensaje de error/aviso legible en español para mostrar al usuario.
 * @returns {string}
 */
export function describeLimit(result) {
  if (!result) return "";
  if (result.belowMin) {
    return `El monto mínimo para esta operación es US$ ${result.minUsd}.`;
  }
  if (result.blocked) {
    const mins = Math.ceil((result.retryInMs || 0) / 60000);
    return `Alcanzaste el límite de ${result.max} operaciones por hora. Volvé a intentar en ~${mins} min.`;
  }
  return "";
}
