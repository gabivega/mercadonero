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

// ════════════════════════════════════════════════════════════════════════════
// PARÁMETROS DEL GAS DRIP, POR RED
// ────────────────────────────────────────────────────────────────────────────
// POR QUÉ ES POR RED Y YA NO GLOBAL:
//   Antes había UN solo GAS_DRIP_AMOUNT_BNB / GAS_DRIP_MIN_BNB aplicado a TODAS
//   las redes. Eso mezcla tres economías distintas con un valor pensado en tBNB:
//   el mismo "0.003" es calderilla en BSC testnet y ~10-100x lo necesario en
//   Base/Polygon mainnet. Un valor único es un error de configuración esperando
//   a pasar a producción.
//
// REGLA DURA (mainnet):
//   Los valores de abajo son DEFAULT DE TESTNET. Si una red es mainnet
//   (`isTestnet === false`) y no se declararon sus valores explícitos en el
//   .env, `getGasDripParams()` LANZA. Preferimos que el server no arranque a
//   entregar 0.003 ETH por drip en Base mainnet. El objetivo es que mainnet sea
//   una decisión EXPLÍCITA, nunca un default heredado de testnet.
//
// El monto NO es "cuánto gasto por usuario por día": es CUÁNTO ENTREGO cuando el
// user se quedó sin gas. La regla de diseño es: cubrir ~3-5 UserOps con margen.
//
// ⚠️ MEDIDO (no estimado) — costo de 1 UserOp (~300k gas) en cada testnet:
//     BSC testnet    @0.1 gwei  → ~0.00003 tBNB
//     Polygon Amoy   @30 gwei   → ~0.009 POL   ← el más caro lejos
//     Base Sepolia   @0.011 gwei→ ~0.0000033 ETH
//
// De ahí salen los montos: BSC y Base necesitan MUY poco; Polygon necesita más
// porque el gwei de Amoy es alto. Un único "0.003" para las tres (lo que había)
// era 100x de más en BSC/Base y casi insuficiente en Polygon.
//
// OJO: un DEPÓSITO de colateral son DOS UserOps (approve + deposit) más el
// approve del token. Por eso el monto cubre varios UserOps y no uno.
const GAS_DRIP_DEFAULTS = {
  [BSC_TESTNET_CHAIN_ID]: { amount: "0.0002", min: "0.0001", alias: "BSC_TESTNET" },
  [POLYGON_AMOY_CHAIN_ID]: { amount: "0.05", min: "0.03", alias: "POLYGON_AMOY" },
  [BASE_SEPOLIA_CHAIN_ID]: { amount: "0.00002", min: "0.00001", alias: "BASE_SEPOLIA" },
};

/**
 * Devuelve los parámetros de gas drip de una red { amount, min, source }.
 *
 * @param {number} chainId
 * @returns {{amount:string, min:string, source:"env"|"testnet-default"}}
 * @throws {Error} si la red es mainnet y no tiene valores explícitos en el .env.
 */
export function getGasDripParams(chainId) {
  const chain = getChainConfig(chainId);
  const def = GAS_DRIP_DEFAULTS[chain.chainId];

  // 1) Valores explícitos en el .env (tienen prioridad SIEMPRE).
  const envAmount = def
    ? process.env[`GAS_DRIP_AMOUNT_${def.alias}`]
    : undefined;
  const envMin = def ? process.env[`GAS_DRIP_MIN_${def.alias}`] : undefined;

  if (envAmount || envMin) {
    return {
      amount: envAmount || def.amount,
      min: envMin || def.min,
      source: "env",
    };
  }

  // 2) Sin valores explícitos: solo permitido en TESTNET.
  if (chain.isTestnet && def) {
    return { amount: def.amount, min: def.min, source: "testnet-default" };
  }

  // 3) Mainnet sin configurar → fallar fuerte (ver nota de arriba).
  throw new Error(
    `[chains] Gas drip sin configurar para la red ${chain.name} (chainId ${chain.chainId}). ` +
      `Es mainnet: definí GAS_DRIP_AMOUNT_${def?.alias || "MAINNET"} y ` +
      `GAS_DRIP_MIN_${def?.alias || "MAINNET"} en el .env del backend. ` +
      `No se usan defaults de testnet en producción a propósito.`,
  );
}

// ── ESCROW DE PAGOS CRYPTO (multichain) ──────────────────────────────────────
// El escrow (NeroEscrow) está desplegado en varias redes. Cada red tiene su
// propio contrato (admin = misma wallet backend) y su propio token de pago.
//
// ⚠️ Por qué importa el MODELO DE FONDEO por red:
//   - "token": el comprador fondea con la stablecoin (fundOrder) y paga gas con
//     la moneda nativa. Sirve en BSC Testnet (Privy/EOA: el usuario tiene tBNB).
//   - "native": la smart wallet Crossmint es ERC-4337 con paymaster SPONSOR: el
//     gas lo paga el sponsor, por lo que NO se puede pagar gas en el token de
//     prueba. El comprador fondea con la MONEDA NATIVA (fundOrderNative) y el
//     contrato retiene ese valor.
//
// El backend usa `getEscrowChainConfig()` para: (1) elegir el contrato/token
// según la red; (2) verificar montos con los decimales correctos; (3) liberar o
// reembolsar según el modelo de fondeo.
const ESCROW_CHAINS = {
  [BSC_TESTNET_CHAIN_ID]: {
    key: "bscTestnet",
    // Fallback legacy: el escrow se deployó en BSC con esta variable.
    contractAddress:
      process.env.ESCROW_CONTRACT_ADDRESS_BSC ||
      process.env.ESCROW_CONTRACT_ADDRESS ||
      "",
    // Token FIJO de pago (USDT). Fallback a la var legacy usada en BSC.
    tokenAddress:
      process.env.ESCROW_TOKEN_BSC ||
      process.env.USDT_TOKEN_ADDRESS ||
      process.env.USDT_TESTNET_ADDRESS ||
      "",
    tokenSymbol: process.env.ESCROW_TOKEN_SYMBOL_BSC || "USDT",
    tokenDecimals: num(process.env.ESCROW_TOKEN_DECIMALS_BSC, 18),
    fundingMode: "token",
    nativeSymbol: "tBNB",
    nativeDecimals: 18,
  },
  [POLYGON_AMOY_CHAIN_ID]: {
    key: "polygonAmoy",
    contractAddress: process.env.ESCROW_CONTRACT_POLYGON || "",
    // Default: la moneda NATIVA de la red (POL). La stable de prueba (USDXM) no
    // puede pagar gas en la smart wallet Crossmint (paymaster sponsor).
    tokenAddress: process.env.ESCROW_TOKEN_POLYGON || "",
    // ⚠️ `payment.token` del modelo Order es un enum que YA incluye "USDXM":
    //   USDT | USDC | USDXM | DAI | BNB | POL | ETH
    // Por eso el símbolo que definamos acá (vía ESCROW_TOKEN_SYMBOL_POLYGON)
    // debe ser uno de esos valores. Si se usa el stable de prueba, definir
    // ESCROW_TOKEN_SYMBOL_POLYGON=USDXM y el controller lo persiste tal cual.
    // (El whitelist de orderController —ALLOWED_PAYMENT_TOKENS— debe mantenerse
    // SIEMPRE alineado con este enum.)
    tokenSymbol: process.env.ESCROW_TOKEN_SYMBOL_POLYGON || "POL",
    tokenDecimals: num(process.env.ESCROW_TOKEN_DECIMALS_POLYGON, 18),
    fundingMode: process.env.ESCROW_FUNDING_MODE_POLYGON || "native",
    nativeSymbol: "POL",
    nativeDecimals: 18,
  },
  [BASE_SEPOLIA_CHAIN_ID]: {
    key: "baseSepolia",
    contractAddress: process.env.ESCROW_CONTRACT_BASE || "",
    tokenAddress: process.env.ESCROW_TOKEN_BASE || "",
    tokenSymbol: process.env.ESCROW_TOKEN_SYMBOL_BASE || "ETH",
    tokenDecimals: num(process.env.ESCROW_TOKEN_DECIMALS_BASE, 18),
    fundingMode: process.env.ESCROW_FUNDING_MODE_BASE || "native",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
};

/** Red por defecto del ESCROW de pagos crypto. */
export const ESCROW_DEFAULT_CHAIN_ID = num(
  process.env.ESCROW_DEFAULT_CHAIN_ID,
  POLYGON_AMOY_CHAIN_ID,
);

/**
 * Config del escrow para una red. Si la red no está configurada, cae a BSC.
 * Devuelve además `chain` (config general de red: rpc / explorer).
 */
export function getEscrowChainConfig(chainId) {
  const id = chainId == null ? ESCROW_DEFAULT_CHAIN_ID : Number(chainId);
  const meta = ESCROW_CHAINS[id] || ESCROW_CHAINS[BSC_TESTNET_CHAIN_ID];
  return {
    chainId: id,
    ...meta,
    chain: CHAINS[id] || CHAINS[BSC_TESTNET_CHAIN_ID],
  };
}

/** Redes con contrato de escrow realmente configurado. */
export function getConfiguredEscrowChains() {
  return Object.values(ESCROW_CHAINS).filter((c) => c.contractAddress);
}

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

/**
 * Info "pública" de una red de ESCROW para exponer al frontend (sin secretos).
 * Es lo que el Checkout consume para: detectar el saldo del comprador en cada
 * (red, token) de pago y dejar que elija con cuál pagar.
 *
 * Devuelve null si esa red no tiene escrow configurado (no se debe ofrecer).
 */
export function serializeEscrowChain(chainId) {
  const c = getEscrowChainConfig(chainId);
  if (!c.contractAddress) return null;
  // En modo nativo el "token" es la moneda nativa (sin address ERC-20).
  const isNative = c.fundingMode === "native";
  return {
    chainId: c.chainId,
    key: c.key,
    fundingMode: c.fundingMode,
    contractAddress: c.contractAddress,
    // Para el comprador: qué token concreto debe tener y transferir.
    tokenAddress: isNative ? null : c.tokenAddress,
    tokenSymbol: isNative ? c.nativeSymbol : c.tokenSymbol,
    tokenDecimals: isNative ? c.nativeDecimals : c.tokenDecimals,
    nativeSymbol: c.nativeSymbol,
    chain: c.chain ? serializeChain(c.chain) : null,
  };
}

/**
 * Lista TODAS las redes con escrow configurado, serializada para el frontend.
 * El Checkout ofrece como medios de pago SOLO estas (red + token).
 */
export function getEscrowPaymentOptions() {
  return Object.keys(ESCROW_CHAINS)
    .map(Number)
    .map((id) => serializeEscrowChain(id))
    .filter(Boolean);
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

// ════════════════════════════════════════════════════════════════════════════
// CONFIG DE COLATERAL PARA EL FRONTEND (fuente ÚNICA de verdad)
// ────────────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE:
//   Antes el frontend tenía HARDCODEADAS (en CollateralManager.jsx, WalletPage.jsx
//   y DepositCollateral.jsx) las direcciones de contrato y de token de cada red,
//   con `import.meta.env.VITE_*` como "override" que NUNCA estaba definido en el
//   .env. Resultado: había VARIAS direcciones distintas del mismo contrato dando
//   vueltas y el .env quedaba decorativo. Ese es exactamente el escenario que
//   produce un "depósito fantasma" que no impacta en el contrato real.
//
//   Ahora el backend es la ÚNICA fuente: el front lee esta config por
//   `GET /api/config/collateral-options` y no tiene ni una sola dirección.
//
// NOMBRE QUE USA CROSSMINT:
//   El SDK identifica la red por NOMBRE ("base-sepolia"), no por chainId. Ese
//   nombre lo declaramos acá para no volver a hardcodearlo en el front.
//
// `sendable`:
//   true  → Crossmint puede FIRMAR en esa red (depositar/retirar colateral).
//   false → solo lectura (p. ej. BSC testnet, que Crossmint no soporta firmar).
const CROSSMINT_CHAIN_NAME = {
  [BSC_TESTNET_CHAIN_ID]: "bsc-testnet",
  [BASE_SEPOLIA_CHAIN_ID]: "base-sepolia",
  [POLYGON_AMOY_CHAIN_ID]: "polygon-amoy",
  // ── MAINNET: al agregar la red a CHAINS con sus direcciones en el .env,
  // aparece sola en la UI (no hay que tocar el frontend).
  56: "bsc",
  8453: "base",
  137: "polygon",
};

/** Nombre de red usado por el SDK de Crossmint para firmar (o null). */
export function getCrossmintChainName(chainId) {
  return CROSSMINT_CHAIN_NAME[Number(chainId)] || null;
}

/**
 * Devuelve las redes de COLATERAL utilizables, serializadas para el frontend.
 *
 * Solo incluye redes que tienen AMBOS: contrato de colateral y token. Así, al
 * pasar a mainnet, basta con cargar las direcciones en el .env: la red aparece
 * SOLA en la UI, sin tocar una línea de frontend.
 *
 * @param {number} [chainId] Si se pasa, devuelve solo esa red (o null).
 * @returns {Array<Object>|Object|null}
 */
export function getCollateralOptions(chainId) {
  const all = SUPPORTED_CHAIN_IDS.map((id) => {
    const c = CHAINS[id];
    // Sin contrato o sin token no se puede operar: no se ofrece.
    if (!c?.contractAddress || !c?.collateralToken?.address) return null;

    const chainName = CROSSMINT_CHAIN_NAME[id] || null;
    return {
      chainId: c.chainId,
      key: c.key,
      // Nombre exacto que espera el SDK de Crossmint en send()/writeContract().
      chainName,
      label: c.name,
      shortLabel: c.shortName,
      isTestnet: c.isTestnet,
      explorerUrl: c.explorerUrl,
      nativeCurrency: c.nativeCurrency,
      // Contrato NeroCollateral de esta red.
      contractAddress: c.contractAddress,
      token: {
        symbol: c.collateralToken.symbol,
        address: c.collateralToken.address,
        // ⚠️ NUNCA hardcodear decimales: BSC USDT=18, Base/Polygon stable=6.
        decimals: c.collateralToken.decimals,
      },
      // ¿Crossmint puede firmar acá? (false → la UI lo muestra solo lectura).
      sendable: Boolean(chainName),
    };
  }).filter(Boolean);

  if (chainId != null) {
    return all.find((o) => o.chainId === Number(chainId)) || null;
  }
  return all;
}

export default CHAINS;
