import React, { useState } from "react";
import { usePrivy } from "../Utils/authClient";
import { useUserStore } from "../store/useUserStore";
import { writeContract, approveToken } from "../Utils/crossmintWallet";

// Contrato NeroCollateral (fianza de vendedores).
// La smart wallet Crossmint vive en Polygon Amoy (testnet). El contrato y el
// token de garantía se resuelven por env.
//
// ⚠️ Migración de Privy → Crossmint: antes se firmaba con Privy + ethers
// (`wallet.getEthereumProvider()`). Ahora se firma con la smart wallet
// Crossmint (device signer, sin OTP) vía `crossmintWallet.js`.
const CONTRACT_ADDRESS =
  import.meta.env.VITE_COLLATERAL_CONTRACT_ADDRESS ||
  "0xe8Af73236b5376d1256BE406249401A89a133CF3";

// Token de garantía en Polygon Amoy (USDXM por defecto, 6 decimales).
const COLLATERAL_TOKEN_ADDRESS =
  import.meta.env.VITE_COLLATERAL_TOKEN_ADDRESS ||
  "0x14196F08a4Fa0B66B7331bC40dd6bCd8A1dEeA9F";
const COLLATERAL_TOKEN_DECIMALS = Number(
  import.meta.env.VITE_COLLATERAL_TOKEN_DECIMALS || 6,
);
const COLLATERAL_TOKEN_SYMBOL =
  import.meta.env.VITE_COLLATERAL_TOKEN_SYMBOL || "USDT";

// ABI del contrato de colateral (formato fragmentos, como espera el SDK).
const COLLATERAL_POOL_ABI = [
  {
    type: "function",
    name: "depositCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tokenAddress", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
];

/** Convierte un monto legible (string) a unidades base (bigint) sin ethers. */
function toBaseUnits(amount, decimals) {
  const [intPart, fracPart = ""] = String(amount).trim().split(".");
  const padded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt((intPart || "0") + padded);
}

export default function DepositCollateral() {
  const { authenticated, user } = usePrivy();
  const dbWalletAddress = useUserStore((s) => s.dbUser?.walletAddress || null);
  // Fuente de verdad de la wallet: Mongo (dbUser.walletAddress). Fallback al
  // user mapeado por authClient.
  const walletAddress = dbWalletAddress || user?.wallet?.address || null;

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!walletAddress) {
      setStatus("Error: No hay una billetera vinculada a tu cuenta.");
      return;
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      setStatus("Por favor, ingresa un monto válido.");
      return;
    }

    setLoading(true);
    setStatus("Conectando con la blockchain...");
    try {
      const amountInBase = toBaseUnits(amount, COLLATERAL_TOKEN_DECIMALS);

      // --- PASO 1: APPROVE ---
      setStatus(`Paso 1/2: Aprobando ${COLLATERAL_TOKEN_SYMBOL}...`);
      await approveToken({
        tokenAddress: COLLATERAL_TOKEN_ADDRESS,
        spender: CONTRACT_ADDRESS,
        amount: amountInBase,
      });

      // --- PASO 2: DEPOSIT ---
      setStatus("Paso 2/2: Confirmando el depósito en el Pool...");
      await writeContract({
        address: CONTRACT_ADDRESS,
        abi: COLLATERAL_POOL_ABI,
        functionName: "depositCollateral",
        args: [COLLATERAL_TOKEN_ADDRESS, amountInBase],
      });

      setStatus(`¡Éxito! Depositaste ${amount} ${COLLATERAL_TOKEN_SYMBOL} en tu fondo de garantía.`);
      setAmount("");
    } catch (error) {
      console.error("Error en el depósito:", error);
      setStatus(`Error: ${error.reason || error.message || "Transacción cancelada"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md max-w-md mx-auto my-4 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
        Cargar Fondo de Garantía
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Deposita {COLLATERAL_TOKEN_SYMBOL} para habilitar tus publicaciones y respaldar tus ventas P2P.
      </p>

      <form onSubmit={handleDeposit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Monto en {COLLATERAL_TOKEN_SYMBOL}
          </label>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
              className="block w-full rounded-md border-gray-300 pl-3 pr-12 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border dark:bg-gray-700 dark:text-white"
              placeholder="0.00"
            />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-gray-500 sm:text-sm">{COLLATERAL_TOKEN_SYMBOL}</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !walletAddress}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            loading || !walletAddress
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          }`}
        >
          {loading ? "Procesando..." : "Cargar Garantía"}
        </button>
      </form>

      {status && (
        <div className={`mt-4 p-3 rounded text-sm ${loading ? "bg-yellow-50 text-yellow-800" : status.startsWith("¡Éxito!") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {status}
        </div>
      )}
    </div>
  );
}