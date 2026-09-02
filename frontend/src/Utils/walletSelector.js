/**
 * Utils/walletSelector.js
 * Utilidad para seleccionar SIEMPRE la embedded wallet del usuario autenticado.
 *
 * PROBLEMA: `useWallets()` de Privy devuelve TODAS las wallets conectadas en
 * la sesión. Usar `wallets[0]` no garantiza que sea la wallet del usuario
 * logueado (puede haber varias y/o en otro orden), lo que provoca errores de
 * autorización como "User is not part of a key quorum".
 *
 * La embedded wallet del usuario es `user.wallet.address`. Esta utilidad la
 * busca dentro del array por coincidencia de dirección.
 *
 * @param {Array}  wallets       - Array devuelto por useWallets() de Privy.
 * @param {string} ownerAddress  - Dirección embedded del usuario (user.wallet.address).
 * @returns {object|null}        - La wallet que coincide, o la primera conectada,
 *                                 o null si no hay ninguna.
 */
export function getAuthenticatedWallet(wallets = [], ownerAddress = "") {
  if (!Array.isArray(wallets) || wallets.length === 0) return null;

  // 1) Prioridad: la wallet que coincide exactamente con la del usuario.
  if (ownerAddress) {
    const ownerNormalized = normalizeAddress(ownerAddress);
    const match = wallets.find(
      (w) => w?.address && normalizeAddress(w.address) === ownerNormalized,
    );
    if (match) return match;
  }

  // 2) Fallback: la primera wallet conectada.
  const connected = wallets.find((w) => w?.connected);
  if (connected) return connected;

  // 3) Último recurso: la primera disponible.
  return wallets[0];
}

/**
 * Normaliza una dirección a minúsculas para comparar sin importar el formato.
 */
function normalizeAddress(addr) {
  return String(addr || "").trim().toLowerCase();
}
