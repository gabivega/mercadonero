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
  Server,
  Store,
  ImageOff,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PackageCheck,
  PackageX,
} from 'lucide-react';
import { InlineLoadingSpinner } from './LoadingSpinner.jsx';
import ElitImportModal from './ElitImportModal.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ElitCatalogExplorer
//
// Explorador del catálogo del proveedor Elit.
// Permite VER los productos y, al clickear uno, abrir un modal que precarga
// el formulario de publicación (importación a la tienda).
//
// El llamado real a Elit se hace a través de NUESTRO backend
// (GET /api/elit/productos), que es el único que conoce las credenciales.
// Este componente nunca ve el user_id ni el token del proveedor.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24; // ítems por página (máx. permitido por Elit: 100)

// Elit usa un `offset` BASADO EN 1 (offset=1 → primer ítem del catálogo).
// offset=0 lo rechaza ("must be greater than or equal to 1").
// Convertimos un número de página (1-based) a offset de Elit.
const FIRST_OFFSET = 1;
const pageToOffset = (page) => (Math.max(1, page) - 1) * PAGE_SIZE + FIRST_OFFSET;

// Opciones de depósito/sucursal según la doc de Elit.
const STORE_OPTIONS = [
  { value: 'all', label: 'Todos los depósitos' },
  { value: 'cd', label: 'CD' },
  { value: 'suc', label: 'Sucursal' },
  { value: 'cordoba', label: 'Córdoba' },
  { value: 'cba', label: 'CBA' },
];

// ── Formato de precios ───────────────────────────────────────────────────────
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

// ── Badge de nivel de stock ──────────────────────────────────────────────────
const stockMeta = (nivel, stockTotal) => {
  const n = Number(stockTotal) || 0;
  const level = (nivel || '').toLowerCase();

  if (level === 'alto' || n >= 10) {
    return { label: 'Stock alto', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10', Icon: PackageCheck };
  }
  if (level === 'medio' || (n > 0 && n < 10)) {
    return { label: 'Stock medio', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', Icon: Package };
  }
  if (n <= 0) {
    return { label: 'Sin stock', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', Icon: PackageX };
  }
  return { label: 'Stock', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-500/10', Icon: Package };
};

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de producto
// ─────────────────────────────────────────────────────────────────────────────
function ElitProductCard({ product, onSelect }) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = product?.imagen || product?.imagenes?.[0] || null;
  const { label, color, bg, Icon } = stockMeta(product?.nivel_stock, product?.stock_total);

  return (
    <div
      onClick={() => onSelect?.(product)}
      title="Importar a mi tienda"
      className="group bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden flex flex-col hover:border-[#F26722]/50 hover:shadow-lg hover:shadow-[#F26722]/5 transition-all cursor-pointer"
    >
      {/* Imagen */}
      <div className="relative h-40 bg-white dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.nombre}
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
        <div className={`absolute top-2 left-2 flex items-center gap-1 ${bg} ${color} text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full backdrop-blur-sm`}>
          <Icon size={11} />
          {product?.stock_total ?? 0} u.
        </div>
      </div>

      {/* Contenido */}
      <div className="p-3 flex flex-col flex-grow gap-1.5">
        <div className="flex items-center gap-1.5">
          {product?.marca && (
            <span className="text-[10px] font-black uppercase tracking-wider text-[#3483fa] truncate">
              {product.marca}
            </span>
          )}
        </div>

        <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug min-h-[2.5rem]">
          {product?.nombre || '— sin nombre —'}
        </h3>

        <p className="text-[10px] text-gray-400 font-mono">
          ID {product?.id} {product?.codigo_producto ? `· SKU ${product.codigo_producto}` : ''}
        </p>

        <div className="mt-auto pt-1 flex flex-col">
          <div className="text-lg font-black text-gray-900 dark:text-white">
            {formatPrice(product?.pvp_ars, 'ARS')}
          </div>
          {product?.pvp_usd ? (
            <div className="text-[11px] text-gray-400">
              {formatPrice(product.pvp_usd, 'USD')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function ElitCatalogExplorer() {
  const { getAccessToken } = usePrivy();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Estado de paginación
  const [page, setPage] = useState(1); // página actual (1-based)
  const [total, setTotal] = useState(0);

  // Filtros
  const [searchInput, setSearchInput] = useState(''); // lo que escribe el usuario
  const [filters, setFilters] = useState({ nombre: '', store: 'all' });

  // Producto de Elit seleccionado para importar (abre el modal).
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Ocultar productos sin stock (stock_total === 0). Activado por defecto.
  const [hideOutOfStock, setHideOutOfStock] = useState(true);

  // Lista visible: si está activo el filtro, quitamos los de stock 0.
  const visibleProducts = useMemo(() => {
    if (!hideOutOfStock) return products;
    return products.filter((p) => (Number(p?.stock_total) || 0) > 0);
  }, [products, hideOutOfStock]);

  const hiddenByStock = products.length - visibleProducts.length;

  const totalPages = useMemo(
    () => (total > 0 ? Math.ceil(total / PAGE_SIZE) : 1),
    [total]
  );

  const serverUrl = import.meta.env.VITE_SERVER_URL;

  // ── Llamado al proxy del backend ──
  // Recibe un número de PÁGINA (1-based) y lo traduce al offset de Elit.
  const loadProducts = useCallback(
    async (currentPage = 1, currentFilters = filters) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const safePage = Math.max(1, currentPage);

        const params = {
          limit: PAGE_SIZE,
          offset: pageToOffset(safePage),
          store: currentFilters.store || 'all',
        };
        if (currentFilters.nombre?.trim()) {
          params.nombre = currentFilters.nombre.trim();
        }

        const { data } = await axios.get(`${serverUrl}/api/elit/productos`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });

        setProducts(data?.resultado || []);
        setTotal(data?.paginador?.total || 0);
        setPage(safePage);
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
    [getAccessToken, serverUrl, filters]
  );

  // Primera carga
  useEffect(() => {
    loadProducts(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Acciones ──
  const handleSearch = (e) => {
    e.preventDefault();
    const next = { ...filters, nombre: searchInput };
    setFilters(next);
    loadProducts(1, next);
  };

  const handleStoreChange = (e) => {
    const next = { ...filters, store: e.target.value };
    setFilters(next);
    loadProducts(1, next);
  };

  const handleRefresh = () => loadProducts(page, filters);

  const goToPage = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadProducts(newPage, filters);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#F26722]/10 text-[#F26722]">
            <Server size={20} />
          </div>
          <div>
            <h2 className="font-black text-sm uppercase tracking-wider text-gray-800 dark:text-white">
              Catálogo del Proveedor (Elit)
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Vista de sólo lectura para validar la sincronización de stock y precios.
            </p>
          </div>
          {total > 0 && (
            <span className="ml-auto text-[11px] font-bold text-gray-400 whitespace-nowrap">
              {total.toLocaleString('es-AR')} productos
            </span>
          )}
        </div>

        {/* Barra de filtros */}
        <div className="mt-4 flex flex-col md:flex-row gap-2">
          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por nombre..."
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
          </form>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={filters.store}
                onChange={handleStoreChange}
                disabled={loading}
                className="pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-semibold dark:text-white focus:outline-none focus:border-[#F26722] appearance-none cursor-pointer"
              >
                {STORE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="dark:bg-zinc-900">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Recargar"
              className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Toggle: ocultar productos sin stock */}
            <button
              type="button"
              onClick={() => setHideOutOfStock((v) => !v)}
              title={hideOutOfStock ? 'Mostrar productos sin stock' : 'Ocultar productos sin stock'}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                hideOutOfStock
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10'
              }`}
            >
              <PackageX size={15} />
              <span className="hidden sm:inline">
                {hideOutOfStock ? 'Sin stock oculto' : 'Mostrando sin stock'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="p-5">
        {/* Estado de carga inicial */}
        {loading && products.length === 0 && (
          <div className="py-16 flex justify-center">
            <InlineLoadingSpinner size="lg" text="Consultando catálogo de Elit..." />
          </div>
        )}

        {/* Estado de error */}
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

        {/* Grilla de productos */}
        {!error && visibleProducts.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {visibleProducts.map((p) => (
                <ElitProductCard key={p.id} product={p} onSelect={setSelectedProduct} />
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

        {/* Aviso de productos ocultos por stock */}
        {!loading && !error && hiddenByStock > 0 && visibleProducts.length > 0 && (
          <p className="mb-3 text-[11px] text-gray-400 dark:text-gray-500">
            {hiddenByStock} producto(s) sin stock oculto(s) por el filtro.
          </p>
        )}

        {/* Estado vacío */}
        {!loading && !error && hasLoadedOnce && visibleProducts.length === 0 && (
          <div className="py-14 flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-500/10 flex items-center justify-center">
              <Package size={26} className="text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              {products.length > 0
                ? 'Todos los productos de esta página están sin stock'
                : 'No se encontraron productos'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {products.length > 0
                ? 'Desactivá el filtro "Sin stock oculto" para verlos.'
                : 'Probá con otro término de búsqueda o depósito.'}
            </p>
          </div>
        )}
      </div>

      {/* Nota informativa */}
      <div className="px-5 py-3 bg-blue-500/5 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2">
        <AlertTriangle size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Hacé click en un producto para <b>importarlo a tu tienda</b>. Se precarga
          el formulario con los datos del proveedor y las imágenes se copian a tu
          Cloudinary.
        </p>
      </div>

      {/* Modal de importación */}
      <ElitImportModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
