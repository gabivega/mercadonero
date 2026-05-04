import { ArrowUpRight, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { isAddress } from 'viem'; // Importamos el validador

export default function SendTokenModal({ 
  isOpen, onClose, token, balance, formData, setFormData, onConfirm, isLoading, txStatus 
}) {
  if (!isOpen || !token) return null;

  // Validaciones
  const isValidAddr = formData.to === '' || isAddress(formData.to);
  const isInsufficient = Number(formData.amount) > Number(balance);
  const isZero = Number(formData.amount) <= 0;
  
  const isDisabled = !isAddress(formData.to) || isZero || isInsufficient || isLoading;

  // Si la transacción fue exitosa, mostramos pantalla de éxito
  if (txStatus === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-2xl p-8 text-center space-y-4 border border-gray-200 dark:border-gray-800">
          <div className="flex justify-center"><CheckCircle2 size={64} className="text-green-500" /></div>
          <h3 className="text-2xl font-bold dark:text-white">¡Envío Exitoso!</h3>
          <p className="text-gray-500">Tus tokens están en camino a la red.</p>
          <button onClick={onClose} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
            <ArrowUpRight className="text-blue-500" size={20} /> Enviar {token.symbol}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Input Dirección con error visual */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Dirección de destino</label>
            <input 
              type="text"
              placeholder="0x..."
              className={`w-full bg-gray-50 dark:bg-[#252525] border rounded-xl px-4 py-3 outline-none transition-all font-mono text-sm dark:text-white ${!isValidAddr ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-blue-500'}`}
              value={formData.to}
              onChange={(e) => setFormData({...formData, to: e.target.value})}
            />
            {!isValidAddr && <p className="text-red-500 text-[10px] mt-1 font-bold">Dirección de wallet inválida</p>}
          </div>

          {/* Input Monto */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="block text-xs font-bold text-gray-400 uppercase">Monto</label>
              <button onClick={() => setFormData({...formData, amount: balance})} className="text-xs text-blue-500 font-bold">Máximo: {parseFloat(balance || 0).toFixed(4)}</button>
            </div>
            <div className="relative">
              <input 
                type="number"
                placeholder="0.00"
                className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold dark:text-white pr-16"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">{token.symbol}</span>
            </div>
            {isInsufficient && <p className="text-red-500 text-xs mt-2 font-medium italic">Saldo insuficiente</p>}
          </div>

          {/* Feedback de error de la Tx */}
          {txStatus === 'error' && (
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg flex items-center gap-2 text-red-600 text-xs font-medium border border-red-200 dark:border-red-800">
              <AlertCircle size={14} /> Hubo un problema al procesar la transacción.
            </div>
          )}

          <button 
            disabled={isDisabled}
            onClick={onConfirm}
            className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${isDisabled ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'}`}
          >
            {isLoading ? "Procesando firma..." : 'Confirmar Envío'}
          </button>
        </div>
      </div>
    </div>
  );
}