/**
 * config/opPolicy.js
 * ────────────────────────────────────────────────────────────────────────────
 * POLÍTICA DE OPERACIONES SENSIBLES (gas patrocinado por la plataforma).
 *
 * CONTEXTO / POR QUÉ EXISTE:
 *   El gas de las smart wallets Crossmint lo paga la PLATAFORMA vía gas drip
 *   (NO hay gas sponsorship premium: ese requiere plan de pago de Crossmint).
 *   Si no limitamos, un usuario podría generar cientos de micro-operaciones
 *   (p.ej. 1000 retiros de US$0.01) y quebrar el presupuesto de gas sin que
 *   nosotros nos enteremos.
 *
 * ESTRATEGIA:
 *   - Cada operación firmada (send / retiro / depósito de colateral / fondeo)
 *     tiene una cuota por hora y un monto mínimo.
 *   - Hoy `enforce: false` → NO se bloquea (solo se avisa y se registra). El día
 *     que pases a producción, cambias `enforce: true` y estos límites pasan a
 *     bloquear. CERO cambios en los componentes.
 *
 *   ⚠️ NOTA DE ARQUITECTURA:
 *   El flujo de firma es 100% client-side (SDK Crossmint). Este rate limit vive
 *   en el navegador (localStorage) y por defecto NO bloquea, por lo que es una
 *   barrera de UX, no de seguridad dura. La barrera real de seguridad es el
 *   DRIP (backend): sólo se entrega gas si el usuario respeta la cuota → si un
 *   script saltea este check, igual deja de recibir gas y no puede firmar.
 *
 * Ajustá los números acá y en ningún otro lado.
 */

export const OP_POLICY = {
  /**
   * ¿Los límites bloquean o solo avisan?
   *   false → aviso + registro (etapa testnet). RECOMENDADO hoy.
   *   true  → bloquea la operación al superar la cuota.
   */
  enforce: false,

  /**
   * Ventana de la cuota por tipo de operación.
   * maxPerHour: operaciones permitidas por ventana deslizante de 60 min.
   * minUsd:     monto mínimo (en USD) para permitir la operación.
   */
  limits: {
    // Envío de tokens desde la wallet a una dirección externa.
    // Es el flujo con MÁS riesgo (disponible para cualquier user con wallet).
    send: { maxPerHour: 2, minUsd: 1 },

    // Retiro de colateral (sellers). Cubre el abuso de "mil micro retiros".
    withdraw_collateral: { maxPerHour: 2, minUsd: 5 },

    // Depósito de colateral (2 UserOps: approve + deposit → más gas).
    deposit_collateral: { maxPerHour: 5, minUsd: 20 },

    // Fondeo de escrow/pool (compra con cripto). Flujo principal de comprador.
    funding: { maxPerHour: 15 },

    // Fallback para operaciones sin tipo declarado.
    default: { maxPerHour: 20 },
  },

  // Duración de la ventana deslizante (ms). 60 min.
  windowMs: 60 * 60 * 1000,
};

/** Devuelve la config efectiva de un tipo de operación (con fallback a default). */
export function getOpLimit(opType) {
  return OP_POLICY.limits[opType] || OP_POLICY.limits.default;
}
