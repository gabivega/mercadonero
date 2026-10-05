// services/escrowConfigService.js
import EscrowConfig from "../models/EscrowConfig.js";

/**
 * Devuelve la configuración global del escrow. Como es singleton, la crea con
 * valores por defecto si no existe todavía.
 */
export async function getEscrowConfig() {
  let config = await EscrowConfig.findOne({});
  if (!config) {
    config = await EscrowConfig.create({});
  }
  return config;
}

/**
 * Días (por defecto) de espera, desde el fondeo, sin confirmación del comprador,
 * para habilitar la solicitud de liberación manual al admin.
 */
export const DEFAULT_RELEASE_FALLBACK_DAYS = 7;
