import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// API de sincronización con Elit (lado frontend).
//
// Envuelve los endpoints de nuestro backend:
//   POST /api/elit/sync/preview  → tabla de diferencias (no escribe)
//   POST /api/elit/sync/apply    → aplica los cambios seleccionados
//
// Las credenciales de Elit nunca llegan al cliente.
// ─────────────────────────────────────────────────────────────────────────────

const serverUrl = import.meta.env.VITE_SERVER_URL;

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Pide al backend la tabla de diferencias entre nuestro stock/precios y Elit.
 *
 * @param {string} token  Access token de Privy.
 * @param {{ defaultMarkup?: number, includeUnchanged?: boolean }} [opts]
 * @returns {Promise<Object>} { success, rows, summary, fetchedAt, localCount, elitMatched }
 */
export const previewElitSync = async (token, opts = {}) => {
  const { data } = await axios.post(
    `${serverUrl}/api/elit/sync/preview`,
    opts,
    { headers: authHeaders(token) }
  );
  return data;
};

/**
 * Aplica los cambios seleccionados.
 *
 * @param {string} token
 * @param {Array<Object>} changes  Cada uno: { productId, applyStock?, elitStock?,
 *                                  applyPrice?, newPrice?, markup?, elitCost?, markRemoved? }
 * @returns {Promise<Object>} { success, updated, skipped, errors, detail }
 */
export const applyElitSync = async (token, changes = []) => {
  const { data } = await axios.post(
    `${serverUrl}/api/elit/sync/apply`,
    { changes },
    { headers: authHeaders(token) }
  );
  return data;
};
