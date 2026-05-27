// Alerta de Prototipo Ficticio permanente
function DisclaimerBanner() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-red-600 dark:bg-red-700 scroll-x-hidden text-white py-2.5 px-4 text-center shadow-[0_-4px_10px_rgba(0,0,0,0.15)] select-none border-t border-red-500">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        <span className="bg-white text-red-600 px-1.5 py-0.5 rounded text-[10px] uppercase font-black animate-pulse">
          Atención
          </span>
        <span>
          Este sitio es un prototipo funcional - Ningún producto está a la venta y no se realizan transacciones reales.
        </span>
      </div>
    </div>
  );
}
export default DisclaimerBanner;