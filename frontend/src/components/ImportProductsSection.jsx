import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';
import Swal from 'sweetalert2';
import {
  Import,
  FileSpreadsheet,
  Link as LinkIcon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

const MAX_LINKS = 5;

export const ImportSection = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { getAccessToken, authenticated } = usePrivy();
  const [links, setLinks] = useState(['']);
  const [isImporting, setIsImporting] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);

  const addLink = () => {
    if (links.length < MAX_LINKS) {
      setLinks([...links, '']);
    }
  };

  const removeLink = (index) => {
    if (links.length > 1) {
      const filtered = links.filter((_, i) => i !== index);
      setLinks(filtered);
    }
  };

  const updateLink = (value, index) => {
    const updated = [...links];
    updated[index] = value;
    setLinks(updated);
  };

    const validLinks = links.map((l) => l.trim()).filter(Boolean);

  // ⚠️ CARGA MASIVA DESHABILITADA TEMPORALMENTE
  const handleImport = async () => {
    if (!isImporting) {
      setIsImporting(true);
      setTimeout(() => setIsImporting(false), 600);
    }
    return Swal.fire({
      title: 'Importación temporalmente deshabilitada',
      text: 'La sincronización con Mercado Libre está momentáneamente suspendida por cambios en sus políticas de acceso. Estamos trabajando para reactivarla con una solución estable. Disculpá las molestias.',
      icon: 'info',
      background: '#1A1A1A',
      color: '#ffffff',
      confirmButtonColor: '#2563eb',
      customClass: { popup: 'rounded-3xl border border-gray-800' },
    });
  };

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
          isOpen ? 'max-h-[900px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-1 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-[32px] border border-blue-500/10">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-[30px] p-6 flex flex-col gap-6">
            {/* Header + Acciones */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
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
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className={`md:w-[200px] flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-xs transition-all dark:text-white ${
                    showLinkForm
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}
                >
                  <LinkIcon size={16} />
                  IMPORTAR POR LINK
                </button>

                <button
                  className="md:w-[200px] flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-tighter"
                >
                  <FileSpreadsheet size={16} />
                  Subir CSV / Excel
                </button>
              </div>
            </div>

            {/* Formulario de Links (Mercado Libre) */}
            {showLinkForm && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 bg-yellow-400 rounded-md flex items-center justify-center">
                    <span className="text-[10px] font-black text-yellow-950">ML</span>
                  </div>
                  <h4 className="font-black text-sm dark:text-white uppercase tracking-tight">
                    Importar desde Mercado Libre
                  </h4>
                  <span className="ml-auto text-[10px] font-bold uppercase text-gray-400">
                    {links.length}/{MAX_LINKS}
                  </span>
                </div>

                <div className="space-y-3">
                  {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => updateLink(e.target.value, index)}
                        placeholder="https://articulo.mercadolibre.com.ar/MLA-XXXX-..."
                        className="flex-1 px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => removeLink(index)}
                        disabled={links.length === 1}
                        className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-red-500 dark:text-gray-300 disabled:opacity-30"
                        title="Quitar link"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {links.length < MAX_LINKS && (
                  <button
                    onClick={addLink}
                    className="mt-3 flex items-center gap-2 text-blue-600 text-xs font-bold hover:text-blue-700 transition-colors"
                  >
                    <Plus size={16} /> Agregar otro link
                  </button>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Traemos título, precio, fotos y descripción.
                  </p>
                  <button
                    onClick={handleImport}
                    disabled={isImporting || validLinks.length === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Importando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> IMPORTAR ({validLinks.length})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
