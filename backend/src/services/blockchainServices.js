// backend/src/services/blockchainServices.js
//
// ════════════════════════════════════════════════════════════════════════════
// SERVICIO DE BLOCKCHAIN — MULTICHAIN (colateral de vendedores)
// ────────────────────────────────────────────────────────────────────────────
// Antes este módulo era SINGLE-CHAIN (todo hardcodeado a BSC testnet). Ahora es
// una FÁBRICA per-chain: se cachea un provider + contrato por chainId y todas
// las funciones aceptan un `chainId` OPCIONAL al final.
//
// ⚠️ COMPATIBILIDAD: si el caller NO pasa `chainId`, se usa DEFAULT_CHAIN_ID
// (BSC testnet por ahora). Así el flujo actual sigue funcionando idéntico.
//
// Decimales: se leen de la config de la red (USDT=18 en BSC, USDC/USDXM=6 en
// Base/Polygon). NUNCA hardcodear 18.
// ════════════════════════════════════════════════════════════════════════════

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getChainConfig,
  getConfiguredChains,
  DEFAULT_CHAIN_ID,
  CHAINS,
} from "../config/chains.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, "../../contracts/NeroCollateralABI.json");
const contractABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

const PRIVATE_KEY = process.env.WALLET_PK || process.env.PRIVATE_KEY;

// ────────────────────────────────────────────────────────────────────────────
// CACHÉS POR RED (evita recrear providers/contratos en cada request)
// ────────────────────────────────────────────────────────────────────────────
const providerCache = new Map(); // chainId → ethers.JsonRpcProvider
const signerCache = new Map(); // chainId → ethers.Wallet (admin/deployer)
const contractCache = new Map(); // chainId → ethers.Contract (con signer admin)

/** Provider (solo lectura) de una red. */
function getProvider(chainId) {
  const chain = getChainConfig(chainId);
  if (!providerCache.has(chain.chainId)) {
    providerCache.set(
      chain.chainId,
      new ethers.JsonRpcProvider(chain.rpc, chain.chainId, {
        staticNetwork: true,
      }),
    );
  }
  return providerCache.get(chain.chainId);
}

/** Wallet admin/deployer conectada a una red (tiene WALLET_PK). */
function getAdminWallet(chainId) {
  const chain = getChainConfig(chainId);
  if (!PRIVATE_KEY) {
    throw new Error("Falta WALLET_PK (o PRIVATE_KEY) en el .env");
  }
  if (!signerCache.has(chain.chainId)) {
    signerCache.set(
      chain.chainId,
      new ethers.Wallet(PRIVATE_KEY, getProvider(chain.chainId)),
    );
  }
  return signerCache.get(chain.chainId);
}

/**
 * Contrato admin (con firma) de una red. Lanza si la red no tiene contrato
 * desplegado: mejor un error claro que un fallo críptico de ethers.
 */
function getPoolContract(chainId) {
  const chain = getChainConfig(chainId);
  if (!chain.contractAddress) {
    throw new Error(
      `La red ${chain.name} (${chain.chainId}) no tiene contrato de colateral configurado ` +
        `(COLLATERAL_CONTRACT_${chain.key.toUpperCase()}).`,
    );
  }
  if (!contractCache.has(chain.chainId)) {
    contractCache.set(
      chain.chainId,
      new ethers.Contract(
        chain.contractAddress,
        contractABI,
        getAdminWallet(chain.chainId),
      ),
    );
  }
  return contractCache.get(chain.chainId);
}

/** Contrato de SOLO LECTURA de una red (sin firma). */
function getReadOnlyContract(chainId) {
  const chain = getChainConfig(chainId);
  if (!chain.contractAddress) {
    throw new Error(
      `La red ${chain.name} (${chain.chainId}) no tiene contrato de colateral configurado.`,
    );
  }
  return new ethers.Contract(chain.contractAddress, contractABI, getProvider(chain.chainId));
}

/** Helper de formato según decimales de la red (default BSC = 18). */
function formatToken(wei, chain) {
  return parseFloat(ethers.formatUnits(wei, chain.collateralToken.decimals));
}
function parseToken(amount, chain) {
  return ethers.parseUnits(String(amount), chain.collateralToken.decimals);
}

// ════════════════════════════════════════════════════════════════════════════
// LECTURA
// ════════════════════════════════════════════════════════════════════════════

/**
 * HERRAMIENTA DE LECTURA: Consulta el monto congelado (lock) real de una orden
 * en el contrato. Devuelve 0 si la orden NO tiene saldo bloqueado, es decir,
 * si el colateral YA fue liberado/desbloqueado on-chain.
 *
 * Es CRÍTICO no confiar solo en que "una tx se minó sin revertir" para dar por
 * liberado el colateral: una transacción puede confirmarse pero la lógica
 * interna del contrato pudo no descongelar realmente el saldo (firma distinta,
 * fee distinto, lock inexistente, etc.). Este fue exactamente el caso que dio
 * origen a este diagnóstico.
 */
export async function getOrderLock(orderId, chainId = DEFAULT_CHAIN_ID) {
  try {
    const chain = getChainConfig(chainId);
    const contract = getReadOnlyContract(chain.chainId);
    const lockWei = await contract.orderLocks(orderId);
    const lockUsd = formatToken(lockWei, chain);
    return {
      success: true,
      chainId: chain.chainId,
      lockUsd,
      lockWei: lockWei.toString(),
    };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al leer el lock de la orden (chain ${chainId}):`,
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * HERRAMIENTA DE LECTURA: Consulta el estado real de un vendedor en el contrato
 * de UNA red (total depositado y cuánto tiene congelado en garantía).
 */
export async function getVendorCollateral(
  vendorAddress,
  chainId = DEFAULT_CHAIN_ID,
) {
  // Guard robusto: si la wallet está vacía o no es válida, devolvemos un fallo
  // limpio en vez del error críptico de ethers ("unsupported addressable
  // value... value=null"), que no aporta nada útil en el diagnóstico.
  if (!vendorAddress || typeof vendorAddress !== "string") {
    console.error(
      "[Blockchain Error] getVendorCollateral recibió una wallet inválida/null:",
      vendorAddress,
    );
    return {
      success: false,
      error: "La billetera del vendedor no está vinculada (walletAddress vacía).",
    };
  }
  let chain;
  try {
    chain = getChainConfig(chainId);
    const contract = getReadOnlyContract(chain.chainId);
    const data = await contract.vendors(vendorAddress);
    const totalCollateral = formatToken(data.totalCollateral, chain);
    const lockedCollateral = formatToken(data.lockedCollateral, chain);
    return {
      success: true,
      chainId: chain.chainId,
      tokenSymbol: chain.collateralToken.symbol,
      totalCollateral,
      lockedCollateral,
      available: totalCollateral - lockedCollateral,
    };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al leer el colateral del vendedor (chain ${chainId}):`,
      error.reason || error.message,
    );
    return {
      success: false,
      chainId: chain?.chainId ?? chainId,
      error: error.reason || error.message,
    };
  }
}

/**
 * ⭐ DETECCIÓN MULTICHAIN: recorre TODAS las redes configuradas, lee el saldo
 * del vendedor en cada una y devuelve el desglose + agregados.
 *
 * Este es el corazón de "leer su wallet para identificar en qué chain tiene el
 * saldo". El frontend de "Mi Billetera" lo usa para mostrar el desglose por
 * red, y el backend lo usa para auto-seleccionar la red de mayor saldo.
 */
export async function getVendorCollateralMultiChain(vendorAddress) {
  const chains = getConfiguredChains();

  if (!vendorAddress || typeof vendorAddress !== "string") {
        return {
      success: false,
      walletAddress: vendorAddress || "",
      error: "La billetera del vendedor no está vinculada (walletAddress vacía).",
      byChain: {},  // mapa chainId → saldo (vacío por wallet inválida)
      totalAvailable: 0,
      totalLocked: 0,
      totalCollateral: 0,
      bestChain: null,
      bestAvailable: 0,
    };
  }

  // Lectura en paralelo por red (tolerante a fallos: una red caída no debe
  // romper el agregado de las demás).
  const results = await Promise.all(
    chains.map(async (chain) => {
      const res = await getVendorCollateral(vendorAddress, chain.chainId);
      return [chain.chainId, res];
    }),
  );

  const byChain = {};
  let totalAvailable = 0;
  let totalLocked = 0;
  let totalCollateral = 0;
  let bestChain = null;
  let bestAvailable = 0;

  for (const [cid, res] of results) {
    byChain[cid] = res;
    if (!res.success) continue;

    totalAvailable += res.available;
    totalLocked += res.lockedCollateral;
    totalCollateral += res.totalCollateral;

    if (res.available > bestAvailable) {
      bestAvailable = res.available;
      bestChain = cid;
    }
  }

    return {
    success: true,
    walletAddress: vendorAddress,
    byChain,
    totalAvailable,
    totalLocked,
    totalCollateral,
    bestChain,
    bestAvailable,
  };
}

/**
 * HERRAMIENTA DE VERIFICACIÓN: Confirma que una orden quedó realmente liberada
 * on-chain, es decir que su lock fue eliminado del contrato. Úsala SIEMPRE
 * después de firmar un release para NO marcar como liberado algo que sigue
 * congelado en la blockchain.
 */
export async function verifyOrderReleased(orderId, chainId = DEFAULT_CHAIN_ID) {
  const lock = await getOrderLock(orderId, chainId);
  if (!lock.success) {
    return { ...lock, released: false };
  }
  return { success: true, released: lock.lockUsd === 0, lockUsd: lock.lockUsd };
  }

/**
 * DIAGNÓSTICO DE LIQUIDEZ DEL POOL.
 * Cuando un `release` (con o sin fee) revierte con "BEP40: transfer amount
 * exceeds balance", la causa típica es que el contrato pool NO tiene USDT real
 * en su balance para devolver la garantía al vendedor, aunque la contabilidad
 * interna (vendors[].totalCollateral) diga que sí la tiene (por ejemplo porque
 * se marcó colateral sin que los tokens se hubieran depositado realmente, o el
 * depósito entró por otra vía / token distinto).
 *
 * Devuelve el balance REAL de USDT en poder del contrato pool y lo contrasta
 * con el total de garantías que el contrato cree deber (totalCollateral) para
 * la wallet consultada.
 */
export async function getPoolLiquidityDiagnostic(
  vendorAddress,
  chainId = DEFAULT_CHAIN_ID,
) {
  try {
    const chain = getChainConfig(chainId);
    const contract = getReadOnlyContract(chain.chainId);
    // ABC mínimo del token ERC20 (balanceOf) para el stable de la red.
    const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
    const token = new ethers.Contract(
      chain.collateralToken.address,
      erc20Abi,
      getProvider(chain.chainId),
    );
    const poolBalanceWei = await token.balanceOf(chain.contractAddress);
    const poolUsdtBalance = formatToken(poolBalanceWei, chain);

    let vendorTotal = null;
    let vendorLocked = null;
    if (vendorAddress) {
      const data = await contract.vendors(vendorAddress);
      vendorTotal = formatToken(data.totalCollateral, chain);
      vendorLocked = formatToken(data.lockedCollateral, chain);
    }

    return {
      success: true,
      chainId: chain.chainId,
      poolContract: chain.contractAddress,
      usdtAddress: chain.collateralToken.address,
      tokenSymbol: chain.collateralToken.symbol,
      poolUsdtBalanceWei: poolBalanceWei.toString(),
      poolUsdtBalance,
      vendorTotalCollateral: vendorTotal,
      vendorLockedCollateral: vendorLocked,
      poolSuficienteParaDevolverVendor:
        vendorTotal !== null ? poolUsdtBalance >= vendorTotal : null,
    };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al diagnosticar liquidez del pool (chain ${chainId}):`,
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 1: BLOQUEAR COLATERAL (Se ejecuta al crearse la orden P2P)
 * en la red indicada (default: DEFAULT_CHAIN_ID).
 */
export async function lockVendorCollateral(
  orderId,
  vendorAddress,
  amountInTokens,
  chainId = DEFAULT_CHAIN_ID,
) {
  try {
    const chain = getChainConfig(chainId);
    console.log(
      `[Blockchain] Bloqueo de ${amountInTokens} ${chain.collateralToken.symbol} ` +
        `(chain ${chain.chainId}) para Orden: ${orderId}...`,
    );

    // Redondeamos a 6 decimales para evitar notación científica de JS.
    const amountInWei = parseToken(Number(amountInTokens).toFixed(6), chain);
    const contract = getPoolContract(chain.chainId);
    const tx = await contract.lockOrderCollateral(orderId, vendorAddress, amountInWei);
    console.log(`[Blockchain] Tx de bloqueo enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Bloqueo confirmado en bloque: ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash, chainId: chain.chainId };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al bloquear colateral (chain ${chainId}):`,
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 2: LIBERAR COLATERAL Y COBRAR FEE (Flujo exitoso: comprador confirma o pasan 7 días)
 *
 * @param {string} orderId      ID de la orden.
 * @param {string} vendorAddress Wallet del vendedor.
 * @param {number} feeAmountUsd  COMISIÓN TOTAL a retener (en USD), ya calculada
 *   en el backend = baseFee (3%) + reward de referidos. Se descuenta del
 *   colateral congelado en un SOLO saque: el contrato libera al vendedor
 *   (lock - fee) y envía el fee a la main wallet de la plataforma. Desde ahí
 *   se paga luego el reward a referidos. NO se recalcula acá para que coincida
 *   exactamente con lo que la orden registró en `financials.platformFeeUsd`.
 */
export async function releaseVendorCollateral(
  orderId,
  vendorAddress,
  feeAmountUsd,
  chainId = DEFAULT_CHAIN_ID,
) {
  try {
    const chain = getChainConfig(chainId);
    console.log(
      `[Blockchain] Liberación de la Orden: ${orderId} (chain ${chain.chainId})...`,
    );
    console.log("fee total a cobrar (USD):", feeAmountUsd);
    // Redondeamos a 6 decimales para evitar notación científica de JS en
    // números muy chicos y mantener precisión estable con parseUnits.
    const safeFeeUsd = Math.max(0, Number(feeAmountUsd) || 0);
    const feeAmountInWei = parseToken(safeFeeUsd.toFixed(6), chain);
    const contract = getPoolContract(chain.chainId);
    const tx = await contract.releaseOrderCollateral(
      orderId,
      vendorAddress,
      chain.collateralToken.address,
      feeAmountInWei,
    );
    console.log(`[Blockchain] Tx de liberación enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Liberación confirmada en bloque: ${receipt.blockNumber}`);

    // ⚠️ NO confiamos solo en que la tx se minó: verificamos que el lock se
    // eliminó realmente en el contrato. Si sigue congelado, es un falso positivo.
    const verification = await verifyOrderReleased(orderId, chain.chainId);
    if (!verification.released) {
      console.warn(
        `[Blockchain] ⚠️ La tx ${tx.hash} se minó pero la orden ${orderId} SIGUE con ` +
          `saldo bloqueado (${verification.lockUsd} ${chain.collateralToken.symbol}).`,
      );
      return {
        success: false,
        txHash: tx.hash,
        chainId: chain.chainId,
        error:
          "La transacción se minó pero el colateral sigue congelado en el contrato. No se registra la liberación; se requiere intervención manual y verificación del lock on-chain.",
        verifiedReleased: false,
      };
    }

    return { success: true, txHash: tx.hash, chainId: chain.chainId, verifiedReleased: true };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al liberar colateral (chain ${chainId}):`,
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 4: ABRIR DISPUTA (Solo admin / solo si el COMPRADOR reporta un problema).
 * Congela la liberación del colateral on-chain: la orden entra en disputa y el
 * contrato queda reteniendo el saldo hasta que el admin la resuelva.
 */
export async function triggerOrderDispute(orderId, chainId = DEFAULT_CHAIN_ID) {
  try {
    const chain = getChainConfig(chainId);
    console.log(
      `[Blockchain] Apertura de disputa para Orden: ${orderId} (chain ${chain.chainId})...`,
    );
    const contract = getPoolContract(chain.chainId);
    const tx = await contract.triggerDispute(orderId);
    console.log(`[Blockchain] Tx de disputa enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Blockchain] Disputa registrada en bloque: ${receipt.blockNumber}`);
    return { success: true, txHash: tx.hash, chainId: chain.chainId };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al abrir disputa (chain ${chainId}):`,
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 3: CANCELAR/DESTRABAR COLATERAL SIN COMISIÓN (Para órdenes expiradas o canceladas)
 */
export async function cancelVendorCollateral(
  orderId,
  vendorAddress,
  chainId = DEFAULT_CHAIN_ID,
) {
  try {
    const chain = getChainConfig(chainId);
    console.log(
      `[Blockchain] Desanclaje de colateral (0% fee) para Orden: ${orderId} (chain ${chain.chainId})...`,
    );

    // releaseOrderCollateral con fee 0 = desbloqueo sin cobro.
    const contract = getPoolContract(chain.chainId);
    const tx = await contract.releaseOrderCollateral(
      orderId,
      vendorAddress,
      chain.collateralToken.address,
      0,
    );
    console.log(`[Blockchain] Tx de cancelación enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Colateral liberado (0% fee) en bloque: ${receipt.blockNumber}`);

    // ⚠️ Verificación real on-chain (ver comentario en releaseVendorCollateral).
    const verification = await verifyOrderReleased(orderId, chain.chainId);
    if (!verification.released) {
      console.warn(
        `[Blockchain] ⚠️ La tx ${tx.hash} se minó pero la orden ${orderId} SIGUE con saldo bloqueado.`,
      );
      return {
        success: false,
        txHash: tx.hash,
        chainId: chain.chainId,
        error:
          "La transacción se minó pero el colateral sigue congelado en el contrato. Se requiere intervención manual y verificación del lock on-chain.",
        verifiedReleased: false,
      };
    }

    return { success: true, txHash: tx.hash, chainId: chain.chainId, verifiedReleased: true };
  } catch (error) {
    console.error(
      `[Blockchain Error] Fallo al cancelar colateral de orden expirada (chain ${chainId}):`,
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS auxiliares (para otros servicios/rutas que necesiten las primitivas)
// ════════════════════════════════════════════════════════════════════════════
export { getProvider, getPoolContract, getAdminWallet, CHAINS };
export default {
  getOrderLock,
  getVendorCollateral,
  getVendorCollateralMultiChain,
  verifyOrderReleased,
  getPoolLiquidityDiagnostic,
  lockVendorCollateral,
  releaseVendorCollateral,
  triggerOrderDispute,
  cancelVendorCollateral,
};
