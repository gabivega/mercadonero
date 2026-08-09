import { useEffect, useState } from 'react';
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import { createPublicClient, http, formatUnits, createWalletClient, custom, parseUnits } from 'viem';
import { bscTestnet } from 'viem/chains';
import { Wallet, RefreshCcw, ArrowUpRight, Copy, PlusCircle, Sparkles } from 'lucide-react';
import SendTokenModal from '../../components/SendTokenModal';
import Swal from 'sweetalert2';
import CollateralManager from '../../components/CollateralManager';
import LoadingSpinner from '../../components/LoadingSpinner';

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
];

const minERC20Abi = [
  { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  { constant: false, inputs: [{ name: "_to", type: "address" }, { name: "_value", type: "uint256" }], name: "transfer", outputs: [{ name: "success", type: "bool" }], type: "function" }
];

export default function WalletPage() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();

  const [balances, setBalances] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);

  // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [sendForm, setSendForm] = useState({ to: '', amount: '' });
  const [isSending, setIsSending] = useState(false);

  // Verificación directa en el objeto user de Privy
  const hasWallet = Boolean(user?.wallet?.address);

  const handleCreateWallet = async () => {
    try {
      setIsCreatingWallet(true);
      await createWallet();
      
      const isDark = document.documentElement.classList.contains("dark");
      Swal.fire({
        title: "¡Billetera Creada!",
        text: "Tu billetera Web3 ha sido generada exitosamente.",
        icon: "success",
        background: isDark ? "#1f2937" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#F26722",
      });
    } catch (error) {
      console.error("Error al crear la wallet:", error);
      Swal.fire({
        title: "Error",
        text: "No se pudo generar la billetera. Inténtalo nuevamente.",
        icon: "error",
        confirmButtonColor: "#F26722",
      });
    } finally {
      setIsCreatingWallet(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!user?.wallet?.address) return;
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
            const balanceRaw = await publicClient.getBalance({
              address: user.wallet.address,
            });
            newBalances[token.symbol] = formatUnits(balanceRaw, token.decimals);
          } else {
            const data = await publicClient.readContract({
              address: token.address,
              abi: minERC20Abi,
              functionName: 'balanceOf',
              args: [user.wallet.address],
            });
            newBalances[token.symbol] = formatUnits(data, token.decimals);
          }
        } catch (tokenError) {
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

      await wallet.switchChain(bscTestnet.id);
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        chain: bscTestnet, 
        transport: custom(provider) 
      });

      const amountInWei = parseUnits(sendForm.amount, selectedToken.decimals);
      
      const nextNonce = await publicClient.getTransactionCount({
        address: wallet.address,
        blockTag: 'pending',
      });

      let hash;

      if (selectedToken.symbol === 'BNB') {
        hash = await walletClient.sendTransaction({
          account: wallet.address,
          to: sendForm.to,
          value: amountInWei,
          nonce: nextNonce,
        });
      } else {
        hash = await walletClient.writeContract({
          address: selectedToken.address,
          abi: minERC20Abi,
          functionName: 'transfer',
          args: [sendForm.to, amountInWei],
          account: wallet.address,
          nonce: nextNonce,
        });
      }

      alert(`¡Envío exitoso! Hash: ${hash}`);
      setIsModalOpen(false);
      
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
    if (authenticated && hasWallet) {
      fetchAllBalances();
    }
  }, [authenticated, user?.wallet?.address]);

  if (!authenticated) return null;

  // 🔴 VISTA CUANDO EL USUARIO NO TIENE WALLET
  if (!hasWallet) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white dark:bg-[#252525] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xl text-center space-y-6">
        <div className="w-20 h-20 bg-[#F26722]/10 rounded-full flex items-center justify-center mx-auto">
          <Wallet className="text-[#F26722]" size={40} />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black uppercase tracking-tight dark:text-white">
            Activa tu Billetera
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
            Actualmente no posees una billetera Web3 vinculada. Generala en un solo clic para operar, recibir pagos y gestionar tus garantías en Mercado Nero.
          </p>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/30 text-left flex items-start gap-3">
          <Sparkles className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Sin frases de recuperación ni instalaciones extras. Tu billetera estará resguardada de forma segura mediante tu cuenta de acceso.
          </p>
        </div>

        <button
          onClick={handleCreateWallet}
          disabled={isCreatingWallet}
          className="w-full py-4 bg-[#F26722] hover:brightness-110 text-white rounded-2xl font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#F26722]/20 disabled:opacity-50"
        >
          {isCreatingWallet ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Generando billetera...</span>
            </>
          ) : (
            <>
              <PlusCircle size={20} />
              <span>Crear mi Billetera</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // 🟢 VISTA NORMAL CUANDO SÍ TIENE WALLET
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold dark:text-white">Mi Billetera</h2>
        <button 
          onClick={fetchAllBalances} 
          disabled={isLoading} 
          className="flex items-center gap-2 text-sm text-blue-600 font-medium disabled:opacity-50 hover:underline"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" />
              Actualizando...
            </>
          ) : (
            <>
              <RefreshCcw size={16} />
              Actualizar
            </>
          )}
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