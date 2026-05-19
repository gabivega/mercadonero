import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, http, formatUnits, createWalletClient, custom, parseUnits } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { Wallet, RefreshCcw, ArrowUpRight, Copy } from 'lucide-react';
import SendTokenModal from '../../components/SendTokenModal';
import Swal from 'sweetalert2';
import CollateralManager from '../../components/CollateralManager';
import DepositCollateral from '../../components/DepositCollateral';

const TOKENS = [
  // { symbol: 'NERO', name: 'Nero Token', address: '0xd827582763bF4b562bb4e69C025f8AD26c51078b', decimals: 18 },
  { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  { symbol: 'DAI', name: 'DAI Stablecoin', address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
];
const TESTNET_TOKENS = [
  { 
    symbol: 'USDT', 
    name: 'Tether USD (Testnet)', 
    address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', 
    decimals: 18 
  },
  { 
    symbol: 'USDC', 
    name: 'USD Coin (Testnet)', 
    address: '0x64544969ed7EBf5f083679233325356EbE738930', 
    decimals: 18 
  },
  { symbol: 'BNB', name: 'Binance Coin', address: null, decimals: 18 },
  // { 
  //   symbol: 'DAI', 
  //   name: 'DAI Stablecoin (Testnet)', 
  //   address: '0xEC5dCb5D149142597E046033b47862295E010fA7', 
  //   decimals: 18 
  // },
  // Agregué el NERO Token por si ya tienes el contrato desplegado en Testnet
  // { 
  //   symbol: 'NERO', 
  //   name: 'Nero Token', 
  //   address: 'TU_DIRECCION_DE_CONTRATO_EN_TESTNET', 
  //   decimals: 18 
  // },
];
const minERC20Abi = [{ constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" }, { constant: false, inputs: [{ name: "_to", type: "address" }, { name: "_value", type: "uint256" }], name: "transfer", outputs: [{ name: "success", type: "bool" }], type: "function" }];

export default function WalletPage() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [balances, setBalances] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [sendForm, setSendForm] = useState({ to: '', amount: '' });
  const [isSending, setIsSending] = useState(false);

  const [txStatus, setTxStatus] = useState('idle'); // 'idle' | 'success' | 'error'

const handleOpenModal = (token) => {
  setTxStatus('idle'); // Reseteamos el estado al abrir
  setSelectedToken(token);
  setSendForm({ to: '', amount: '' });
  setIsModalOpen(true);
};

const onConfirmSend = async () => {
  try {
    setIsSending(true);
    setTxStatus('idle');
    
    // Llamamos a la lógica de envío (asegúrate que handleSend devuelva el hash o lance error)
    await handleSend(); 
    
    setTxStatus('success'); // Esto mostrará la pantalla verde en el modal
    fetchAllBalances(); // Recargamos saldos de fondo
  } catch (error) {
    setTxStatus('error');
    console.error(error);
  } finally {
    setIsSending(false);
  }
};

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(user.wallet.address);
      const isDark = document.documentElement.classList.contains("dark");
      const Toast = Swal.mixin({
        toast: true,
        position: "bottom-end",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        iconColor: "#3483fa",
        didOpen: (toast) => {
          toast.addEventListener("mouseenter", Swal.stopTimer);
          toast.addEventListener("mouseleave", Swal.resumeTimer);
        },
      });
      Toast.fire({
        icon: "success",
        title: "Dirección copiada al portapapeles",
      });
    } catch (error) {
      console.error("Error al copiar dirección:", error);
    }
  };

  const publicClient = createPublicClient({
    chain: bscTestnet,
    transport: http('https://bsc-testnet-rpc.publicnode.com')
  });

  const fetchAllBalances = async () => {
  if (!user?.wallet?.address) return;
  setIsLoading(true);
  
  try {
    const newBalances = {};
    
    await Promise.all(TESTNET_TOKENS.map(async (token) => {
      try {
        if (token.symbol === 'BNB') {
          // Moneda Nativa (tBNB en Testnet): usamos getBalance
          const balanceRaw = await publicClient.getBalance({
            address: user.wallet.address,
          });
          newBalances[token.symbol] = formatUnits(balanceRaw, token.decimals);
        } else {
          // Tokens ERC20 (USDT, USDC, etc): usamos readContract
          const data = await publicClient.readContract({
            address: token.address,
            abi: minERC20Abi,
            functionName: 'balanceOf',
            args: [user.wallet.address],
          });
          newBalances[token.symbol] = formatUnits(data, token.decimals);
        }
      } catch (tokenError) {
        // Si falla un token específico, le ponemos 0 y evitamos que rompa todo el Promise.all
        console.error(`Error cargando balance de ${token.symbol}:`, tokenError);
        newBalances[token.symbol] = "0.00";
      }
    }));

    setBalances(newBalances);
  } catch (error) {
    console.error("Error general en fetchAllBalances:", error);
  } finally {
    setIsLoading(false);
  }
};

const handleSend = async () => {
  try {
    setIsSending(true);
    const wallet = wallets[0];
    if (!wallet) return;

    // 1. Asegurar la red correcta
    await wallet.switchChain(bscTestnet.id);
    const provider = await wallet.getEthereumProvider();
    const walletClient = createWalletClient({ 
      chain: bscTestnet, 
      transport: custom(provider) 
    });

    // 2. Calcular el monto en las unidades correctas (Wei)
    const amountInWei = parseUnits(sendForm.amount, selectedToken.decimals);
    
    // 3. Obtener el nonce fresco para evitar el "nonce too low"
    const nextNonce = await publicClient.getTransactionCount({
      address: wallet.address,
      blockTag: 'pending', // Trae el nonce considerando transacciones en cola
    });

    let hash;

    // 4. Bifurcación: ¿Es BNB nativo o un Token ERC20?
    if (selectedToken.symbol === 'BNB') {
      // ENVÍO DE BNB NATIVO
      hash = await walletClient.sendTransaction({
        account: wallet.address,
        to: sendForm.to,
        value: amountInWei,
        nonce: nextNonce, // Forzamos el nonce correcto
      });
    } else {
      // ENVÍO DE TOKENS (USDT, USDC, ETC)
      hash = await walletClient.writeContract({
        address: selectedToken.address,
        abi: minERC20Abi,
        functionName: 'transfer',
        args: [sendForm.to, amountInWei],
        account: wallet.address,
        nonce: nextNonce, // Forzamos el nonce correcto
      });
    }

    alert(`¡Envío exitoso! Hash: ${hash}`);
    setIsModalOpen(false);
    
    // Un pequeño delay para que la blockchain asiente el bloque antes de recargar
    setTimeout(() => {
      fetchAllBalances();
    }, 2000);

  } catch (error) {
    console.error("Error envío:", error);
    alert("La transacción falló o fue rechazada.");
  } finally {
    setIsSending(false);
  }
};

  useEffect(() => {
    if (authenticated) fetchAllBalances();
  }, [authenticated, user?.wallet?.address]);

  if (!authenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold dark:text-white">Mi Billetera</h2>
        <button onClick={fetchAllBalances} disabled={isLoading} className="flex items-center gap-2 text-sm text-blue-600 font-medium">
          <RefreshCcw size={16} className={isLoading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TESTNET_TOKENS.map((token) => (
          <div key={token.symbol} className="p-6 bg-white dark:bg-[#252525] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold dark:text-gray-300">
                {token.symbol[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{token.name}</p>
                <p className="text-xl font-bold dark:text-white">
                  {isLoading ? "..." : parseFloat(balances[token.symbol] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} 
                  <span className="ml-2 text-sm font-normal text-gray-400">{token.symbol}</span>
                </p>
              </div>
            </div>
            <button 
              onClick={() => { setSelectedToken(token); setSendForm({to:'', amount:''}); setIsModalOpen(true); }}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all min-w-[100px]"
            >
              <span className="font-bold text-sm">Enviar</span>
              <ArrowUpRight size={18} />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
        <Wallet className="text-blue-600 mt-1" size={20} />
        <div className="flex-1">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Dirección de depósito (BSC)</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-blue-600/70 break-all">{user.wallet.address}</p>
            <button
              onClick={handleCopyAddress}
              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Copiar dirección"
            >
              <Copy size={14} className="text-blue-600 dark:text-blue-400" />
            </button>
          </div>
        </div>
      </div>
      <CollateralManager />
      <DepositCollateral />


      <SendTokenModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        token={selectedToken} 
        balance={balances[selectedToken?.symbol]} 
        formData={sendForm} 
        setFormData={setSendForm} 
        onConfirm={handleSend} 
        isLoading={isSending} 
      />
    </div>
  );
}