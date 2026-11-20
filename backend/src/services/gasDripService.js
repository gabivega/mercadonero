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
//   - Máximo N drips por usuario por día (GAS_DRIP_MAX_PER_DAY, global).
//   - Solo se entrega si el balance nativo del user < el umbral DE SU RED
//     (getGasDripParams: cada red tiene su economía, no hay un valor único).
//   - Se registra cada drip en la colección GasDrip (auditoría).

import { ethers } from "ethers";
import dotenv from "dotenv";
import GasDrip from "../models/GasDrip.js";
import { getEscrowChainConfig, getGasDripParams } from "../config/chains.js";

dotenv.config();

// ── CONFIGURACIÓN ──
// Antes TODO el servicio estaba atado a BSC (provider, wallet admin, balance y
// umbral). Con el escrow multichain el comprador puede fondear en Polygon Amoy
// o Base Sepolia, así que resolvemos provider/wallet/parámetros POR RED.
const BSC_PROVIDER_URL =
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const PRIVATE_KEY = process.env.WALLET_PK;

// Switch maestro del drip.
//
// ⚠️ CAMBIO DE DEFAULT: antes era `?? "true"` (habilitado si no se declaraba).
// Eso significa que un entorno nuevo arrancaba REPARTIENDO gas sin que nadie lo
// decidiera. Ahora es opt-in: hay que poner GAS_DRIP_ENABLED=true explícito.
// (En el .env actual ya está en true, así que no cambia el comportamiento de
// testnet; solo protege entornos que se olviden de configurarlo.)
const GAS_DRIP_ENABLED =
  String(process.env.GAS_DRIP_ENABLED ?? "false") === "true";
// Máximo de drips por usuario por día (ventana rodante de 24h).
// Este límite SÍ es global: es anti-abuso por usuario, no económico por red.
const GAS_DRIP_MAX_PER_DAY = Number(process.env.GAS_DRIP_MAX_PER_DAY || 5);

// ── RUNTIME POR RED (provider + admin wallet cacheados) ──
// Se usa la MISMA PRIVATE_KEY como admin en todas las redes (los deploys del
// escrow usan la misma cuenta). El RPC sale del registro de redes.
const runtimeCache = new Map(); // chainId → { provider, adminWallet, config }

function getRuntime(chainId) {
  const config = getEscrowChainConfig(chainId);
  const key = config.chainId;
  if (runtimeCache.has(key)) return runtimeCache.get(key);

  const rpc = config.chain?.rpc || BSC_PROVIDER_URL;
  const provider = new ethers.JsonRpcProvider(rpc);
  const adminWallet = PRIVATE_KEY
    ? new ethers.Wallet(PRIVATE_KEY, provider)
    : null;

  const runtime = { provider, adminWallet, config };
  runtimeCache.set(key, runtime);
  return runtime;
}

/**
 * Lee el balance de la MONEDA NATIVA (BNB/POL/ETH) de una dirección en una red.
 * @returns {Promise<{success:boolean, balanceWei?:bigint, balanceNative?:number, error?:string}>}
 */
export async function getNativeBalance(address, chainId) {
  try {
    const { provider, config } = getRuntime(chainId);
    if (!ethers.isAddress(address)) {
      return { success: false, error: "Dirección inválida" };
    }
    const balanceWei = await provider.getBalance(address);
    return {
      success: true,
      balanceWei,
      balanceNative: Number(ethers.formatEther(balanceWei)),
      nativeSymbol: config.nativeSymbol,
    };
  } catch (error) {
    console.error("[GasDrip] Error leyendo balance nativo:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Compat: lee el balance nativo en la red por defecto del escrow.
 * (Los callers viejos asumían BSC; ahora respetan la red del escrow.)
 */
export async function getBnbBalance(address, chainId) {
  const bal = await getNativeBalance(address, chainId);
  return bal.success
    ? { ...bal, balanceBnb: bal.balanceNative, balanceNative: undefined }
    : bal;
}

/**
 * Determina si un usuario necesita un drip de gas en una red.
 *
 * El umbral es POR RED (`getGasDripParams`): 0.0001 ETH en Base no es lo mismo
 * que 0.0015 tBNB en BSC. Si la red es mainnet y no está configurada, devuelve
 * error en vez de aplicar un umbral de testnet.
 *
 * @returns {Promise<{success:boolean, needsDrip:boolean, balanceNative?:number, error?:string}>}
 */
export async function needsGas(address, chainId) {
  const bal = await getNativeBalance(address, chainId);
  if (!bal.success) return { success: false, needsDrip: false, error: bal.error };

  let params;
  try {
    // getNativeBalance ya resolvió la red; usamos el chainId efectivo.
    const { config } = getRuntime(chainId);
    params = getGasDripParams(config.chainId);
  } catch (error) {
    // Mainnet sin configurar: NO aplicar un default de testnet.
    return { success: false, needsDrip: false, error: error.message };
  }

  const threshold = Number(params.min);
  return {
    success: true,
    needsDrip: bal.balanceNative < threshold,
    balanceNative: bal.balanceNative,
    balanceBnb: bal.balanceNative, // compat
    nativeSymbol: bal.nativeSymbol,
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
 * @param {number} [opts.chainId]     - red del escrow (default: red del escrow)
 * @returns {Promise<object>} resultado del drip
 */
export async function dripGas({
  userId,
  walletAddress,
  reason = "other",
  refId,
  chainId,
}) {
  // 0) Switch maestro.
  if (!GAS_DRIP_ENABLED) {
    return { success: true, skipped: true, reason: "GAS_DRIP_ENABLED=false" };
  }
  const { provider, adminWallet, config } = getRuntime(chainId);
  if (!adminWallet) {
    return { success: false, error: "WALLET_PK no configurada en el backend." };
  }
  if (!userId || !walletAddress) {
    return { success: false, error: "Faltan userId o walletAddress." };
  }
  if (!ethers.isAddress(walletAddress)) {
    return { success: false, error: "walletAddress inválida." };
  }

  // 1) ¿Ya tiene gas nativo suficiente? → no hace falta drip.
  const check = await needsGas(walletAddress, chainId);
  if (!check.success) return { success: false, error: check.error };
  if (!check.needsDrip) {
    return {
      success: true,
      skipped: true,
      reason: "El usuario ya tiene gas nativo suficiente.",
      balanceNative: check.balanceNative,
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

  // 3) Monto POR RED. Si la red es mainnet y no está configurada, abortamos:
  //    preferimos NO entregar gas antes que entregar un monto de testnet
  //    (p. ej. 0.003 ETH por drip en Base mainnet).
  let params;
  try {
    params = getGasDripParams(config.chainId);
  } catch (error) {
    console.error("[GasDrip] Config inválida:", error.message);
    return { success: false, error: error.message, configError: true };
  }
  const dripAmount = params.amount;

  // 4) Registrar el intento (pending) para auditoría.
  const amountWei = ethers.parseEther(String(dripAmount));
  const dripRow = await GasDrip.create({
    user: userId,
    walletAddress: walletAddress.toLowerCase(),
    amountBnb: Number(dripAmount),
    amountWei: amountWei.toString(),
    reason,
    refId,
    balanceBeforeWei:
      check.balanceNative !== undefined ? String(check.balanceNative) : "0",
    status: "pending",
  });

  try {
    console.log(
      `[GasDrip] Enviando ${dripAmount} ${config.nativeSymbol} a ${walletAddress} (${reason}, chain ${config.chainId}, src ${params.source})...`,
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
      amountNative: Number(dripAmount),
      amountBnb: Number(dripAmount), // compat
      nativeSymbol: config.nativeSymbol,
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
 * Preparación completa del fondeo: valida el saldo del comprador y garantiza
 * el gas (drip si hace falta). Pensado para llamarse ANTES de que el user firme.
 *
 * Soporta los DOS modelos de fondeo del escrow:
 *  - "token":  el comprador necesita saldo del TOKEN de pago + gas nativo.
 *  - "native": el comprador fondea con la MONEDA NATIVA, así que el "saldo de
 *              pago" ES el saldo nativo: se valida contra `requiredUsd` y el
 *              drip solo cubre el gas extra.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.walletAddress
 * @param {string} [opts.usdtAddress]  - token de pago (vacío en modo native)
 * @param {number} opts.requiredUsd    - monto requerido para el fondeo
 * @param {"create_group"|"join_group"|"approve"} [opts.reason]
 * @param {string} [opts.refId]
 * @param {number} [opts.chainId]      - red del escrow
 */
export async function prepareFunding({
  userId,
  walletAddress,
  usdtAddress,
  requiredUsd,
  reason = "other",
  refId,
  chainId,
}) {
  const config = getEscrowChainConfig(chainId);
  const isNative = config.fundingMode === "native";
  const { provider } = getRuntime(chainId);

  if (!ethers.isAddress(walletAddress)) {
    return { success: false, error: "Dirección de wallet inválida." };
  }

  // 1) Validar saldo de pago on-chain.
  try {
    if (isNative) {
      // Modo nativo: el saldo de pago es el nativo de la red.
      const balWei = await provider.getBalance(walletAddress);
      const balUsd = Number(ethers.formatEther(balWei));
      if (requiredUsd && balUsd < Number(requiredUsd)) {
        return {
          success: false,
          insufficientUsdt: true,
          balanceUsd: balUsd,
          requiredUsd: Number(requiredUsd),
          nativeSymbol: config.nativeSymbol,
          error: `Saldo ${config.nativeSymbol} insuficiente (tenés ${balUsd.toFixed(
            4,
          )}, necesitás ${Number(requiredUsd).toFixed(2)}).`,
        };
      }
    } else {
      if (!ethers.isAddress(usdtAddress)) {
        return { success: false, error: "Dirección de token inválida." };
      }
      // ⚠️ NO asumir 18 decimales: usamos los declarados por la red.
      const decimals = Number.isFinite(config.tokenDecimals)
        ? config.tokenDecimals
        : 18;
      const erc20 = new ethers.Contract(
        usdtAddress,
        ["function balanceOf(address) view returns (uint256)"],
        provider,
      );
      const balWei = await erc20.balanceOf(walletAddress);
      const balUsd = Number(ethers.formatUnits(balWei, decimals));
      if (requiredUsd && balUsd < Number(requiredUsd)) {
        return {
          success: false,
          insufficientUsdt: true,
          balanceUsd: balUsd,
          requiredUsd: Number(requiredUsd),
          error: `Saldo ${config.tokenSymbol} insuficiente (tenés ${balUsd.toFixed(
            2,
          )}, necesitás ${Number(requiredUsd).toFixed(2)}).`,
        };
      }
    }
  } catch (error) {
    console.error("[GasDrip] Error validando saldo de pago:", error.message);
    return { success: false, error: error.message };
  }

  // 2) Garantizar gas (drip si hace falta).
  const drip = await dripGas({ userId, walletAddress, reason, refId, chainId });
  if (!drip.success) return drip;

  return {
    success: true,
    gasReady: true,
    drip: drip.delivered
      ? {
          delivered: true,
          txHash: drip.txHash,
          amountNative: drip.amountNative,
          amountBnb: drip.amountBnb,
        }
      : { delivered: false, reason: drip.reason || "ya tenía gas" },
  };
}

// ⚠️ Ya NO se exportan `GAS_DRIP_AMOUNT_BNB` / `GAS_DRIP_MIN_BNB` globales:
// eran un único valor aplicado a todas las redes (justo el bug que corregimos).
// El monto/umbral por red se obtiene con `getGasDripParams(chainId)` desde
// `../config/chains.js`. Si algún script externo necesitaba esos valores, debe
// pasar a usar esa función.
export { GAS_DRIP_ENABLED, GAS_DRIP_MAX_PER_DAY };
