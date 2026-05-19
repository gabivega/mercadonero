import React, { useState, useEffect, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

// DIRECCIONES DE TU CONFIGURACIÓN (Asegurate de que sean las mismas)
const CONTRACT_ADDRESS = "0xbA7AcBB38dcb90301605f2Fd8A2eC83DA5Ec20B9"; 
const USDT_TESTNET_ADDRESS = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; 

// ABIs requeridos para las tres operaciones
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)"
];

const COLLATERAL_POOL_ABI = [
  "function vendors(address) external view returns (uint256 totalCollateral, uint256 lockedCollateral)",
  "function depositCollateral(address _tokenAddress, uint256 _amount) external",
  "function withdrawCollateral(address _tokenAddress, uint256 _amount) external"
];

export default function CollateralManager() {
  const { wallets } = useWallets();
  const activeWallet = wallets[0];

  // Estados para los saldos de la Blockchain
  const [balances, setBalances] = useState({ total: "0.0", locked: "0.0", available: "0.0" });
  
  // Estados para los inputs y loaders
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // 1. FUNCIÓN PARA LEER LOS SALDOS (READ)
  const fetchBalances = useCallback(async () => {
    if (!activeWallet) return;
    try {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      
      const poolContract = new ethers.Contract(CONTRACT_ADDRESS, COLLATERAL_POOL_ABI, provider);
      
      // Llamamos al mapping 'vendors' pasando la dirección del usuario conectado
      const [totalCollateral, lockedCollateral] = await poolContract.vendors(activeWallet.address);

      // Convertimos de Wei (BigInt) a formato legible (String/Float)
      const total = ethers.formatUnits(totalCollateral, 18);
      const locked = ethers.formatUnits(lockedCollateral, 18);
      const available = (parseFloat(total) - parseFloat(locked)).toFixed(2);

      setBalances({
        total: parseFloat(total).toFixed(2),
        locked: parseFloat(locked).toFixed(2),
        available: available >= 0 ? available : "0.00"
      });
    } catch (error) {
      console.error("Error al leer saldos de colateral:", error);
    }
  }, [activeWallet]);

  // Leer saldos apenas conecte la wallet
  useEffect(() => {
    if (activeWallet) {
      fetchBalances();
    }
  }, [activeWallet, fetchBalances]);

  // 2. FUNCIÓN PARA DEPOSITAR (WRITE)
  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!activeWallet || !depositAmount || isNaN(depositAmount) || Number(depositAmount) <= 0) return;

    setLoading(true);
    setStatus("Iniciando proceso de depósito...");

    try {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const amountInWei = ethers.parseUnits(depositAmount, 18);
      const usdtContract = new ethers.Contract(USDT_TESTNET_ADDRESS, ERC20_ABI, signer);
      const poolContract = new ethers.Contract(CONTRACT_ADDRESS, COLLATERAL_POOL_ABI, signer);

      setStatus("Paso 1/2: Aprobando USDT...");
      const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, amountInWei);
      await approveTx.wait();

      setStatus("Paso 2/2: Confirmando depósito en el contrato...");
      const depositTx = await poolContract.depositCollateral(USDT_TESTNET_ADDRESS, amountInWei);
      await depositTx.wait();

      setStatus(`¡Éxito! Depositaste ${depositAmount} USDT.`);
      setDepositAmount("");
      await fetchBalances(); // Recargar saldos en pantalla automáticamente
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.reason || error.message || "Operación cancelada"}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. FUNCIÓN PARA RETIRAR (WRITE)
  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!activeWallet || !withdrawAmount || isNaN(withdrawAmount) || Number(withdrawAmount) <= 0) return;

    if (Number(withdrawAmount) > Number(balances.available)) {
      setStatus("Error: No podés retirar más del saldo disponible (el saldo retenido está bloqueado).");
      return;
    }

    setLoading(true);
    setStatus("Iniciando retiro de fondos...");

    try {
      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const poolContract = new ethers.Contract(CONTRACT_ADDRESS, COLLATERAL_POOL_ABI, signer);
      const amountInWei = ethers.parseUnits(withdrawAmount, 18);

      setStatus("Confirmá el retiro en tu wallet...");
      const withdrawTx = await poolContract.withdrawCollateral(USDT_TESTNET_ADDRESS, amountInWei);
      
      setStatus("Procesando retiro en la blockchain...");
      await withdrawTx.wait();

      setStatus(`¡Éxito! Retiraste ${withdrawAmount} USDT de vuelta a tu billetera.`);
      setWithdrawAmount("");
      await fetchBalances(); // Recargar saldos en pantalla automáticamente
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.reason || error.message || "Operación cancelada"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 space-y-6">
      
      {/* SECCIÓN 1: CONTADORES DE BALANCE */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Garantías de Vendedor P2P</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Gestioná tu pool flotante para mantener tus publicaciones activas.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Saldo Disponible</span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{balances.available} <span className="text-sm font-normal">USDT</span></div>
          </div>
          
          <div className="p-4 bg-orange-50 dark:bg-orange-950/40 rounded-xl border border-orange-100 dark:border-orange-900">
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">En Órdenes Activas</span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{balances.locked} <span className="text-sm font-normal">USDT</span></div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fondo Total</span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{balances.total} <span className="text-sm font-normal">USDT</span></div>
          </div>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* SECCIÓN 2: FORMULARIOS DE ACCIÓN (DEPOSITAR Y RETIRAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* SUB-COMPONENTE: DEPOSITAR */}
        <form onSubmit={handleDeposit} className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">Cargar Crédito</h3>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              step="any"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              disabled={loading || !activeWallet}
              className="block w-full rounded-lg border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:text-white border dark:border-gray-700 focus:ring-blue-500"
              placeholder="Monto a depositar"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !activeWallet}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 px-4 rounded-lg shadow transition-colors disabled:bg-gray-400"
          >
            {loading ? "Procesando..." : "Depositar USDT"}
          </button>
        </form>

        {/* SUB-COMPONENTE: RETIRAR */}
        <form onSubmit={handleWithdraw} className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">Quitar Garantía</h3>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              step="any"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={loading || !activeWallet || balances.available === "0.00"}
              className="block w-full rounded-lg border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:text-white border dark:border-gray-700 focus:ring-red-500"
              placeholder="Monto a retirar"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !activeWallet || balances.available === "0.00"}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium text-sm py-2 px-4 rounded-lg shadow transition-colors disabled:bg-gray-400"
          >
            {loading ? "Procesando..." : "Retirar USDT"}
          </button>
        </form>

      </div>

      {/* ESTADO GLOBAL DE TRANSACCIONES */}
      {status && (
        <div className={`p-3 rounded-lg text-xs font-medium ${
          status.startsWith("¡Éxito!") 
            ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400 border border-green-200 dark:border-green-900" 
            : status.startsWith("Error") 
              ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900"
              : "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-900"
        }`}>
          {status}
        </div>
      )}

    </div>
  );
}