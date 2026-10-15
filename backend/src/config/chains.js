// backend/src/config/chains.js
//
// ════════════════════════════════════════════════════════════════════════════
// REGISTRO MULTICHAIN (colateral de vendedores)
// ────────────────────────────────────────────────────────────────────────────
// Fuente ÚNICA de verdad sobre las redes soportadas para el colateral.
//
// Conceptos clave:
//   - El colateral de un vendedor vive POR RED. La address EVM del vendedor es
//     la misma en todas las redes, pero cada red tiene su propio contrato
//     NeroCollateral con su propio mapping vendors[address].
//   - "Colateral efectivo total" = Σ (por red) del saldo libre en esa red.
//   - Cada red tiene su PROPIO token de colateral (stablecoin) con sus PROPIOS
//     decimales:
//       · BSC testnet   → USDT (18 decimales)
//       · Base Sepolia  → USDC (6 decimales)
//       · Polygon Amoy  → USDXM (6 decimales)  ⚠️ testnet usa USDXM, no USDC
//     Por eso NUNCA hay que hardcodear `18` al parsear/format units: usar
//     siempre `decimals` de esta config.
//
// Las direcciones (contrato de colateral y token) se leen del .env por red,
// así el deploy puede ir actualizándolas sin tocar código.
//
// ⚠️ COMPATIBILIDAD: la red `bscTestnet` mantiene como fallback las variables
// legacy (CONTRACT_ADDRESS / USDT_TESTNET_ADDRESS) para NO romper el entorno
// que ya está funcionando hoy.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Definición de cada red soportada.
 *
 * @typedef {Object} ChainConfig
 * @property {number}  chainId        chainId EVM (BSC 97, Base Sepolia 84532, Polygon Amoy 80002)
 * @property {string}  key            clave corta estable ("bscTestnet" | "baseSepolia" | "polygonAmoy")
 * @property {string}  name           nombre legible para UI
 * @property {string}  shortName      nombre corto para badges
 * @property {string}  rpc            URL del RPC
 * @property {string}  contractAddress  address del NeroCollateral (desde .env)
 * @property {Object}  collateralToken  { symbol, address, decimals }
 * @property {string}  explorerUrl    base del block explorer
 * @property {boolean} isTestnet
 * @property {string}  nativeCurrency símbolo de la moneda nativa (para gas drip / switchChain)
 */

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const BSC_TESTNET_CHAIN_ID = 97;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const POLYGON_AMOY_CHAIN_ID = 80002;

/**
 * Construye el registro de redes. Se evalúa una vez al importar el módulo,
 * leyendo process.env (que ya está cargado por dotenv en index.js).
 */
function buildChains() {
  return {
    [BSC_TESTNET_CHAIN_ID]: {
      chainId: BSC_TESTNET_CHAIN_ID,
      key: "bscTestnet",
      name: "BNB Smart Chain Testnet",
      shortName: "BSC",
      rpc:
        process.env.BSC_TESTNET_RPC ||
        "https://bsc-testnet-rpc.publicnode.com",
      // Fallback legacy: CONTRACT_ADDRESS / USDT_TESTNET_ADDRESS siguen valiendo
      // para BSC testnet mientras migramos a las variables nuevas por red.
      contractAddress:
        process.env.COLLATERAL_CONTRACT_BSC ||
        process.env.CONTRACT_ADDRESS ||
        "",
      collateralToken: {
        symbol: process.env.COLLATERAL_SYMBOL_BSC || "USDT",
        address:
          process.env.COLLATERAL_TOKEN_BSC ||
          process.env.USDT_TESTNET_ADDRESS ||
          "",
        decimals: num(process.env.COLLATERAL_DECIMALS_BSC, 18),
      },
      explorerUrl: "https://testnet.bscscan.com",
      isTestnet: true,
      nativeCurrency: "tBNB",
    },

    [BASE_SEPOLIA_CHAIN_ID]: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      key: "baseSepolia",
      name: "Base Sepolia",
      shortName: "Base",
      rpc:
        process.env.BASE_SEPOLIA_RPC ||
        "https://sepolia.base.org",
      contractAddress: process.env.COLLATERAL_CONTRACT_BASE || "",
      collateralToken: {
        symbol: process.env.COLLATERAL_SYMBOL_BASE || "USDC",
        address: process.env.COLLATERAL_TOKEN_BASE || "",
        // ⚠️ USDC en Base tiene 6 decimales, NO 18.
        decimals: num(process.env.COLLATERAL_DECIMALS_BASE, 6),
      },
      explorerUrl: "https://sepolia.basescan.org",
      isTestnet: true,
      nativeCurrency: "ETH",
    },

    [POLYGON_AMOY_CHAIN_ID]: {
      chainId: POLYGON_AMOY_CHAIN_ID,
      key: "polygonAmoy",
      name: "Polygon Amoy",
      shortName: "Polygon",
      // ⚠️ El RPC oficial (rpc-amoy.polygon.technology) presentó fallos de DNS
      // intermitentes; usamos el público de publicnode como default.
      rpc:
        process.env.POLYGON_AMOY_RPC ||
        "https://polygon-amoy-bor-rpc.publicnode.com",
      contractAddress: process.env.COLLATERAL_CONTRACT_POLYGON || "",
      collateralToken: {
        // ⚠️ En Polygon Amoy el stable de prueba es USDXM (no USDC/USDT mainnet).
        symbol: process.env.COLLATERAL_SYMBOL_POLYGON || "USDXM",
        address: process.env.COLLATERAL_TOKEN_POLYGON || "",
        decimals: num(process.env.COLLATERAL_DECIMALS_POLYGON, 6),
      },
      explorerUrl: "https://amoy.polygonscan.com",
      isTestnet: true,
      nativeCurrency: "POL",
    },
  };
}

/** Registro de redes indexado por chainId. */
export const CHAINS = buildChains();

/**
 * Red por defecto del sistema (la que se usa si no se especifica chainId).
 * Mantiene BSC testnet para NO romper el flujo que ya funciona hoy.
 */
export const DEFAULT_CHAIN_ID = num(
  process.env.DEFAULT_CHAIN_ID,
  BSC_TESTNET_CHAIN_ID,
);

/** Lista de todos los chainId soportados. */
export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

/**
 * Devuelve la config de una red. Lanza si la red no está soportada, para
 * detectar temprano errores de configuración (en vez de un fallo críptico).
 */
export function getChainConfig(chainId) {
  const id = chainId == null ? DEFAULT_CHAIN_ID : Number(chainId);
  const chain = CHAINS[id];
  if (!chain) {
    throw new Error(
      `Red no soportada (chainId ${chainId}). Soportadas: ${SUPPORTED_CHAIN_IDS.join(", ")}.`,
    );
  }
  return chain;
}

/**
 * Solo las redes que están REALMENTE configuradas (tienen contrato de colateral
 * y token). Es lo que el backend recorre para detectar saldo multichain: no
 * tiene sentido consultar una red sin contrato desplegado.
 */
export function getConfiguredChains() {
  return SUPPORTED_CHAIN_IDS.map((id) => CHAINS[id]).filter(
    (c) => c.contractAddress && c.collateralToken?.address,
  );
}

/** Info "pública" de una red para exponer al frontend (sin secretos). */
export function serializeChain(chain) {
  return {
    chainId: chain.chainId,
    key: chain.key,
    name: chain.name,
    shortName: chain.shortName,
    tokenSymbol: chain.collateralToken.symbol,
    tokenAddress: chain.collateralToken.address,
    tokenDecimals: chain.collateralToken.decimals,
    contractAddress: chain.contractAddress,
    explorerUrl: chain.explorerUrl,
    isTestnet: chain.isTestnet,
    nativeCurrency: chain.nativeCurrency,
  };
}

export default CHAINS;
