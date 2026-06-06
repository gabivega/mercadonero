import React, { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

// REEMPLAZA ESTOS DATOS CON LOS TUYOS
const CONTRACT_ADDRESS = "0x49fB72b9783e8DD934233C9155CdEA45eC17822D";
const USDT_TESTNET_ADDRESS = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; 

// ABIs mínimos para interactuar desde el Front
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)"
];

const COLLATERAL_POOL_ABI = [
  "function depositCollateral(address _tokenAddress, uint256 _amount) external"
];

export default function DepositCollateral() {
  const { wallets } = useWallets();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // Obtener la billetera activa de Privy
  const activeWallet = wallets[0]; 

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!activeWallet) {
      setStatus("Error: No hay una wallet conectada con Privy.");
      return;
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      setStatus("Por favor, ingresa un monto válido.");
      return;
    }

    setLoading(true);
    setStatus("Conectando con la blockchain...");
    // console.log("Amount:", amount);
    try {
      // 1. Obtener el proveedor de Ethereum de la wallet de Privy
      const ethereumProvider = await activeWallet.getEthereumProvider();
      
      // 2. Envolverlo en un proveedor de ethers v6
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      // 3. Formatear el monto a Wei (asumiendo 18 decimales para USDT de testnet)
      const amountInWei = ethers.parseUnits(amount, 18);

      // Instanciar los contratos con el firmante del usuario
      const usdtContract = new ethers.Contract(USDT_TESTNET_ADDRESS, ERC20_ABI, signer);
      const poolContract = new ethers.Contract(CONTRACT_ADDRESS, COLLATERAL_POOL_ABI, signer);

      // --- PASO 1: APPROVE ---
      setStatus("Paso 1/2: Solicitando aprobación de USDT en MetaMask...");
      // Verificamos si ya tiene allowance suficiente (opcional, para ahorrar gas, pero vamos directo al approve para asegurar)
      const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, amountInWei);
      setStatus("Esperando confirmación del Approve...");
      await approveTx.wait();

      // --- PASO 2: DEPOSIT ---
      setStatus("Paso 2/2: Confirmando el depósito en el Pool...");
      const depositTx = await poolContract.depositCollateral(USDT_TESTNET_ADDRESS, amountInWei);
      setStatus("Procesando depósito en la blockchain...");
      await depositTx.wait();

      setStatus(`¡Éxito! Depositaste ${amount} USDT en tu fondo de garantía.`);
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
        Deposita USDT para habilitar tus publicaciones y respaldar tus ventas P2P.
      </p>

      <form onSubmit={handleDeposit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Monto en USDT
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
              <span className="text-gray-500 sm:text-sm">USDT</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !activeWallet}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            loading || !activeWallet
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