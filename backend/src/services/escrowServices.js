// backend/src/services/escrowServices.js
//
// SERVICIO DE ESCROW PARA PAGOS EN CRIPTOMONEDAS (multichain)
//
// Interactúa con el contrato NeroEscrow desplegado en varias redes:
//   - Polygon Amoy (default)  → fondeo NATIVO (POL)
//   - Base Sepolia            → fondeo NATIVO (ETH)
//   - BSC Testnet (legacy)    → fondeo por TOKEN (USDT ERC20, 18 dec)
//
// El BACKEND (wallet admin) es la ÚNICA entidad que puede:
//   - releaseOrder()  -> liberar los fondos al vendedor (cobra el fee global)
//   - cancelOrder()   -> devolver el 100% al comprador (reembolso)
//
// El COMPRADOR fondea el escrow desde el FRONT (fundOrder / fundOrderNative),
// por lo que acá solo verificamos que el funding se hizo on-chain correctamente.
//
// ⚠️ UNIDAD COMÚN (lección aprendida con los decimales):
//   El contrato guarda `amount` en la unidad de MENOR precisión entre el token y
//   la moneda nativa para poder hacer la aritmética sin conversiones. NO se
//   puede asumir `18` al formatear. Por eso usamos `formatEscrowAmount` /
//   `parseEscrowAmount` con la unidad común de la red.
//
// IMPORTANTE (lección aprendida con el colateral): NUNCA confiar solo en que una
// tx "se minó sin revertir". Siempre verificar el estado on-chain real
// del contrato (isFunded / isClosed) antes de liberar o marcar liberado.

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  getEscrowChainConfig,
  ESCROW_DEFAULT_CHAIN_ID,
} from "../config/chains.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, "../../contracts/NeroEscrowABI.json");
const contractABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

const PRIVATE_KEY = process.env.WALLET_PK || process.env.PRIVATE_KEY; // wallet Admin
// La comisión global (puntos base) que cobra el contrato. Debe coincidir con
// el fee que calculamos en el backend (financials.platformFeeUsd). Por default 3%.
const ESCROW_FEE_BPS = Number(process.env.ESCROW_FEE_BPS || 300);

// ── INFRA POR RED (provider, wallet admin, contrato) — cacheados ──
const runtimeCache = new Map(); // chainId → { provider, adminWallet, contract, config }

function getRuntime(chainId = ESCROW_DEFAULT_CHAIN_ID) {
  const config = getEscrowChainConfig(chainId);
  const key = config.chainId;
  const cached = runtimeCache.get(key);
  if (cached) return cached;

  if (!config.contractAddress) {
    throw new Error(
      `El contrato de escrow no está configurado para la red ${config.key} (chainId ${key}). Revisá el .env.`,
    );
  }
  if (!PRIVATE_KEY) {
    throw new Error("WALLET_PK no configurada en el backend (wallet admin del escrow).");
  }

  const provider = new ethers.JsonRpcProvider(config.chain.rpc);
  const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(
    config.contractAddress,
    contractABI,
    adminWallet,
  );
  const runtime = { provider, adminWallet, contract, config };
  runtimeCache.set(key, runtime);
  return runtime;
}

/** Expone la config pública del escrow de una red (sin secretos). */
export function getEscrowInfo(chainId = ESCROW_DEFAULT_CHAIN_ID) {
  const c = getEscrowChainConfig(chainId);
  return {
    chainId: c.chainId,
    key: c.key,
    contractAddress: c.contractAddress,
    tokenAddress: c.tokenAddress,
    tokenSymbol: c.tokenSymbol,
    tokenDecimals: c.tokenDecimals,
    fundingMode: c.fundingMode,
    nativeSymbol: c.nativeSymbol,
    nativeDecimals: c.nativeDecimals,
    chain: {
      rpc: c.chain?.rpc,
      explorerUrl: c.chain?.explorerUrl,
      name: c.chain?.name,
    },
  };
}

/**
 * Decimales de la UNIDAD COMÚN del escrow en una red: el MENOR entre los
 * decimales del token y los del nativo (el contrato descarta el sobrante).
 */
function getCommonDecimals(config) {
  const tokenDecimals =
    config.fundingMode === "native" ? config.nativeDecimals : config.tokenDecimals;
  return Math.min(Number(tokenDecimals) || 18, Number(config.nativeDecimals) || 18);
}

/**
 * Convierte las unidades on-chain del contrato a un string humano, usando la
 * unidad común de la red (⚠️ NO asumir 18 decimales).
 */
export function formatEscrowAmount(amountUnits, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  const config = getEscrowChainConfig(chainId);
  return ethers.formatUnits(amountUnits, getCommonDecimals(config));
}

/**
 * Convierte un monto humano al valor entero (BigInt) que espera el contrato.
 */
export function parseEscrowAmount(amountHuman, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  const config = getEscrowChainConfig(chainId);
  return ethers.parseUnits(String(amountHuman), getCommonDecimals(config));
}

/**
 * HERRAMIENTA DE LECTURA: fee global actual del contrato (bps) de una red.
 */
export async function getFeeBps(chainId = ESCROW_DEFAULT_CHAIN_ID) {
  try {
    const { contract } = getRuntime(chainId);
    const feeBps = await contract.feeBps();
    return { success: true, feeBps: Number(feeBps) };
  } catch (error) {
    console.error(
      "[Escrow Error] Fallo al leer feeBps del contrato:",
      error.reason || error.message,
    );
    // Ante un error de lectura, usamos el fee configurado por env como fallback.
    return { success: false, feeBps: ESCROW_FEE_BPS, error: error.reason || error.message };
  }
}

/**
 * HERRAMIENTA DE LECTURA: escrow on-chain de una orden en una red.
 */
export async function getEscrow(orderId, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  try {
    const { contract, config } = getRuntime(chainId);
    const data = await contract.escrows(orderId);
    // Detectamos cómo se fondeó:
    //   token on-chain = address(0)  → NATIVO
    //   token on-chain = dirección   → ERC20
    const isNative = data.token === ethers.ZeroAddress;
    return {
      success: true,
      buyer: data.buyer,
      seller: data.seller,
      token: data.token,
      isNative,
      chainId: config.chainId,
      amountUnits: data.amount,
      amount: formatEscrowAmount(data.amount, config.chainId),
      deposited: data.deposited,
      released: data.released,
      createdAt: Number(data.createdAt),
    };
  } catch (error) {
    console.error(
      "[Escrow Error] Fallo al leer escrow de la orden:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * Verifica on-chain que una orden quedó realmente fondeada.
 * `expectedAmountUsd` se compara con el monto CONVERTIDO a unidad común.
 */
export async function verifyOrderFunded(
  orderId,
  expectedAmountUsd,
  chainId = ESCROW_DEFAULT_CHAIN_ID,
) {
    const escrow = await getEscrow(orderId, chainId);
  if (!escrow.success) {
    return { ...escrow, funded: false };
  }

  // ⛔ C4: LOS FONDOS NATIVOS NO SE ACEPTAN COMO PAGO VÁLIDO.
  //
  // `NeroEscrow.fundOrderNative` está ROTA y es pública:
  //   1) guarda `_amount` sin compararlo con `msg.value` (se fondea con 1 wei
  //      declarando el monto completo), y
  //   2) `settle` en modo nativo reparte `address(this).balance` — TODO el saldo
  //      nativo del contrato, no el de esa orden, así que quien cancele se
  //      lleva lo de las demás.
  // Ninguna parte de la app usa esta vía (el modal la bloquea y su ABI ni la
  // declara), pero cualquiera puede llamarla directo al contrato. Acá la
  // tratamos como NO fondeada: la orden no avanza, no se marca pagada, no se
  // libera colateral. Se cierra la puerta sin esperar al redeploy que la quite.
  if (escrow.isNative) {
    return {
      ...escrow,
      funded: false,
      nativeRejected: true,
      error: "El escrow fue fondeado con la moneda nativa, que no está soportada.",
    };
  }

  const funded = escrow.deposited === true && !escrow.released;

  // Tolerancia: el monto del contrato puede venir TRUNCADO por la unidad común
  // (p. ej. 6 dec), por eso comparamos con margen de 1.1 centavos para NO dar
  // falsos negativos.
  let amountMatches = true;
  let expectedAmount = null;
  if (expectedAmountUsd !== undefined && expectedAmountUsd !== null) {
    expectedAmount = Number(
      formatEscrowAmount(parseEscrowAmount(expectedAmountUsd, chainId), chainId),
    );
    const actual = Number(escrow.amount);
    amountMatches = Math.abs(actual - expectedAmount) < 0.011;
  }

  return {
    success: true,
    funded,
    amountMatches,
    expectedAmount,
    escrow,
  };
}

/**
 * Verifica on-chain que una orden ya fue cerrada (liberada o reembolsada).
 */
export async function verifyOrderClosed(orderId, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  const escrow = await getEscrow(orderId, chainId);
  if (!escrow.success) {
    return { ...escrow, closed: false };
  }
  return { success: true, closed: escrow.released, escrow };
}

/**
 * ACCIÓN ADMIN: LIBERAR AL VENDEDOR (cobra el fee global).
 * Se llama cuando el comprador confirmó la recepción (o resolución de disputa).
 */
export async function releaseOrderEscrow(orderId, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  try {
    const { contract } = getRuntime(chainId);
    console.log(`[Escrow] Solicitando liberación de la Orden: ${orderId} (chain ${chainId})...`);

    // Verificación previa: la orden debe estar fondeada y aún no cerrada.
    const escrow = await getEscrow(orderId, chainId);
    if (!escrow.success) {
      return { success: false, error: escrow.error };
    }
    if (!escrow.deposited) {
      return { success: false, error: "La orden no está fondeada en el contrato." };
    }
    if (escrow.released) {
      return {
        success: true,
        alreadyReleased: true,
        message: "La orden ya estaba liberada on-chain.",
      };
    }

    const tx = await contract.releaseOrder(orderId);
    console.log(`[Escrow] Tx de liberación enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Escrow] Liberación confirmada en bloque: ${receipt.blockNumber}`);

    // ⚠️ Verificación REAL on-chain (no confiar solo en que se minó).
    const verification = await verifyOrderClosed(orderId, chainId);
    if (!verification.success || !verification.closed) {
      console.warn(
        `[Escrow] ⚠️ La tx ${tx.hash} se minó pero la orden ${orderId} SIGUE abierta on-chain.`,
      );
      return {
        success: false,
        txHash: tx.hash,
        error:
          "La transacción se minó pero el escrow sigue abierto on-chain. No se registra la liberación; se requiere intervención manual.",
        verifiedReleased: false,
      };
    }

    return { success: true, txHash: tx.hash, verifiedReleased: true };
  } catch (error) {
    console.error("[Escrow Error] Fallo al liberar escrow:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: CANCELAR Y REEMBOLSAR AL COMPRADOR (100%).
 */
export async function cancelOrderEscrow(orderId, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  try {
    const { contract, provider } = getRuntime(chainId);
    console.log(`[Escrow] Solicitando cancelación/reembolso de la Orden: ${orderId} (chain ${chainId})...`);

    const escrow = await getEscrow(orderId, chainId);
    if (!escrow.success) {
      return { success: false, error: escrow.error };
    }
    if (!escrow.deposited) {
      return { success: false, error: "La orden no está fondeada en el contrato." };
    }
    if (escrow.released) {
      return {
        success: true,
        alreadyCancelled: true,
        message: "La orden ya estaba cerrada on-chain.",
      };
    }

    // ⚠️ MODELO NATIVO: el value transferido por el comprador queda en el
    // contrato y el GAS que pagó se descuenta de ese balance. Al reembolsar,
    // `cancelOrder` devuelve TODO el balance nativo. Si el balance ya no cubre
    // el 100% del monto fondeado (el gas lo comió), NO llamamos al contrato
    // (revertiría con "Fallo reembolso nativo").
    if (escrow.isNative) {
      const contractAddress = getEscrowChainConfig(chainId).contractAddress;
      const balance = await provider.getBalance(contractAddress);
      const fundedNative = parseEscrowAmount(escrow.amount, chainId);
      if (balance < fundedNative) {
        console.warn(
          `[Escrow] ⚠️ Balance nativo del contrato (${ethers.formatEther(balance)}) < monto fondeado (${ethers.formatEther(fundedNative)}). El gas consumió parte del depósito → requerimiento manual.`,
        );
        return {
          success: false,
          needsManualIntervention: true,
          error:
            "El depósito nativo ya no cubre el 100% del monto fondeado (el gas consumió parte). Se requiere intervención manual para reembolsar al comprador.",
        };
      }
    }

    const tx = await contract.cancelOrder(orderId);
    console.log(`[Escrow] Tx de cancelación enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Escrow] Cancelación confirmada en bloque: ${receipt.blockNumber}`);

    const verification = await verifyOrderClosed(orderId, chainId);
    if (!verification.success || !verification.closed) {
      console.warn(
        `[Escrow] ⚠️ La tx ${tx.hash} se minó pero la orden ${orderId} SIGUE abierta on-chain.`,
      );
      return {
        success: false,
        txHash: tx.hash,
        error:
          "La transacción se minó pero el escrow sigue abierto on-chain. No se registra la cancelación; se requiere intervención manual.",
        verifiedCancelled: false,
      };
    }

    return { success: true, txHash: tx.hash, verifiedCancelled: true };
  } catch (error) {
    console.error("[Escrow Error] Fallo al cancelar escrow:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: SETTLE FLEXIBLE del escrow (poder absoluto del admin).
 *
 * Cierra la orden repartiendo el monto retenido entre vendedor, feeWallet y
 * comprador (refund) según montos explícitos. Regla de integridad on-chain:
 *   sellerAmount + feeAmount + refundAmount === amount (en unidades comunes).
 *
 * Los montos se reciben en UNIDADES HUMANAS (USD-equivalentes) y se convierten
 * a la unidad común de la red con parseEscrowAmount(). El refund SIEMPRE va al
 * buyer y el fee SIEMPRE a la feeWallet (el contrato lo garantiza).
 */
export async function settleOrderEscrow(
  orderId,
  { sellerAmount, feeAmount, refundAmount },
  chainId = ESCROW_DEFAULT_CHAIN_ID,
) {
  try {
    const { contract } = getRuntime(chainId);
    console.log(
      "[Escrow] Solicitando SETTLE de la Orden: " + orderId + " (chain " + chainId + ") " +
        "seller=" + sellerAmount + " fee=" + feeAmount + " refund=" + refundAmount + "...",
    );

    const escrow = await getEscrow(orderId, chainId);
    if (!escrow.success) {
      return { success: false, error: escrow.error };
    }
    if (!escrow.deposited) {
      return { success: false, error: "La orden no está fondeada en el contrato." };
    }
    if (escrow.released) {
      return {
        success: true,
        alreadySettled: true,
        message: "La orden ya estaba cerrada on-chain.",
      };
    }

    const sellerUnits = parseEscrowAmount(sellerAmount, chainId);
    const feeUnits = parseEscrowAmount(feeAmount, chainId);
    const refundUnits = parseEscrowAmount(refundAmount, chainId);
    const totalUnits = sellerUnits + feeUnits + refundUnits;

    if (totalUnits !== escrow.amountUnits) {
      const cfg = getEscrowChainConfig(chainId);
      return {
        success: false,
        error:
          "La suma (seller+fee+refund=" + ethers.formatUnits(totalUnits, getCommonDecimals(cfg)) + ") " +
          "no coincide con el monto retenido on-chain (" + escrow.amount + ").",
      };
    }

    const tx = await contract.settle(orderId, sellerUnits, feeUnits, refundUnits);
    console.log("[Escrow] Tx de settle enviada: " + tx.hash);
    const receipt = await tx.wait();
    console.log("[Escrow] Settle confirmado en bloque: " + receipt.blockNumber);

    const verification = await verifyOrderClosed(orderId, chainId);
    if (!verification.success || !verification.closed) {
      console.warn(
        "[Escrow] La tx " + tx.hash + " se minó pero la orden " + orderId + " SIGUE abierta on-chain.",
      );
      return {
        success: false,
        txHash: tx.hash,
        error:
          "La transacción se minó pero el escrow sigue abierto on-chain. No se registra el settle; se requiere intervención manual.",
        verifiedSettled: false,
      };
    }

    return { success: true, txHash: tx.hash, verifiedSettled: true };
  } catch (error) {
    console.error("[Escrow Error] Fallo al hacer settle del escrow:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: ACTUALIZAR EL FEE GLOBAL DEL CONTRATO (puntos base) en una red.
 */
export async function setEscrowFeeBps(newFeeBps, chainId = ESCROW_DEFAULT_CHAIN_ID) {
  try {
    const { contract } = getRuntime(chainId);
    console.log(`[Escrow] Solicitando actualización de fee a ${newFeeBps} bps (chain ${chainId})...`);

    const tx = await contract.setFeeBps(newFeeBps);
    console.log(`[Escrow] Tx de actualización de fee enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Escrow] Fee actualizado en bloque: ${receipt.blockNumber}`);

    // Verificación real on-chain.
    const readBack = await getFeeBps(chainId);
    if (!readBack.success || readBack.feeBps !== Number(newFeeBps)) {
      console.warn(
        `[Escrow] ⚠️ La tx ${tx.hash} se minó pero el fee sigue en ${readBack.feeBps} bps.`,
      );
      return {
        success: false,
        txHash: tx.hash,
        currentFeeBps: readBack.feeBps,
        error:
          "La transacción se minó pero el fee on-chain no cambió. Se requiere intervención manual.",
      };
    }

    return { success: true, txHash: tx.hash, feeBps: Number(newFeeBps) };
  } catch (error) {
    console.error("[Escrow Error] Fallo al actualizar fee:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * HERRAMIENTA DE LECTURA: feeWallet y admin actuales del contrato de una red.
 */
export async function getEscrowConfig(chainId = ESCROW_DEFAULT_CHAIN_ID) {
  try {
    const { contract } = getRuntime(chainId);
    const [feeBps, feeWallet, adminAddress] = await Promise.all([
      contract.feeBps(),
      contract.feeWallet(),
      contract.admin(),
    ]);
    return {
      success: true,
      feeBps: Number(feeBps),
      feeWallet,
      admin: adminAddress,
      chainId,
    };
  } catch (error) {
    console.error(
      "[Escrow Error] Fallo al leer config del contrato:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: ACTUALIZAR LA FEEWALLET DEL CONTRATO de una red.
 */
export async function setEscrowFeeWallet(
  newFeeWallet,
  chainId = ESCROW_DEFAULT_CHAIN_ID,
) {
  try {
    if (!ethers.isAddress(newFeeWallet)) {
      return { success: false, error: "Dirección de wallet inválida." };
    }
    const { contract } = getRuntime(chainId);
    console.log(`[Escrow] Solicitando actualizar feeWallet a ${newFeeWallet} (chain ${chainId})...`);

    const tx = await contract.setFeeWallet(newFeeWallet);
    console.log(`[Escrow] Tx de actualización de feeWallet enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Escrow] feeWallet actualizada en bloque: ${receipt.blockNumber}`);

    // Verificación real on-chain.
    const readBack = await getEscrowConfig(chainId);
    const normalizedExpected = ethers.getAddress(newFeeWallet);
    const normalizedActual = readBack.success
      ? ethers.getAddress(readBack.feeWallet)
      : "";
    if (!readBack.success || normalizedActual !== normalizedExpected) {
      console.warn(
        `[Escrow] ⚠️ La tx ${tx.hash} se minó pero feeWallet sigue en ${readBack.feeWallet}.`,
      );
      return {
        success: false,
        txHash: tx.hash,
        currentFeeWallet: readBack.feeWallet,
        error:
          "La transacción se minó pero la feeWallet on-chain no cambió. Se requiere intervención manual.",
      };
    }

    return { success: true, txHash: tx.hash, feeWallet: normalizedActual };
  } catch (error) {
    console.error(
      "[Escrow Error] Fallo al actualizar feeWallet:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

export { ESCROW_FEE_BPS };
