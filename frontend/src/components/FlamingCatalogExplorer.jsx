import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import {
  Package,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Store,
  ImageOff,
  PackageCheck,
  PackageX,
  AlertTriangle,
  DownloadCloud,
  Loader2,
} from 'lucide-react';
import { InlineLoadingSpinner } from './LoadingSpinner.jsx';
import FlamingImportModal from './FlamingImportModal.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// FlamingCatalogExplorer
//
// Explorador del catálogo del proveedor Flaming.
//   - Vista de sólo lectura, paginada, con búsqueda.
//   - Click en producto → modal de importación individual (precarga el form).
//   - Botón "Importar catálogo completo" → bulk-import server-side.
//
// El llamado real a Flaming lo hace NUESTRO backend (/api/flaming/...).
// Las imágenes se muestran por HOTLINK (URL original), sin gastar Cloudinary.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

const formatPrice = (price, currency = 'ARS') => {
  if (price === null || price === undefined || isNaN(price)) return '—';
  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  let formatted = formatter.format(price);
  if (currency === 'USD') formatted = formatted.replace('US$', 'USD');
  return formatted;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de producto
// ─────────────────────────────────────────────────────────────────────────────
function FlamingProductCard({ product, onSelect }) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = product?.images?.[0]?.src || null;
  const inStock = Boolean(product?.isInStock);

  return (
    <div
      onClick={() => onSelect?.(product)}
      title="Importar a mi tienda"
      className="group bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden flex flex-col hover:border-[#F26722]/50 hover:shadow-lg hover:shadow-[#F26722]/5 transition-all cursor-pointer"
    >
      {/* Imagen (hotlink a Flaming) */}
      <div className="relative h-40 bg-white dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600">
            <ImageOff size={28} />
            <span className="text-[10px] font-medium">Sin imagen</span>
          </div>
        )}

        {/* Badge de stock */}
        <div
          className={`absolute top-2 left-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full backdrop-blur-sm ${
            inStock
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {inStock ? <PackageCheck size={11} /> : <PackageX size={11} />}
          {inStock ? 'En stock' : 'Sin stock'}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-3 flex flex-col flex-grow gap-1.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug min-h-[2.5rem]">
          {product?.name || '— sin nombre —'}
        </h3>

        <p className="text-[10px] text-gray-400 font-mono">
          ID {product?.id} {product?.sku ? `· SKU ${product.sku}` : ''}
        </p>

        {product?.categories?.length > 0 && (
          <span className="text-[10px] text-gray-400 truncate">
            {product.categories.map((c) => c.name).join(' · ')}
          </span>
        )}

        <div className="mt-auto pt-1 flex flex-col">
          {product?.onSale && product?.regularPrice > product?.price ? (
            <>
              <div className="text-[11px] text-gray-400 line-through">
                {formatPrice(product.regularPrice, product.currency)}
              </div>
              <div className="text-lg font-black text-[#F26722]">
                {formatPrice(product.price, product.currency)}
              </div>
            </>
          ) : (
            <div className="text-lg font-black text-gray-900 dark:text-white">
              {formatPrice(product?.price, product?.currency)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function FlamingCatalogExplorer() {
  const { getAccessToken } = usePrivy();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [selectedProduct, setSelectedProduct] = useState(null);

  // Estado del import masivo.
  const [bulkRunning, setBulkRunning] = useState(false);

  const serverUrl = import.meta.env.VITE_SERVER_URL;

  const loadProducts = useCallback(
    async (currentPage = 1, currentSearch = search) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const params = { page: Math.max(1, currentPage), perPage: PAGE_SIZE };
        if (currentSearch?.trim()) params.search = currentSearch.trim();

        const { data } = await axios.get(`${serverUrl}/api/flaming/productos`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });

        setProducts(data?.items || []);
        setTotal(data?.total || 0);
        setTotalPages(data?.totalPages || 1);
        setPage(Math.max(1, currentPage));
        setHasLoadedOnce(true);
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          'No se pudo obtener el catálogo del proveedor.';
        setError(msg);
        setProducts([]);
        setTotal(0);

        Swal.fire({
          title: 'Error al consultar el catálogo',
          text: msg,
          icon: 'error',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#F26722',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken, serverUrl, search]
  );

  useEffect(() => {
    loadProducts(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    loadProducts(1, searchInput);
  };

  const handleRefresh = () => loadProducts(page, search);

  const goToPage = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadProducts(newPage, search);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Import masivo ──
  const handleBulkImport = async () => {
    const confirm = await Swal.fire({
      title: '¿Importar todo el catálogo de Flaming?',
      html: `Se van a importar hasta <b>${total.toLocaleString('es-AR')}</b> productos
        a tu tienda, con su <b>precio final</b> y las imágenes originales (hotlink,
        sin gastar Cloudinary).<br/><br/>
        Los productos ya importados se omiten automáticamente.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, importar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#ffffff',
      confirmButtonColor: '#F26722',
      cancelButtonColor: '#444',
      customClass: { popup: 'rounded-3xl border border-gray-800' },
    });

    if (!confirm.isConfirmed) return;

    setBulkRunning(true);
    Swal.fire({
      title: 'Importando catálogo...',
      html: 'Esto puede tardar unos segundos. No cierres esta pestaña.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#1A1A1A',
      color: '#ffffff',
    });

    try {
      const token = await getAccessToken();
      const { data } = await axios.post(
        `${serverUrl}/api/flaming/bulk-import`,
        { skipExisting: true, maxImages: 3 },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const s = data?.summary || {};
      await Swal.fire({
        title: '¡Importación finalizada!',
        html: `
          <div style="text-align:left;font-size:14px">
            <p>✅ Creados: <b>${s.created ?? 0}</b></p>
            <p>⏭️ Omitidos (ya existían): <b>${s.skipped ?? 0}</b></p>
            <p>⚠️ Errores: <b>${s.errors ?? 0}</b></p>
            <p style="margin-top:8px;opacity:.7">Total procesados: ${s.total ?? 0}</p>
          </div>`,
        icon: 'success',
        background: '#1A1A1A',
        color: '#ffffff',
        confirmButtonColor: '#F26722',
        customClass: { popup: 'rounded-3xl border border-gray-800' },
      });

      loadProducts(1, search);
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || 'Error en la importación.';
      Swal.fire({
        title: 'Error al importar',
        text: msg,
        icon: 'error',
        background: '#1A1A1A',
        color: '#ffffff',
        confirmButtonColor: '#F26722',
        customClass: { popup: 'rounded-3xl border border-gray-800' },
      });
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#F26722]/10 text-[#F26722]">
            <Store size={20} />
          </div>
          <div>
            <h2 className="font-black text-sm uppercase tracking-wider text-gray-800 dark:text-white">
              Catálogo del Proveedor (Flaming)
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Vista del catálogo de Flaming. Importá todo o un producto puntual.
            </p>
          </div>

          {/* Import masivo */}
          <button
            onClick={handleBulkImport}
            disabled={bulkRunning || loading || total === 0}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase tracking-tight hover:bg-[#d9531e] transition-all disabled:opacity-50"
            title="Importar todo el catálogo a la tienda"
          >
            {bulkRunning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <DownloadCloud size={15} />
            )}
            <span className="hidden sm:inline">
              {bulkRunning ? 'Importando...' : 'Importar todo'}
            </span>
          </button>
        </div>

        {total > 0 && (
          <p className="mt-2 text-right text-[11px] font-bold text-gray-400">
            {total.toLocaleString('es-AR')} productos en el proveedor
          </p>
        )}

        {/* Barra de búsqueda */}
        <form onSubmit={handleSearch} className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nombre en Flaming..."
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#F26722]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase tracking-tight hover:bg-[#d9531e] transition-all disabled:opacity-50"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="Recargar"
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </form>
      </div>

      {/* Cuerpo */}
      <div className="p-5">
        {loading && products.length === 0 && (
          <div className="py-16 flex justify-center">
            <InlineLoadingSpinner size="lg" text="Consultando catálogo de Flaming..." />
          </div>
        )}

        {!loading && error && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={26} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              No se pudo cargar el catálogo
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 px-5 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase"
            >
              Reintentar
            </button>
          </div>
        )}

        {!error && products.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((p) => (
                <FlamingProductCard key={p.id} product={p} onSelect={setSelectedProduct} />
              ))}
            </div>

            {/* Paginación */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={loading || page <= 1}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={15} /> Anterior
              </button>

              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                Página {page} de {totalPages}
              </span>

              <button
                onClick={() => goToPage(page + 1)}
                disabled={loading || page >= totalPages}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}

        {!loading && !error && hasLoadedOnce && products.length === 0 && (
          <div className="py-14 flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-500/10 flex items-center justify-center">
              <Package size={26} className="text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              No se encontraron productos
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Probá con otro término de búsqueda.
            </p>
          </div>
        )}
      </div>

      {/* Nota informativa */}
      <div className="px-5 py-3 bg-blue-500/5 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2">
        <AlertTriangle size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Los productos importados usan el <b>precio final de Flaming</b> y sus
          categorías se mapean a las de la plataforma. Las imágenes se muestran
          por <b>hotlink</b> (URL original) para no gastar créditos de Cloudinary.
        </p>
      </div>

      {/* Modal de importación individual */}
      <FlamingImportModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
