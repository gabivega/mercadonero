// backend/src/services/gasDripService.js
//
// SERVICIO DE "GAS DRIP" — la plataforma paga el gas del comprador.
//
// CONTEXTO / DECISIÓN DE ARQUITECTURA:
//   La plataforma NO custodia USDT bajo ningún concepto. El USDT del comprador
//   siempre vive en su propia wallet hasta que lo congela en el escrow.
//   Como el USDT de BSC no soporta EIP-2612 (permit) y no usamos ERC-4337, el
//   comprador necesita firmar sus txs (approve + createGroup/joinGroup) y éstas
//   consumen gas. Para que el comprador NUNCA se preocupe por el BNB, la
//   plataforma le transfiere (drip) un pequeño monto de BNB just-in-time,
//   suficiente para cubrir el gas de esas firmas.
//
// FLUJO:
//   1. Antes de que el comprador firme, el backend llama a prepareGas(...).
//   2. Si el comprador ya tiene BNB suficiente → no hace nada (o solo reporta).
//   3. Si le falta → verifica el rate-limit y le transfiere BNB desde la wallet
//      admin (que es la que paga el gas "de la plataforma").
//
// ANTI-ABUSO:
//   - Máximo N drips por usuario por día (GAS_DRIP_MAX_PER_DAY).
//   - Solo se entrega si el balance on-chain del user < umbral (GAS_DRIP_MIN_BNB).
//   - Se registra cada drip en la colección GasDrip (auditoría).

import { ethers } from "ethers";
import dotenv from "dotenv";
import GasDrip from "../models/GasDrip.js";

dotenv.config();

// ── CONFIGURACIÓN ──
const PROVIDER_URL =
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const PRIVATE_KEY = process.env.WALLET_PK;

// Switch maestro: si está en "false", el drip queda deshabilitado.
const GAS_DRIP_ENABLED = String(process.env.GAS_DRIP_ENABLED ?? "true") === "true";
// Monto entregado por drip (BNB). Default 0.001 BNB.
const GAS_DRIP_AMOUNT_BNB = process.env.GAS_DRIP_AMOUNT_BNB || "0.001";
// Si el usuario YA tiene >= este BNB, no se le entrega drip.
const GAS_DRIP_MIN_BNB = process.env.GAS_DRIP_MIN_BNB || "0.0005";
// Máximo de drips por usuario por día (ventana rodante de 24h).
const GAS_DRIP_MAX_PER_DAY = Number(process.env.GAS_DRIP_MAX_PER_DAY || 5);

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const adminWallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

/**
 * Lee el balance de BNB (nativo) de una dirección.
 * @returns {Promise<{success:boolean, balanceWei?:bigint, balanceBnb?:number, error?:string}>}
 */
export async function getBnbBalance(address) {
  try {
    if (!ethers.isAddress(address)) {
      return { success: false, error: "Dirección inválida" };
    }
    const balanceWei = await provider.getBalance(address);
    return {
      success: true,
      balanceWei,
      balanceBnb: Number(ethers.formatEther(balanceWei)),
    };
  } catch (error) {
    console.error("[GasDrip] Error leyendo balance BNB:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Determina si un usuario necesita un drip de gas.
 * @returns {Promise<{success:boolean, needsDrip:boolean, balanceBnb?:number, error?:string}>}
 */
export async function needsGas(address) {
  const bal = await getBnbBalance(address);
  if (!bal.success) return { success: false, needsDrip: false, error: bal.error };
  const threshold = Number(GAS_DRIP_MIN_BNB);
  return {
    success: true,
    needsDrip: bal.balanceBnb < threshold,
    balanceBnb: bal.balanceBnb,
    threshold,
  };
}

/**
 * Cuenta cuántos drips completados recibió un usuario en las últimas 24h.
 */
async function countRecentDrips(userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return GasDrip.countDocuments({
    user: userId,
    status: "completed",
    createdAt: { $gte: since },
  });
}

/**
 * ACCIÓN: ENTREGAR EL DRIP DE GAS.
 *
 * @param {object} opts
 * @param {string} opts.userId        - id Mongo del usuario
 * @param {string} opts.walletAddress - wallet que firma (embedded del comprador)
 * @param {"create_group"|"join_group"|"approve"|"other"} [opts.reason]
 * @param {string} [opts.refId]       - id del Pool/orden (opcional)
 * @returns {Promise<object>} resultado del drip
 */
export async function dripGas({ userId, walletAddress, reason = "other", refId }) {
  // 0) Switch maestro.
  if (!GAS_DRIP_ENABLED) {
    return { success: true, skipped: true, reason: "GAS_DRIP_ENABLED=false" };
  }
  if (!adminWallet) {
    return { success: false, error: "WALLET_PK no configurada en el backend." };
  }
  if (!userId || !walletAddress) {
    return { success: false, error: "Faltan userId o walletAddress." };
  }
  if (!ethers.isAddress(walletAddress)) {
    return { success: false, error: "walletAddress inválida." };
  }

  // 1) ¿Ya tiene BNB suficiente? → no hace falta drip.
  const check = await needsGas(walletAddress);
  if (!check.success) return { success: false, error: check.error };
  if (!check.needsDrip) {
    return {
      success: true,
      skipped: true,
      reason: "El usuario ya tiene BNB suficiente.",
      balanceBnb: check.balanceBnb,
    };
  }

  // 2) Anti-abuso: rate-limit por usuario (24h).
  const recent = await countRecentDrips(userId);
  if (recent >= GAS_DRIP_MAX_PER_DAY) {
    return {
      success: false,
      error: `Límite de ${GAS_DRIP_MAX_PER_DAY} drips por día alcanzado.`,
      rateLimited: true,
      recentCount: recent,
    };
  }

  // 3) Registrar el intento (pending) para auditoría.
  const amountWei = ethers.parseEther(String(GAS_DRIP_AMOUNT_BNB));
  const dripRow = await GasDrip.create({
    user: userId,
    walletAddress: walletAddress.toLowerCase(),
    amountBnb: Number(GAS_DRIP_AMOUNT_BNB),
    amountWei: amountWei.toString(),
    reason,
    refId,
    balanceBeforeWei: check.balanceBnb !== undefined ? String(check.balanceBnb) : "0",
    status: "pending",
  });

  try {
    console.log(
      `[GasDrip] Enviando ${GAS_DRIP_AMOUNT_BNB} BNB a ${walletAddress} (${reason})...`,
    );
    const tx = await adminWallet.sendTransaction({
      to: walletAddress,
      value: amountWei,
    });
    console.log(`[GasDrip] Tx enviada: ${tx.hash}`);
    const receipt = await tx.wait();

    // Verificación real on-chain: el balance del user debe haber subido.
    const after = await provider.getBalance(walletAddress);
    if (after < amountWei) {
      // No debería pasar, pero por si acaso.
      dripRow.status = "failed";
      dripRow.error = "El balance no refleja el drip tras la tx.";
      await dripRow.save();
      return {
        success: false,
        txHash: tx.hash,
        error: "La tx se minó pero el balance no refleja el drip. Intervención manual.",
      };
    }

    dripRow.status = "completed";
    dripRow.txHash = tx.hash;
    await dripRow.save();

    console.log(`[GasDrip] ✓ Drip confirmado en bloque ${receipt.blockNumber}`);
    return {
      success: true,
      delivered: true,
      txHash: tx.hash,
      amountBnb: Number(GAS_DRIP_AMOUNT_BNB),
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    dripRow.status = "failed";
    dripRow.error = error.reason || error.message;
    await dripRow.save();
    console.error("[GasDrip] Error enviando drip:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * Preparación completa del fondeo: valida balance USDT del user y garantiza
 * el gas (drip si hace falta). Pensado para llamarse ANTES de que el user firme.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.walletAddress
 * @param {string} opts.usdtAddress    - token USDT
 * @param {number} opts.requiredUsd    - monto USDT requerido para el fondeo
 * @param {"create_group"|"join_group"|"approve"} [opts.reason]
 * @param {string} [opts.refId]
 */
export async function prepareFunding({
  userId,
  walletAddress,
  usdtAddress,
  requiredUsd,
  reason = "other",
  refId,
}) {
  // 1) Validar saldo USDT del comprador on-chain.
  try {
    if (!ethers.isAddress(walletAddress) || !ethers.isAddress(usdtAddress)) {
      return { success: false, error: "Dirección de wallet o token inválida." };
    }
    const erc20 = new ethers.Contract(
      usdtAddress,
      ["function balanceOf(address) view returns (uint256)"],
      provider,
    );
    const balWei = await erc20.balanceOf(walletAddress);
    const balUsd = Number(ethers.formatUnits(balWei, 18));
    if (requiredUsd && balUsd < Number(requiredUsd)) {
      return {
        success: false,
        insufficientUsdt: true,
        balanceUsd: balUsd,
        requiredUsd: Number(requiredUsd),
        error: `Saldo USDT insuficiente (tenés ${balUsd.toFixed(2)}, necesitás ${Number(
          requiredUsd,
        ).toFixed(2)}).`,
      };
    }
  } catch (error) {
    console.error("[GasDrip] Error validando saldo USDT:", error.message);
    return { success: false, error: error.message };
  }

  // 2) Garantizar gas (drip si hace falta).
  const drip = await dripGas({ userId, walletAddress, reason, refId });
  if (!drip.success) return drip;

  return {
    success: true,
    gasReady: true,
    drip: drip.delivered
      ? { delivered: true, txHash: drip.txHash, amountBnb: drip.amountBnb }
      : { delivered: false, reason: drip.reason || "ya tenía gas" },
  };
}

export {
  GAS_DRIP_ENABLED,
  GAS_DRIP_AMOUNT_BNB,
  GAS_DRIP_MIN_BNB,
  GAS_DRIP_MAX_PER_DAY,
};
