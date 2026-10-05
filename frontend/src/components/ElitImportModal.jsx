import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import { X, ImageOff, CloudDownload, BadgeCheck } from 'lucide-react';
import ProductForm from './ProductForm.jsx';
import {
  elitToProductForm,
  buildProviderRef,
  priceWithMarkup,
  DEFAULT_MARKUP,
} from '../Utils/elitAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// ElitImportModal
//
// Modal de importación de un producto de Elit a la tienda.
//  1. Al abrir, precarga el ProductForm con nombre, marca, precio (+markup),
//     stock y las imágenes del proveedor (como preview SIN subir todavía).
//  2. El usuario ajusta categoría/subcategoría/precio e imágenes si quiere.
//  3. Recién al PUBLICAR se suben las imágenes de Elit a NUESTRO Cloudinary.
//
// Al publicar, se envía `providerRef` para tener trazabilidad con el origen.
// ─────────────────────────────────────────────────────────────────────────────

export default function ElitImportModal({
  product, // producto crudo de Elit
  isOpen,
  onClose,
  onImported, // callback opcional tras publicar con éxito
}) {
  const { getAccessToken } = usePrivy();
  const [initialData, setInitialData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imgError, setImgError] = useState(false);

  const serverUrl = import.meta.env.VITE_SERVER_URL;
  const cost = Number(product?.pvp_ars) || 0;
  const suggested = priceWithMarkup(cost, DEFAULT_MARKUP);

  // ── Precarga el initialData SIN subir imágenes ──
  // Las imágenes de Elit se muestran como preview y quedan marcadas con
  // `pendingElitUrl`; se suben a Cloudinary recién al publicar.
  const prepareImport = useCallback(() => {
    if (!product) return;

    // Recolectamos las URLs de imágenes que trae Elit.
    let urlList = [];
    if (Array.isArray(product.imagenes) && product.imagenes.length > 0) {
      urlList = product.imagenes;
    } else if (product.imagen) {
      urlList = [product.imagen];
    }
    // Máximo 5 (límite del form).
    urlList = urlList.filter(Boolean).slice(0, 5);

    // Preview local: apuntamos a la URL del proveedor y marcamos que hay que
    // subirla al publicar. `url` es lo que ve el form; `pendingElitUrl` es el
    // origen real que se subirá a Cloudinary.
    const previewImages = urlList.map((url, i) => ({
      url,
      isMain: i === 0,
      pendingElitUrl: url,
    }));

    // Armamos el initialData que consume el ProductForm.
    setInitialData(
      elitToProductForm(product, { images: previewImages, markup: DEFAULT_MARKUP })
    );
  }, [product]);

  useEffect(() => {
    if (isOpen && product) {
      prepareImport();
    }
    // Reset al cerrar
    if (!isOpen) {
      setInitialData(null);
      setImgError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product]);

  // ── Sube a Cloudinary las imágenes de Elit pendientes ──
  // Devuelve el array final de imágenes (las ya subidas + las nuevas de Elit),
  // y cuántas fallaron.
  const resolveImages = async (images = []) => {
    const pending = images.filter((img) => img?.pendingElitUrl);
    const already = images.filter((img) => !img?.pendingElitUrl);

    if (pending.length === 0) {
      return { images: already, failed: 0 };
    }

    const token = await getAccessToken();
    const { data } = await axios.post(
      `${serverUrl}/api/elit/import-images`,
      { urls: pending.map((img) => img.pendingElitUrl), folder: 'elit' },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const uploaded = (data?.images || []).map((img) => ({ url: img.url }));

    // Reconstruimos el array preservando el orden original y el flag isMain.
    let uploadedIdx = 0;
    const resolved = images
      .map((img) => {
        if (!img?.pendingElitUrl) return img;
        const up = uploaded[uploadedIdx];
        uploadedIdx += 1;
        return up ? { url: up.url, isMain: img.isMain } : null; // null si falló
      })
      .filter(Boolean);

    // Garantizamos que quede una principal.
    if (resolved.length > 0 && !resolved.some((i) => i.isMain)) {
      resolved[0].isMain = true;
    }

    return { images: resolved, failed: data?.failedCount || 0 };
  };

  // ── Submit: sube las imágenes pendientes y recién ahí crea el producto ──
  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();

      // 1. Subimos las imágenes de Elit a Cloudinary (si quedan pendientes).
      const { images: finalImages, failed } = await resolveImages(formData.images || []);

      if (finalImages.length === 0) {
        throw new Error(
          'No hay imágenes válidas. Subí al menos una foto del producto.'
        );
      }

      if (failed > 0) {
        Swal.fire({
          title: 'Algunas imágenes no se subieron',
          text: `${failed} imagen(es) del proveedor no se pudieron subir y se descartaron.`,
          icon: 'warning',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#F26722',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
      }

      const body = {
        ...formData,
        images: finalImages,
        listingType: 'product',
        // El form ya trae currency, stock, condition, shipping, etc.
        providerRef: buildProviderRef(product),
      };

      const { data } = await axios.post(
        `${serverUrl}/api/product/create`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        await Swal.fire({
          title: '¡Importado a tu tienda!',
          text: 'El producto de Elit ya está publicado.',
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

  const imageUrl = product.imagen || product.imagenes?.[0] || null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-gray-50 dark:bg-[#121212] w-full max-w-3xl rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl my-4">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1A1A1A] border-b border-gray-100 dark:border-gray-800 px-5 py-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center">
            {imageUrl && !imgError ? (
              <img
                src={imageUrl}
                alt={product.nombre}
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
                Importar desde Elit
              </p>
              <span className="text-[10px] font-mono text-gray-400">ID {product.id}</span>
            </div>
            <h3 className="font-bold text-sm dark:text-white truncate">
              {product.nombre}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Costo proveedor:{' '}
              <b>${cost.toLocaleString('es-AR')}</b> · Sugerido (+20%):{' '}
              <b className="text-[#F26722]">${suggested.toLocaleString('es-AR')}</b>
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
              {/* Aviso */}
              <div className="mb-3 flex flex-col gap-2">
                <div className="flex items-start gap-2 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                  <BadgeCheck size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    Revisá el <b>precio</b> y elegí <b>categoría / subcategoría</b>:
                    Elit usa categorías propias que no coinciden con las de la plataforma.
                    Las fotos se suben al <b>publicar</b>.
                  </p>
                </div>
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
