import React, { useState } from 'react';
import { Import, FileSpreadsheet, Link as LinkIcon, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export const ImportSection = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-8 w-full transition-all duration-300 mt-5">
      {/* Botón Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-5 rounded-[24px] border transition-all duration-300 ${
          isOpen 
            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20' 
            : 'bg-white dark:bg-[#1A1A1A] border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-blue-500/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isOpen ? 'bg-white/20' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600'}`}>
            <Import size={20} />
          </div>
          <div className="text-left">
            <span className="block font-black text-sm uppercase tracking-wider">Carga Masiva e Importación</span>
            {!isOpen && <span className="text-[10px] opacity-60 uppercase font-bold">Mercado Libre, Amazon, CSV...</span>}
          </div>
        </div>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* Contenido Expandible */}
      <div 
        className={`overflow-hidden transition-all duration-500 ease-in-out ${
          isOpen ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-1 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-[32px] border border-blue-500/10">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-[30px] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-500" />
                <h3 className="font-black text-[11px] uppercase tracking-wider dark:text-white text-gray-500">Optimiza tu inventario</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">
                Sincronizá tus productos de otras plataformas en segundos.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 w-full md:w-auto">
              <button 
                // onClick={() => console.log('Scraping modal')}
                className="md:w-[200px] flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl font-bold text-xs transition-all dark:text-white"
              >
                <LinkIcon size={16} />
                IMPORTAR POR LINK
              </button>

              <button 
                // onClick={() => console.log('CSV modal')}
                className="md:w-[200px] flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-tighter"
              >
                <FileSpreadsheet size={16} />
                Subir CSV / Excel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
