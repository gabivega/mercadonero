import React, { useState } from 'react';
import { Server, Package, RefreshCw, Wine } from 'lucide-react';
import ElitCatalogExplorer from '../../components/ElitCatalogExplorer.jsx';
import ElitSyncPanel from '../../components/ElitSyncPanel.jsx';
import FlamingCatalogExplorer from '../../components/FlamingCatalogExplorer.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ProveedorPanel
//
// Panel privado (solo admin) de aprovisionamiento. Está organizado en PESTAÑAS
// por proveedor, para poder sumar otros (Distribuidora X, etc.) más adelante.
//
//   - Catálogo:  explorar el catálogo e importar productos a la tienda.
//   - Sync:      comparar/aplicar stock y precios contra el proveedor.
//
// Cada pestaña pega contra NUESTRO backend (las credenciales del proveedor
// nunca llegan al cliente).
// ─────────────────────────────────────────────────────────────────────────────

// Definición de proveedores disponibles.
//   - elit:    proveedor tech (API propia con credenciales, sync de stock/precio).
//   - flaming: proveedor bebidas/almacén (Woo Store API pública, import masivo).
const PROVIDERS = [
  { id: 'elit', label: 'Elit', icon: Server },
  { id: 'flaming', label: 'Flaming', icon: Wine },
];

// Pestañas de cada proveedor. Flaming no tiene sync (todavía): sólo catálogo.
const TABS_BY_PROVIDER = {
  elit: [
    { id: 'catalogo', label: 'Catálogo', icon: Package },
    { id: 'sync', label: 'Sincronizar stock/precios', icon: RefreshCw },
  ],
  flaming: [
    { id: 'catalogo', label: 'Catálogo', icon: Package },
  ],
};

export default function ProveedorPanel() {
  const [activeProvider, setActiveProvider] = useState('elit');
  const [activeTab, setActiveTab] = useState('catalogo');

  const providerMeta = PROVIDERS.find((p) => p.id === activeProvider) || PROVIDERS[0];
  const ProviderIcon = providerMeta.icon;
  const tabs = TABS_BY_PROVIDER[activeProvider] || TABS_BY_PROVIDER.elit;

  return (
    <div className="w-full space-y-6 py-4">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="p-3 rounded-2xl bg-[#F26722]/10 text-[#F26722]">
          <ProviderIcon size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            Aprovisionamiento
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Gestioná tus proveedores: catálogo, importación y sincronización.
          </p>
        </div>
      </div>

      {/* Selector de proveedor */}
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const active = p.id === activeProvider;
          return (
            <button
              key={p.id}
              onClick={() => { setActiveProvider(p.id); setActiveTab('catalogo'); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-tight transition-all ${
                active
                  ? 'bg-[#F26722] text-white'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <Icon size={15} />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Pestañas internas del proveedor */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-gray-100 dark:bg-white/5 w-full sm:w-fit overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                active
                  ? 'bg-white dark:bg-[#1A1A1A] text-[#F26722] shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Aviso de flujo (sólo en Catálogo) */}
      {activeTab === 'catalogo' && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800/60">
          <Package size={18} className="text-[#F26722] flex-shrink-0 mt-0.5" />
          {activeProvider === 'elit' ? (
            <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed">
              Al hacer click en un producto, se abre un formulario <b>precargado</b> con
              los datos del proveedor (título, marca, precio con markup, stock).
              Las imágenes se copian a <b>tu cuenta de Cloudinary</b> para no depender
              de las URLs del proveedor. Revisá la categoría y el precio antes de publicar.
            </p>
          ) : (
            <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed">
              Importá todo el catálogo de Flaming con un click o un producto puntual.
              Se usa el <b>precio final del proveedor</b> y las categorías se mapean
              a las de la plataforma. Las imágenes van por <b>hotlink</b> (sin Cloudinary).
            </p>
          )}
        </div>
      )}

      {/* Contenido de la pestaña */}
      {activeProvider === 'elit' && activeTab === 'catalogo' && <ElitCatalogExplorer />}
      {activeProvider === 'elit' && activeTab === 'sync' && <ElitSyncPanel />}
      {activeProvider === 'flaming' && activeTab === 'catalogo' && <FlamingCatalogExplorer />}
    </div>
  );
}
