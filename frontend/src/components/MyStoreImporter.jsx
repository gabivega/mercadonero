import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { usePrivy } from '../Utils/authClient';
import Swal from 'sweetalert2';
import {
  Store,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CloudDownload,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  PackageCheck,
  PackageX,
  CheckSquare,
  Square,
  Link2,
  ArrowRight,
} from 'lucide-react';
import { InlineLoadingSpinner } from './LoadingSpinner.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// MyStoreImporter
//
// Panel del VENDEDOR para importar su propia tienda Tiendanube (una vez que un
// admin habilitó y verificó su conexión).
//
// Secciones según estado:
//   - Sin conexión       → mensaje "pedile al admin que la habilite".
//   - pending            → "pendiente de verificación".
//   - suspended          → "suspendida".
//   - verified           → importador completo:
//        · Grilla paginada del catálogo (con búsqueda).
//        · Import por categorías (checkboxes) o masivo de todo.
//        · Import individual (click en producto).
//        · Sincronizar stock/precios (preview + aplicar).
//
// Todo pasa por NUESTRO backend (/api/my-store/...), que valida el dominio.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

const formatPrice = (price, currency = 'ARS') => {
  if (price === null || price === undefined || isNaN(price)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

export default function MyStoreImporter() {
  const { getAccessToken } = usePrivy();
  const serverUrl = import.meta.env.VITE_SERVER_URL;

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connection, setConnection] = useState(null);
  const [connected, setConnected] = useState(false);

  // Catálogo.
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Categorías (para import por checkboxes).
  const [categories, setCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);
  const [showCats, setShowCats] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);

  // Acciones.
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  // ── Cargar estado de la conexión ──
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const { data } = await axios.get(`${serverUrl}/api/my-store/status`, {
        headers: await authHeaders(),
      });
      setConnected(Boolean(data.connected));
      setConnection(data.connection || null);
    } catch (err) {
      console.error('[MyStore] status', err.message);
      setConnected(false);
      setConnection(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [serverUrl, authHeaders]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const isVerified = connection?.status === 'verified';

  // ── Cargar catálogo (sólo si verificado) ──
  const loadProducts = useCallback(
    async (p = 1, s = search) => {
      if (!isVerified) return;
      setLoadingProducts(true);
      try {
        const params = { page: Math.max(1, p), perPage: PAGE_SIZE };
        if (s?.trim()) params.search = s.trim();
        const { data } = await axios.get(`${serverUrl}/api/my-store/products`, {
          params,
          headers: await authHeaders(),
          timeout: 120000,
        });
        setProducts(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(Math.max(1, p));
      } catch (err) {
        const msg = err.response?.data?.message || err.message;
        Swal.fire({
          title: 'Error',
          text: msg || 'No se pudo cargar el catálogo.',
          icon: 'error',
          background: '#1A1A1A',
          color: '#fff',
        });
        setProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    },
    [isVerified, serverUrl, authHeaders, search]
  );

  useEffect(() => {
    if (isVerified) loadProducts(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerified]);

  // ── Categorías ──
  const loadCategories = async () => {
    setLoadingCats(true);
    setShowCats(true);
    try {
      const { data } = await axios.get(`${serverUrl}/api/my-store/categories`, {
        headers: await authHeaders(),
        timeout: 120000,
      });
      setCategories(data.categories || []);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({
        title: 'Error',
        text: msg || 'No se pudieron cargar las categorías.',
        icon: 'error',
        background: '#1A1A1A',
        color: '#fff',
      });
    } finally {
      setLoadingCats(false);
    }
  };

  // Selección por SLUG de categoría (estable). Guardamos slugs.
  const toggleCat = (slug) => {
    setSelectedCats((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]
    );
  };

  // ── Import masivo (categorías seleccionadas o todo) ──
  const runBulkImport = async () => {
    const byCategories = selectedCats.length > 0;
    const confirm = await Swal.fire({
      title: byCategories ? '¿Importar categorías seleccionadas?' : '¿Importar TODO el catálogo?',
      html: byCategories
        ? `Se importarán los productos de <b>${selectedCats.length}</b> categoría(s) seleccionada(s).<br/>Los ya importados se omiten.`
        : `Se importará <b>todo</b> tu catálogo (${total.toLocaleString('es-AR')} productos aprox.).<br/>Los ya importados se omiten.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, importar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#fff',
      confirmButtonColor: '#F26722',
    });
    if (!confirm.isConfirmed) return;

    setBusy(true);
    Swal.fire({
      title: 'Importando...',
      html: 'Esto puede tardar varios minutos. No cierres esta pestaña.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#1A1A1A',
      color: '#fff',
    });

    try {
      const { data } = await axios.post(
        `${serverUrl}/api/my-store/bulk-import`,
        { categories: byCategories ? selectedCats : [], skipExisting: true },
        { headers: await authHeaders(), timeout: 30 * 60 * 1000 }
      );
      const s = data.summary || {};
      await Swal.fire({
        title: '¡Importación finalizada!',
        html: `
          <div style="text-align:left;font-size:14px">
            <p>✅ Creados: <b>${s.created ?? 0}</b></p>
            <p>⏭️ Omitidos (ya existían): <b>${s.skipped ?? 0}</b></p>
            <p>⚠️ Errores: <b>${s.errors ?? 0}</b></p>
          </div>`,
        icon: 'success',
        background: '#1A1A1A',
        color: '#fff',
        confirmButtonColor: '#F26722',
      });
      loadProducts(1, search);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error al importar', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    } finally {
      setBusy(false);
    }
  };

  // ── Import individual ──
  const importOne = async (item) => {
    const confirm = await Swal.fire({
      title: 'Importar producto',
      text: item.name,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Importar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#fff',
      confirmButtonColor: '#F26722',
    });
    if (!confirm.isConfirmed) return;

    try {
      await axios.post(
        `${serverUrl}/api/my-store/import`,
        { product: item },
        { headers: await authHeaders(), timeout: 120000 }
      );
      Swal.fire({ toast: true, position: 'top-end', title: 'Producto importado', icon: 'success', showConfirmButton: false, timer: 2000, background: '#1A1A1A', color: '#fff' });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    }
  };

  // ── Sync stock/precios ──
  const runSync = async () => {
    setSyncBusy(true);
    Swal.fire({
      title: 'Analizando diferencias...',
      html: 'Comparando tu catálogo con el proveedor.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#1A1A1A',
      color: '#fff',
    });
    try {
      const headers = await authHeaders();
      const { data } = await axios.get(`${serverUrl}/api/my-store/sync/preview`, {
        headers,
        timeout: 30 * 60 * 1000,
      });
      Swal.close();

      const changes = (data.changes || []).filter((c) => c.status === 'changed');
      if (changes.length === 0) {
        return Swal.fire({
          title: 'Todo al día',
          text: 'No hay diferencias de stock ni precios.',
          icon: 'success',
          background: '#1A1A1A',
          color: '#fff',
          confirmButtonColor: '#F26722',
        });
      }

      // Preview en tabla simple.
      const rows = changes
        .slice(0, 50)
        .map((c) => {
          const d = c.diffs;
          const parts = [];
          if (d.price) parts.push(`Precio: ${formatPrice(d.price.from)} → <b>${formatPrice(d.price.to)}</b>`);
          if (d.stock) parts.push(`Stock: ${d.stock.from} → <b>${d.stock.to}</b>`);
          return `<tr><td style="padding:4px 8px;font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</td><td style="padding:4px 8px;font-size:11px">${parts.join('<br/>')}</td></tr>`;
        })
        .join('');

      const res = await Swal.fire({
        title: `${changes.length} cambio(s) detectado(s)`,
        html: `<div style="max-height:300px;overflow:auto"><table style="width:100%">${rows}</table></div>${changes.length > 50 ? '<p style="opacity:.6;font-size:11px;margin-top:8px">Mostrando los primeros 50…</p>' : ''}`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Aplicar todos',
        cancelButtonText: 'Cancelar',
        background: '#1A1A1A',
        color: '#fff',
        confirmButtonColor: '#F26722',
        width: 640,
      });

      if (!res.isConfirmed) return;

      const applyRes = await axios.post(
        `${serverUrl}/api/my-store/sync/apply`,
        { changes },
        { headers, timeout: 5 * 60 * 1000 }
      );
      Swal.fire({
        title: 'Sincronizado',
        text: `Actualizados: ${applyRes.data.updated}. Errores: ${applyRes.data.errors}.`,
        icon: 'success',
        background: '#1A1A1A',
        color: '#fff',
        confirmButtonColor: '#F26722',
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error al sincronizar', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    } finally {
      setSyncBusy(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  if (loadingStatus) {
    return (
      <div className="py-16 flex justify-center">
        <InlineLoadingSpinner size="lg" text="Verificando tu tienda..." />
      </div>
    );
  }

  // Sin conexión.
  if (!connected) {
    return (
      <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#F26722]/10 text-[#F26722] flex items-center justify-center">
          <Store size={26} />
        </div>
        <h3 className="font-black text-lg dark:text-white">Importá tu tienda Tiendanube</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Traé todo tu catálogo (productos, precios, stock e imágenes) a Mercado Nero
          con un click. Para habilitarlo, <b>pedile a un administrador que conecte tu
          cuenta</b> indicando tu email y el dominio de tu tienda.
        </p>
      </div>
    );
  }

  // Pendiente / suspendida.
  if (!isVerified) {
    const isPending = connection?.status === 'pending';
    return (
      <div className={`w-full border rounded-[24px] p-8 text-center space-y-3 ${isPending ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'}`}>
        <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center ${isPending ? 'bg-amber-500/15 text-amber-500' : 'bg-rose-500/15 text-rose-500'}`}>
          {isPending ? <Clock size={26} /> : <ShieldAlert size={26} />}
        </div>
        <h3 className="font-black text-lg dark:text-white">
          {isPending ? 'Conexión pendiente de verificación' : 'Conexión suspendida'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-md mx-auto">
          Tu tienda <b>{connection?.domain}</b>{' '}
          {isPending
            ? 'está registrada. Un administrador está verificando la propiedad del dominio.'
            : 'fue suspendida. Contactá al soporte para reactivarla.'}
        </p>
      </div>
    );
  }

  // ── Verificado: explorador completo ──
  return (
    <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-green-500/10 text-green-500">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-sm uppercase tracking-wider text-gray-800 dark:text-white truncate">
              Importador de Tiendanube
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Link2 size={11} /> {connection?.domain}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={runSync}
              disabled={syncBusy || busy}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs uppercase hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
              title="Sincronizar stock y precios (por SKU)"
            >
              {syncBusy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={loadCategories}
              disabled={loadingCats || busy}
              className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs uppercase hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
            >
              <CloudDownload size={15} /> Categorías
            </button>
            <button
              onClick={runBulkImport}
              disabled={busy || loadingProducts}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase hover:bg-[#d9531e] transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />}
              <span className="hidden sm:inline">{selectedCats.length ? `Importar (${selectedCats.length})` : 'Importar todo'}</span>
            </button>
          </div>
        </div>

        <p className="mt-2 text-right text-[11px] font-bold text-gray-400">
          {total.toLocaleString('es-AR')} productos en tu tienda
        </p>

        {/* Buscador */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            loadProducts(1, searchInput);
          }}
          className="mt-4 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#F26722]"
            />
          </div>
          <button type="submit" disabled={loadingProducts} className="px-4 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase disabled:opacity-50">
            Buscar
          </button>
        </form>
      </div>

      {/* Panel de categorías (checkboxes) */}
      {showCats && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5">
          {loadingCats ? (
            <InlineLoadingSpinner size="sm" text="Leyendo categorías del sitemap..." />
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                  Importar por categoría
                </p>
                <button
                  onClick={() => setSelectedCats(selectedCats.length === categories.length ? [] : categories.map((c) => c.slug))}
                  className="text-[11px] font-bold text-[#F26722] hover:underline"
                >
                  {selectedCats.length === categories.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                {categories.map((c) => {
                  const active = selectedCats.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      onClick={() => toggleCat(c.slug)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs transition-all ${active ? 'bg-[#F26722]/10 text-[#F26722]' : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300'}`}
                    >
                      {active ? <CheckSquare size={15} /> : <Square size={15} />}
                      <span className="flex-1 truncate">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cuerpo: grilla */}
      <div className="p-5">
        {loadingProducts && products.length === 0 ? (
          <div className="py-16 flex justify-center">
            <InlineLoadingSpinner size="lg" text="Cargando productos..." />
          </div>
        ) : products.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm font-bold">
            No se encontraron productos.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((p, i) => (
                <button
                  key={p.id || i}
                  onClick={() => importOne(p)}
                  className="group text-left bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden hover:border-[#F26722]/50 hover:shadow-lg transition-all flex flex-col"
                >
                  <div className="relative h-36 bg-white dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {p.images?.[0]?.src ? (
                      <img src={p.images[0].src} alt={p.name} loading="lazy" className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform" />
                    ) : (
                      <ImageOff size={24} className="text-gray-300" />
                    )}
                    <div className={`absolute top-2 left-2 flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-full ${p.isInStock ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                      {p.isInStock ? <PackageCheck size={10} /> : <PackageX size={10} />}
                      {p.isInStock ? 'Stock' : 'Sin stock'}
                    </div>
                  </div>
                  <div className="p-2.5 flex flex-col gap-1">
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug min-h-[2rem]">{p.name}</h3>
                    {p.onSale && p.listPrice > p.price ? (
                      <>
                        <span className="text-[10px] text-gray-400 line-through">{formatPrice(p.listPrice, p.currency)}</span>
                        <span className="text-sm font-black text-[#F26722]">{formatPrice(p.price, p.currency)}</span>
                      </>
                    ) : (
                      <span className="text-sm font-black text-gray-900 dark:text-white">{formatPrice(p.price, p.currency)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Paginación */}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => loadProducts(page - 1, search)}
                disabled={loadingProducts || page <= 1}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs disabled:opacity-40"
              >
                <ChevronLeft size={15} /> Anterior
              </button>
              <span className="text-xs font-bold text-gray-500">Página {page} de {totalPages}</span>
              <button
                onClick={() => loadProducts(page + 1, search)}
                disabled={loadingProducts || page >= totalPages}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs disabled:opacity-40"
              >
                Siguiente <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nota */}
      <div className="px-5 py-3 bg-blue-500/5 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2">
        <ArrowRight size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Se importa el <b>precio final</b> de tu tienda y <b>1 imagen</b> por producto,
          con categorías mapeadas a la plataforma. La <b>sincronización</b> actualiza
          precio, oferta y stock cuando el artículo ya existe.
        </p>
      </div>
    </div>
  );
}
