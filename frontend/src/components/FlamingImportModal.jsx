import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import { X, ImageOff, CloudDownload, BadgeCheck } from 'lucide-react';
import ProductForm from './ProductForm.jsx';
import {
  flamingToProductForm,
  buildFlamingProviderRef,
} from '../Utils/flamingAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// FlamingImportModal
//
// Modal de importación INDIVIDUAL de un producto de Flaming a la tienda.
//
// A diferencia de ElitImportModal, NO subimos imágenes a Cloudinary: usamos las
// URLs originales de Flaming (hotlink). Por eso el submit es más directo: sólo
// creamos el producto con las imágenes tal cual vienen.
// ─────────────────────────────────────────────────────────────────────────────

export default function FlamingImportModal({
  product, // producto normalizado de Flaming
  isOpen,
  onClose,
  onImported,
}) {
  const { getAccessToken } = usePrivy();
  const [initialData, setInitialData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imgError, setImgError] = useState(false);

  const serverUrl = import.meta.env.VITE_SERVER_URL;

  // Precarga el initialData del form con las URLs de imagen originales.
  const prepareImport = useCallback(() => {
    if (!product) return;

    const urls = (product.images || [])
      .map((img) => img.src)
      .filter(Boolean)
      .slice(0, 5);

    const images = urls.map((url, i) => ({ url, isMain: i === 0 }));

    setInitialData(flamingToProductForm(product, { images }));
  }, [product]);

  useEffect(() => {
    if (isOpen && product) {
      prepareImport();
    }
    if (!isOpen) {
      setInitialData(null);
      setImgError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product]);

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();

      if (!formData.images || formData.images.length === 0) {
        throw new Error('El producto no tiene imágenes.');
      }

      const body = {
        ...formData,
        images: formData.images.map((img) => ({
          url: img.url,
          isMain: img.isMain,
        })),
        listingType: 'product',
        providerRef: buildFlamingProviderRef(product),
      };

      const { data } = await axios.post(
        `${serverUrl}/api/product/create`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        await Swal.fire({
          title: '¡Importado a tu tienda!',
          text: 'El producto de Flaming ya está publicado.',
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

  if (!isOpen || !product) return null;

  const imageUrl = product.images?.[0]?.src || null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-gray-50 dark:bg-[#121212] w-full max-w-3xl rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl my-4">
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
              <p className="text-[10px] font-black uppercase tracking-wider text-[#3483fa]">
                Importar desde Flaming
              </p>
              <span className="text-[10px] font-mono text-gray-400">ID {product.id}</span>
            </div>
            <h3 className="font-bold text-sm dark:text-white truncate">
              {product.name}
            </h3>
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

        {/* Cuerpo */}
        <div className="p-4 sm:p-5">
          {initialData ? (
            <>
              <div className="mb-3 flex items-start gap-2 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                <BadgeCheck size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 dark:text-blue-400">
                  Revisá el <b>precio</b> y la <b>categoría</b> (ya viene mapeada a las
                  de la plataforma). Las imágenes se usan por <b>hotlink</b> (URL
                  original), sin gastar Cloudinary.
                </p>
              </div>

              <ProductForm
                initialData={initialData}
                handleSubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            </>
          ) : (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <CloudDownload size={32} className="text-gray-400" />
              <p className="text-sm text-gray-500">No se pudo preparar la importación.</p>
              <button
                onClick={prepareImport}
                className="px-5 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
