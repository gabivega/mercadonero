import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, http, formatUnits, createWalletClient, custom, parseUnits } from 'viem';
import { bsc } from 'viem/chains';
import { Wallet, RefreshCcw, ArrowUpRight } from 'lucide-react';
import SendTokenModal from '../../components/SendTokenModal';

const TOKENS = [
  { symbol: 'NERO', name: 'Nero Token', address: '0xd827582763bF4b562bb4e69C025f8AD26c51078b', decimals: 18 },
  { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  { symbol: 'DAI', name: 'DAI Stablecoin', address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
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

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http('https://bsc-dataseed.binance.org')
  });

  const fetchAllBalances = async () => {
    if (!user?.wallet?.address) return;
    setIsLoading(true);
    try {
      const newBalances = {};
      await Promise.all(TOKENS.map(async (token) => {
        const data = await publicClient.readContract({
          address: token.address,
          abi: minERC20Abi,
          functionName: 'balanceOf',
          args: [user.wallet.address],
        });
        newBalances[token.symbol] = formatUnits(data, token.decimals);
      }));
      setBalances(newBalances);
    } catch (error) {
      console.error("Error balances:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    try {
      setIsSending(true);
      const wallet = wallets[0];
      if (!wallet) return;

      await wallet.switchChain(bsc.id);
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ chain: bsc, transport: custom(provider) });

      const amountInWei = parseUnits(sendForm.amount, selectedToken.decimals);
      const hash = await walletClient.writeContract({
        address: selectedToken.address,
        abi: minERC20Abi,
        functionName: 'transfer',
        args: [sendForm.to, amountInWei],
        account: wallet.address,
      });

      alert(`¡Envío exitoso! Hash: ${hash}`);
      setIsModalOpen(false);
      fetchAllBalances();
    } catch (error) {
      console.error("Error envío:", error);
      alert("La transacción falló.");
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
        {TOKENS.map((token) => (
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
        <div>
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Dirección de depósito (BSC)</p>
          <p className="text-xs font-mono text-blue-600/70 break-all">{user.wallet.address}</p>
        </div>
      </div>

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