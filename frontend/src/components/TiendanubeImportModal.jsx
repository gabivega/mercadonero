import React, { useState } from 'react';
import axios from 'axios';
import { usePrivy } from "../Utils/authClient";
import Swal from 'sweetalert2';
import { X, ImageOff, CloudDownload, BadgeCheck, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TiendanubeImportModal
//
// Modal de importación INDIVIDUAL de un producto de Tiendanube (Santiago
// Deportes) a la tienda del admin.
//
// A diferencia del de Directcar (que precarga el ProductForm completo), acá
// mostramos un PREVIEW compacto con los datos ya normalizados por el backend y
// un botón "Importar". El submit pega a /api/tiendanube/import, que arma y
// guarda el producto server-side (precio final, categoría mapeada, 1 imagen).
// ─────────────────────────────────────────────────────────────────────────────

const formatPrice = (price, currency = 'ARS') => {
  if (price === null || price === undefined || isNaN(price)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

export default function TiendanubeImportModal({ product, isOpen, onClose, onImported }) {
  const { getAccessToken } = usePrivy();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imgError, setImgError] = useState(false);

  const serverUrl = import.meta.env.VITE_SERVER_URL;

  if (!isOpen || !product) return null;

  const imageUrl = product.images?.[0]?.src || null;

  const handleImport = async () => {
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.post(
        `${serverUrl}/api/tiendanube/import`,
        { product },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 }
      );

      if (data.success) {
        await Swal.fire({
          title: '¡Importado a tu tienda!',
          text: 'El producto de Santiago Deportes ya está publicado.',
          icon: 'success',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#F26722',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
        onImported?.(data.product);
        onClose();
      } else {
        throw new Error(data.message || 'Error al publicar');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Error al publicar.';
      Swal.fire({
        title: 'Error al publicar',
        text: msg,
        icon: 'error',
        background: '#1A1A1A',
        color: '#ffffff',
        confirmButtonColor: '#F26722',
        customClass: { popup: 'rounded-3xl border border-gray-800' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-gray-50 dark:bg-[#121212] w-full max-w-xl rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl my-4">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1A1A1A] border-b border-gray-100 dark:border-gray-800 px-5 py-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center">
            {imageUrl && !imgError ? (
              <img
                src={imageUrl}
                alt={product.name}
                onError={() => setImgError(true)}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <ImageOff size={20} className="text-gray-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#F26722]">
                Importar desde Santiago Deportes
              </p>
              <span className="text-[10px] font-mono text-gray-400">ID {product.id}</span>
            </div>
            <h3 className="font-bold text-sm dark:text-white truncate">{product.name}</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Precio proveedor:{' '}
              <b className="text-[#F26722]">
                ${Number(product.price || 0).toLocaleString('es-AR')}
              </b>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-all"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo: preview de datos */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/20">
            <BadgeCheck size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 dark:text-blue-400">
              El producto se publica con el <b>precio final</b> de la tienda, su
              <b> categoría</b> mapeada a Deportes y Fitness y <b>1 imagen</b> por
              hotlink (sin gastar Cloudinary).
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-gray-400 font-semibold">SKU</dt>
              <dd className="text-gray-800 dark:text-gray-100 font-mono">{product.sku || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 font-semibold">Stock</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {product.isInStock ? `${product.stock} u.` : 'Sin stock'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 font-semibold">Precio</dt>
              <dd className="text-gray-800 dark:text-gray-100 font-bold">
                {formatPrice(product.price, product.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 font-semibold">Precio lista</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {product.onSale ? formatPrice(product.listPrice, product.currency) : '—'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-400 font-semibold">Categoría (proveedor)</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {product.categoryBreadcrumb?.length
                  ? product.categoryBreadcrumb.join(' > ')
                  : '—'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-400 font-semibold">Descripción</dt>
              <dd className="text-gray-600 dark:text-gray-300 line-clamp-4 whitespace-pre-line">
                {product.description || '—'}
              </dd>
            </div>
          </dl>

          <button
            onClick={handleImport}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#F26722] text-white rounded-xl font-bold text-sm uppercase tracking-tight hover:bg-[#d9531e] transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CloudDownload size={16} />
            )}
            {isSubmitting ? 'Importando...' : 'Importar a mi tienda'}
          </button>
        </div>
      </div>
    </div>
  );
}
