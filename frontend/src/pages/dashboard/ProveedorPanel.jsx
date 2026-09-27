import React from 'react';
import { Server, RefreshCw, Package } from 'lucide-react';
import ElitCatalogExplorer from '../../components/ElitCatalogExplorer.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ProveedorPanel
//
// Panel privado (solo admin) para explorar el catálogo del proveedor Elit e
// importar productos a la tienda. Reutiliza ElitCatalogExplorer que, a su vez,
// pega contra NUESTRO backend (las credenciales de Elit nunca llegan al cliente).
// ─────────────────────────────────────────────────────────────────────────────

export default function ProveedorPanel() {
  return (
    <div className="w-full space-y-6 py-4">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="p-3 rounded-2xl bg-[#F26722]/10 text-[#F26722]">
          <Server size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            Aprovisionamiento
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Explorá el catálogo de tu proveedor e importá productos a tu tienda.
          </p>
        </div>
      </div>

      {/* Aviso de flujo */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800/60">
        <Package size={18} className="text-[#F26722] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed">
          Al hacer click en un producto, se abre un formulario <b>precargado</b> con
          los datos del proveedor (título, marca, precio con markup del 10%, stock).
          Las imágenes se copian a <b>tu cuenta de Cloudinary</b> para no depender
          de las URLs del proveedor. Revisá la categoría y el precio antes de publicar.
        </p>
      </div>

      {/* Explorador */}
      <ElitCatalogExplorer />
    </div>
  );
}
