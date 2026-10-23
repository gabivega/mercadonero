// ─────────────────────────────────────────────────────────────────────────
// CONFIG DE REDES (TESTNET)
// ─────────────────────────────────────────────────────────────────────────
// Centraliza, por chainId, los datos que la UI necesita para mostrar info
// on-chain de una orden cripto SIN hardcodear un explorador fijo (antes se
// asumía siempre BSC testnet, lo que rompía cuando la orden era en Base,
// Polygon, etc.).
//
// ⚠️ TESTNET: cuando pasemos a mainnet, reemplazar estas entradas por las de
// producción:
//   - Polygon mainnet : chainId 137, https://polygonscan.com
//   - Base mainnet    : chainId 8453, https://basescan.org
//   - BSC mainnet     : chainId 56, https://bscscan.com
// (y actualizar las direcciones de contrato/token correspondientes).
//
// Cada entrada:
//   key        nombre corto interno
//   label      nombre legible para la UI
//   explorer   URL base del explorador (para /tx/ y /address/)
//   nativeSymbol  símbolo de la moneda nativa (por si el pago es nativo)
export const CHAINS = {
  97: {
    key: "bscTestnet",
    label: "BSC Testnet",
    explorer: "https://testnet.bscscan.com",
    nativeSymbol: "tBNB",
  },
  80002: {
    key: "polygonAmoy",
    label: "Polygon Amoy",
    explorer: "https://amoy.polygonscan.com",
    nativeSymbol: "POL",
  },
  84532: {
    key: "baseSepolia",
    label: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
    nativeSymbol: "ETH",
  },
};

// Red por defecto si la orden no trae chainId (compatibilidad con órdenes
// viejas que se creaban en BSC testnet).
export const DEFAULT_CHAIN_ID = 97;

/** Devuelve la config de la red o `null` si no está mapeada. */
export function getChain(chainId) {
  if (chainId == null) return null;
  return CHAINS[Number(chainId)] || null;
}

/**
 * Devuelve la config de la red de una orden, resolviendo el chainId desde
 * distintas ubicaciones donde el backend lo persiste.
 */
export function getOrderChain(order) {
  const chainId =
    order?.chainId ?? order?.payment?.chainId ?? order?.onChain?.lockedChainId;
  return getChain(chainId);
}

/** URL al explorador para una transacción, según la red. */
export function txUrl(chainId, hash) {
  const chain = getChain(chainId);
  if (!chain || !hash) return null;
  return `${chain.explorer}/tx/${hash}`;
}

/** URL al explorador para una dirección (contrato/token), según la red. */
export function addressUrl(chainId, address) {
  const chain = getChain(chainId);
  if (!chain || !address) return null;
  return `${chain.explorer}/address/${address}`;
}

/** Nombre legible de la red (o fallback genérico). */
export function chainLabel(chainId) {
  const chain = getChain(chainId);
  return chain?.label || (chainId != null ? `Red ${chainId}` : "Red desconocida");
}

/** Shorten de una dirección/hash: 0x1234...abcd */
export function shortenHash(value, head = 8, tail = 6) {
  if (!value) return "—";
  const str = String(value);
  if (str.length <= head + tail) return str;
  return `${str.slice(0, head)}...${str.slice(-tail)}`;
}
