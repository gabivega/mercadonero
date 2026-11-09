// backend/src/routes/gasRoutes.js
//
// ────────────────────────────────────────────────────────────────────────────
// RUTA DE GAS PATROCINADO ("ensure gas")
// ────────────────────────────────────────────────────────────────────────────
// El frontend firma con la smart wallet Crossmint 100% del lado cliente (send de
// tokens, depósito/retiro de colateral). Como esas tx NO pasan por el backend,
// el backend no puede cubrir el gas "por detrás". La solución es que el
// frontend llame a este endpoint ANTES de firmar: acá resolvemos el drip de gas
// nativo (BNB/POL/ETH) desde la wallet admin, de modo que la smart wallet tenga
// con qué firmar.
//
// ¿Por qué no un paymaster? El gas sponsorship de Crossmint requiere plan
// premium (pricing por venta). Mientras tanto, "drip" de moneda nativa desde la
// wallet admin es la forma controlada de pagar el gas del user. El rate-limit
// del servicio (GAS_DRIP_MAX_PER_DAY) y la política de operaciones acotan el
// abuso.
//
// Contrato de respuesta: { success, message, ...data }
// ────────────────────────────────────────────────────────────────────────────
import express from "express";
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";
import { dripGas, needsGas } from "../services/gasDripService.js";
import { getChainConfig, SUPPORTED_CHAIN_IDS } from "../config/chains.js";

const router = express.Router();

// Mapeo de los nombres de red que usa Crossmint en el frontend → chainId EVM.
// (El frontend llama send()/writeContract() con estos nombres.)
const CROSSMINT_CHAIN_TO_ID = {
  "polygon-amoy": 80002,
  "base-sepolia": 84532,
  "bsc-testnet": 97,
};

/**
 * POST /api/gas/ensure
 * Body: { chain: "polygon-amoy"|"base-sepolia"|"bsc-testnet", opType?: string }
 *
 * Garantiza que la wallet del usuario tenga gas nativo para firmar en la red
 * indicada. Si ya tiene suficiente, no hace nada. Si no, entrega un drip.
 *
 * ⚠️ Es IDEMPOTENTE dentro del umbral: si el usuario ya tiene gas, responde
 * `skipped`. Por eso es seguro llamarlo antes de CADA operación.
 */
router.post("/ensure", verifyAuth, attachUser, async (req, res) => {
  try {
    const { chain, opType } = req.body || {};

    // Resolver chainId desde el nombre de Crossmint o un chainId numérico.
    let chainId = null;
    if (typeof chain === "number") chainId = chain;
    else if (typeof chain === "string" && CROSSMINT_CHAIN_TO_ID[chain]) {
      chainId = CROSSMINT_CHAIN_TO_ID[chain];
    } else if (typeof chain === "string" && /^\d+$/.test(chain)) {
      chainId = Number(chain);
    }

    if (!chainId || !SUPPORTED_CHAIN_IDS.includes(chainId)) {
      return res.status(400).json({
        success: false,
        message: `Red no soportada: ${chain}. Soportadas: ${Object.keys(
          CROSSMINT_CHAIN_TO_ID,
        ).join(", ")}.`,
      });
    }

    // El usuario del request (attachUser) trae la address de Mongo. Es la que
    // recibe el drip. Debe estar presente.
    const walletAddress = req.user?.walletAddress;
    const userId = req.user?._id;
    if (!userId || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El usuario no tiene wallet vinculada.",
      });
    }

    // 1) ¿Ya tiene gas suficiente? → no hace falta drip.
    const check = await needsGas(walletAddress, chainId);
    if (!check.success) {
      return res.status(502).json({
        success: false,
        message: `No pudimos verificar el gas de la wallet: ${check.error}`,
      });
    }

    if (!check.needsDrip) {
      return res.json({
        success: true,
        message: "La wallet ya tiene gas suficiente.",
        skipped: true,
        gasReady: true,
        chainId,
        nativeSymbol: check.nativeSymbol,
        balanceNative: check.balanceNative,
      });
    }

    // 2) Entregar el drip. `reason` mapea al enum de GasDrip; usamos "other"
    //    para operaciones generales (send/colateral) y dejamos create_group /
    //    join_group para el flujo de pools.
    const reason =
      opType === "create_group" || opType === "join_group" ? opType : "other";

    const drip = await dripGas({
      userId,
      walletAddress,
      reason,
      chainId,
    });

    if (!drip.success) {
      // Caso típico: el usuario superó el límite diario de drips (anti-abuso).
      return res.status(drip.rateLimited ? 429 : 502).json({
        success: false,
        message:
          drip.error ||
          "No pudimos entregar el gas para esta operación. Intentá más tarde.",
        rateLimited: Boolean(drip.rateLimited),
        recentCount: drip.recentCount,
      });
    }

    return res.json({
      success: true,
      message: drip.delivered
        ? `Gas entregado para operar en ${check.nativeSymbol}.`
        : "La wallet ya tenía gas suficiente.",
      gasReady: true,
      delivered: Boolean(drip.delivered),
      txHash: drip.txHash || null,
      amountNative: drip.amountNative ?? null,
      nativeSymbol: drip.nativeSymbol || check.nativeSymbol,
      chainId,
    });
  } catch (error) {
    console.error("[GasRoutes] Error en /ensure:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al preparar el gas. Intentá nuevamente.",
    });
  }
});

/** GET /api/gas/chains — redes soportadas (debug / diagnóstico). */
router.get("/chains", (req, res) => {
  try {
    const chains = SUPPORTED_CHAIN_IDS.map((id) => {
      const c = getChainConfig(id);
      return {
        chainId: id,
        key: c.key,
        name: c.name,
        nativeSymbol: c.nativeCurrency,
      };
    });
    res.json({ success: true, chains });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
