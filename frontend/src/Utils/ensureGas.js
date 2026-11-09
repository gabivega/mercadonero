/**
 * Utils/ensureGas.js
 * ────────────────────────────────────────────────────────────────────────────
 * Pide al backend que garantice GAS NATIVO en la smart wallet ANTES de firmar.
 *
 * CONTEXTO:
 *   El gas de las smart wallets Crossmint lo paga la plataforma vía "drip"
 *   (transferencia de BNB/POL/ETH desde la wallet admin). Como la firma es
 *   100% client-side, el frontend debe avisar al backend ANTES de enviar la
 *   transacción, para que el user tenga con qué firmar.
 *
 *   El endpoint es idempotente: si el user ya tiene gas, responde `skipped` sin
 *   gastar nada. Por eso es seguro llamarlo antes de CADA operación.
 *
 * USO:
 *   await ensureGas({ chain: "polygon-amoy", opType: "send" });
 *   // ahora la wallet tiene gas → se puede firmar
 */
import axios from "axios";

/**
 * @param {object} opts
 * @param {string} opts.chain   - nombre Crossmint: "polygon-amoy" | "base-sepolia" | "bsc-testnet"
 * @param {string} [opts.opType] - "send" | "withdraw_collateral" | "deposit_collateral" | ...
 * @param {() => Promise<string>} opts.getAccessToken - getter del JWT de la sesión
 * @returns {Promise<{ ok: boolean, delivered?: boolean, message: string, rateLimited?: boolean }>}
 */
export async function ensureGas({ chain, opType, getAccessToken } = {}) {
  if (!chain) return { ok: false, message: "Falta la red para preparar el gas." };

  try {
    const token = getAccessToken ? await getAccessToken() : null;
    const { data } = await axios.post(
      `${import.meta.env.VITE_SERVER_URL}/api/gas/ensure`,
      { chain, opType },
      token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    );

    // El backend responde { success, message, gasReady, delivered, ... }.
    return {
      ok: data?.success !== false && data?.gasReady !== false,
      delivered: Boolean(data?.delivered),
      message: data?.message || "Gas listo.",
      rateLimited: Boolean(data?.rateLimited),
      nativeSymbol: data?.nativeSymbol,
    };
  } catch (err) {
    const status = err?.response?.status;
    const apiMsg = err?.response?.data?.message;
    const rateLimited = status === 429 || Boolean(err?.response?.data?.rateLimited);

    // Si es un 429 (límite de drips diario), devolvemos un mensaje claro.
    return {
      ok: false,
      rateLimited,
      message:
        apiMsg ||
        (rateLimited
          ? "Superaste el límite diario de operaciones con gas patrocinado. Intentá más tarde."
          : "No pudimos preparar el gas para la operación. Intentá nuevamente."),
    };
  }
}
