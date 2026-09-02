// backend/src/services/blockchainService.js
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, "../../contracts/NeroCollateralABI.json");
const contractABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

// CONFIGURACIÓN DEL ENTORNO
const PROVIDER_URL = "https://bsc-testnet-rpc.publicnode.com"; 
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Dirección del Pool
const PRIVATE_KEY = process.env.WALLET_PK; // Clave privada de la wallet Admin
const USDT_TESTNET_ADDRESS = process.env.USDT_TESTNET_ADDRESS;

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
// console.log("provider", provider)
const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
// console.log("adminWallet", adminWallet)
const poolContract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, adminWallet);
// console.log("poolContract", poolContract)

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
export async function getOrderLock(orderId) {
  try {
    const lockWei = await poolContract.orderLocks(orderId);
    const lockUsd = parseFloat(ethers.formatUnits(lockWei, 18));
    return { success: true, lockUsd, lockWei: lockWei.toString() };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al leer el lock de la orden:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * HERRAMIENTA DE LECTURA: Consulta el estado real de un vendedor en el contrato
 * (total depositado y cuánto tiene congelado en garantía).
 */
export async function getVendorCollateral(vendorAddress) {
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
  try {
    const data = await poolContract.vendors(vendorAddress);
    const totalCollateral = parseFloat(ethers.formatUnits(data.totalCollateral, 18));
    const lockedCollateral = parseFloat(ethers.formatUnits(data.lockedCollateral, 18));
    return {
      success: true,
      totalCollateral,
      lockedCollateral,
      available: totalCollateral - lockedCollateral,
    };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al leer el colateral del vendedor:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * HERRAMIENTA DE VERIFICACIÓN: Confirma que una orden quedó realmente liberada
 * on-chain, es decir que su lock fue eliminado del contrato. Úsala SIEMPRE
 * después de firmar un release para NO marcar como liberado algo que sigue
 * congelado en la blockchain.
 */
export async function verifyOrderReleased(orderId) {
  const lock = await getOrderLock(orderId);
  if (!lock.success) {
    return { ...lock, released: false };
  }
  return { success: true, released: lock.lockUsd === 0, lockUsd: lock.lockUsd };
}

/**
 * ACCIÓN 1: BLOQUEAR COLATERAL (Se ejecuta al crearse la orden P2P)
 */
export async function lockVendorCollateral(orderId, vendorAddress, amountInTokens) {
  try {
    console.log(`[Blockchain] Solicitando bloqueo de ${amountInTokens} USDT para Orden: ${orderId}...`);

    // Convertimos a Wei (18 decimales para este USDT de testnet)
    const amountInWei = ethers.parseUnits(amountInTokens.toString(), 18);

    // Llamada al método lockOrderCollateral del contrato
    const tx = await poolContract.lockOrderCollateral(orderId, vendorAddress, amountInWei);
    console.log(`[Blockchain] Tx de bloqueo enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Bloqueo confirmado en bloque: ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al bloquear colateral:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 2: LIBERAR COLATERAL Y COBRAR FEE (Flujo exitoso: comprador confirma o pasan 7 días)
 */
export async function releaseVendorCollateral(orderId, vendorAddress, montoOrden) {
  try {
    console.log(`[Blockchain] Solicitando liberación de la Orden: ${orderId}...`);
    console.log("monto orden:", montoOrden);
    // Llamada al método releaseOrderCollateral del contrato
    const feeAmountInWei = ethers.parseUnits((montoOrden * 0.03).toString(), 18);
    const tx = await poolContract.releaseOrderCollateral(orderId, vendorAddress, USDT_TESTNET_ADDRESS, feeAmountInWei);
    console.log(`[Blockchain] Tx de liberación enviada: ${tx.hash}`);

        const receipt = await tx.wait();
    console.log(`[Blockchain] Liberación confirmada en bloque: ${receipt.blockNumber}`);

    // ⚠️ NO confiamos solo en que la tx se minó: verificamos que el lock se
    // eliminó realmente en el contrato. Si sigue congelado, es un falso positivo.
    const verification = await verifyOrderReleased(orderId);
    if (!verification.released) {
      console.warn(
        `[Blockchain] ⚠️ La tx ${tx.hash} se minó pero la orden ${orderId} SIGUE con saldo bloqueado (${verification.lockUsd} USDT).`,
      );
      return {
        success: false,
        txHash: tx.hash,
        error:
          "La transacción se minó pero el colateral sigue congelado en el contrato. No se registra la liberación; se requiere intervención manual y verificación del lock on-chain.",
        verifiedReleased: false,
      };
    }

    return { success: true, txHash: tx.hash, verifiedReleased: true };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al liberar colateral:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 4: ABRIR DISPUTA (Solo admin / solo si el COMPRADOR reporta un problema).
 * Congela la liberación del colateral on-chain: la orden entra en disputa y el
 * contrato queda reteniendo el saldo hasta que el admin la resuelva.
 */
export async function triggerOrderDispute(orderId) {
  try {
    console.log(`[Blockchain] Solicitando apertura de disputa para Orden: ${orderId}...`);
    const tx = await poolContract.triggerDispute(orderId);
    console.log(`[Blockchain] Tx de disputa enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Blockchain] Disputa registrada en bloque: ${receipt.blockNumber}`);
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al abrir disputa:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 3: CANCELAR/DESTRABAR COLATERAL SIN COMISIÓN (Para órdenes expiradas o canceladas)
 */
export async function cancelVendorCollateral(orderId, vendorAddress) {
  try {
    console.log(`[Blockchain] Solicitando desanclaje de colateral (0% fee) para Orden Expirada: ${orderId}...`);

    // Llamada al método de cancelación de tu contrato (ej: unfreezeOrderCollateral o cancelOrderCollateral)
    // Asegurate de poner el nombre exacto de la función de tu contrato que libera sin cobrar fee
    const tx = await poolContract.releaseOrderCollateral(orderId, vendorAddress, USDT_TESTNET_ADDRESS, 0);
    console.log(`[Blockchain] Tx de cancelación enviada: ${tx.hash}`);

        const receipt = await tx.wait();
    console.log(`[Blockchain] Colateral liberado (0% fee) en bloque: ${receipt.blockNumber}`);

    // ⚠️ Verificación real on-chain (ver comentario en releaseVendorCollateral).
    const verification = await verifyOrderReleased(orderId);
    if (!verification.released) {
      console.warn(
        `[Blockchain] ⚠️ La tx ${tx.hash} se minó pero la orden ${orderId} SIGUE con saldo bloqueado (${verification.lockUsd} USDT).`,
      );
      return {
        success: false,
        txHash: tx.hash,
        error:
          "La transacción se minó pero el colateral sigue congelado en el contrato. Se requiere intervención manual y verificación del lock on-chain.",
        verifiedReleased: false,
      };
    }

    return { success: true, txHash: tx.hash, verifiedReleased: true };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al cancelar colateral de orden expirada:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}
