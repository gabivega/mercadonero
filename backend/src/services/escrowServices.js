// backend/src/services/escrowServices.js
//
// SERVICIO DE ESCROW PARA PAGOS EN CRIPTOMONEDAS (USDT/USDC/DAI)
//
// Interactúa con el contrato NeroEscrow (BSC Testnet).
//
// El BACKEND (wallet admin) es la ÚNICA entidad que puede:
//   - releaseOrder()  -> liberar los fondos al vendedor (cobra el fee global)
//   - cancelOrder()   -> devolver el 100% al comprador (reembolso)
//
// El COMPRADOR fondea el escrow desde el FRONT (fundOrder), por lo que acá
// solo registramos/verificamos que el funding se hizo on-chain correctamente
// (no firmamos el fund: lo firma el comprador con su wallet de Privy).
//
// IMPORTANTE (lección aprendida con el colateral): NUNCA confiar solo en que
// una tx "se minó sin revertir". Siempre verificar el estado on-chain real
// del contrato (isFunded / isClosed) antes de liberar o marcar liberado.

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, "../../contracts/NeroEscrowABI.json");
const contractABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

// ── CONFIGURACIÓN DEL ENTORNO ──
const PROVIDER_URL =
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.WALLET_PK; // Clave privada de la wallet Admin
// La comisión global (puntos base) que cobra el contrato. Debe coincidir con
// el fee que calculamos en el backend (financials.platformFeeUsd). Por default 3%.
const ESCROW_FEE_BPS = Number(process.env.ESCROW_FEE_BPS || 300);

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
const escrowContract = new ethers.Contract(
  ESCROW_CONTRACT_ADDRESS,
  contractABI,
  adminWallet,
);

/**
 * HERRAMIENTA DE LECTURA: Devuelve el fee global actual del contrato (bps).
 * Útil para que el backend calcule la comisión correcta al crear una orden.
 */
export async function getFeeBps() {
  try {
    const feeBps = await escrowContract.feeBps();
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
 * HERRAMIENTA DE LECTURA: Devuelve el escrow on-chain de una orden.
 * Retorna los campos del struct o null si la lectura falló / no existe.
 */
export async function getEscrow(orderId) {
  try {
    const data = await escrowContract.escrows(orderId);
    return {
      success: true,
      buyer: data.buyer,
      seller: data.seller,
      token: data.token,
      amount: ethers.formatUnits(data.amount, 18),
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
 * Verifica on-chain que una orden quedó realmente fondeada por el comprador.
 * Devuelve { success, funded, escrow }.
 */
export async function verifyOrderFunded(orderId, expectedAmountUsd) {
  const escrow = await getEscrow(orderId);
  if (!escrow.success) {
    return { ...escrow, funded: false };
  }
  const funded = escrow.deposited === true && !escrow.released;

  // Opcional: validar que el monto retenido coincida con lo esperado.
  const amountMatches =
    expectedAmountUsd === undefined ||
    Math.abs(parseFloat(escrow.amount) - parseFloat(expectedAmountUsd)) < 0.01;

  return {
    success: true,
    funded,
    amountMatches,
    escrow,
  };
}

/**
 * Verifica on-chain que una orden ya fue cerrada (liberada o reembolsada).
 * Es el equivalente de "verifyOrderReleased" pero para el escrow.
 */
export async function verifyOrderClosed(orderId) {
  const escrow = await getEscrow(orderId);
  if (!escrow.success) {
    return { ...escrow, closed: false };
  }
  return { success: true, closed: escrow.released, escrow };
}

/**
 * ACCIÓN ADMIN: COBRAR / LIBERAR AL VENDEDOR.
 * Se llama cuando el comprador confirmó la recepción (o en el futuro, un
 * trigger automático). El contrato calcula el fee a partir de feeBps.
 */
export async function releaseOrderEscrow(orderId) {
  try {
    console.log(`[Escrow] Solicitando liberación de la Orden: ${orderId}...`);

    // Verificación previa: la orden debe estar fondeada y aún no cerrada.
    const escrow = await getEscrow(orderId);
    if (!escrow.success) {
      return { success: false, error: escrow.error };
    }
    if (!escrow.deposited) {
      return { success: false, error: "La orden no está fondeada en el contrato." };
    }
    if (escrow.released) {
      // Idempotencia: ya fue cerrada.
      return {
        success: true,
        alreadyReleased: true,
        message: "La orden ya estaba liberada on-chain.",
      };
    }

    const tx = await escrowContract.releaseOrder(orderId);
    console.log(`[Escrow] Tx de liberación enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Escrow] Liberación confirmada en bloque: ${receipt.blockNumber}`);

    // ⚠️ Verificación REAL on-chain (no confiar solo en que se minó).
    const verification = await verifyOrderClosed(orderId);
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
 * Se llama cuando la orden se cancela (vendedor, comprador o admin).
 * El contrato devuelve el monto completo al comprador.
 */
export async function cancelOrderEscrow(orderId) {
  try {
    console.log(`[Escrow] Solicitando cancelación/reembolso de la Orden: ${orderId}...`);

    const escrow = await getEscrow(orderId);
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

    const tx = await escrowContract.cancelOrder(orderId);
    console.log(`[Escrow] Tx de cancelación enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Escrow] Cancelación confirmada en bloque: ${receipt.blockNumber}`);

    const verification = await verifyOrderClosed(orderId);
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

export { ESCROW_FEE_BPS };
