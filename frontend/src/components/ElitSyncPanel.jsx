import React, { useState, useMemo, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import {
  RefreshCw,
  AlertTriangle,
  PackageX,
  PackageCheck,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Ban,
  Check,
  CheckSquare,
  Square,
  Eye,
} from 'lucide-react';
import { InlineLoadingSpinner } from './LoadingSpinner.jsx';
import { previewElitSync, applyElitSync } from '../Utils/elitSyncApi.js';
import { DEFAULT_MARKUP, priceWithMarkup } from '../Utils/elitAdapter.js';

// ─────────────────────────────────────────────────────────────────────────────
// ElitSyncPanel
//
// Panel de sincronización de stock/precios con Elit (flujo HÍBRIDO).
//   1. "Sincronizar" → pide al backend la tabla de DIFERENCIAS (no escribe).
//   2. El usuario revisa y por fila decide qué aplicar (stock y/o precio).
//   3. "Aplicar seleccionados" → envía sólo lo marcado.
//
// Columnas por fila:
//   costo proveedor → precio venta actual → markup actual → [markup editable] →
//   nuevo precio venta (en vivo) → stock Elit → estado.
// ─────────────────────────────────────────────────────────────────────────────

const formatMoney = (n) => {
  const v = Number(n) || 0;
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};

const formatPercent = (markup) => {
  if (markup === null || markup === undefined || !isFinite(markup)) return '—';
  return `${(markup * 100).toFixed(1)}%`;
};

// ── Estilos por estado de diferencia ─────────────────────────────────────────
const STATUS_META = {
  out_of_stock: {
    label: 'Sin stock',
    Icon: PackageX,
    row: 'bg-red-500/5 border-red-500/20',
    chip: 'bg-red-500/15 text-red-600 dark:text-red-400',
  },
  stock_down: {
    label: 'Bajó stock',
    Icon: TrendingDown,
    row: 'bg-amber-500/5 border-amber-500/20',
    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  stock_up: {
    label: 'Subió stock',
    Icon: TrendingUp,
    row: 'bg-green-500/5 border-green-500/20',
    chip: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
  cost_up: {
    label: 'Subió costo',
    Icon: TrendingUp,
    row: 'bg-blue-500/5 border-blue-500/20',
    chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  cost_down: {
    label: 'Bajó costo',
    Icon: TrendingDown,
    row: 'bg-violet-500/5 border-violet-500/20',
    chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  removed: {
    label: 'Baja del proveedor',
    Icon: Ban,
    row: 'bg-gray-500/5 border-gray-400/20',
    chip: 'bg-gray-500/15 text-gray-500 dark:text-gray-400',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
function SyncRow({ row, selection, onToggle, onMarkupChange }) {
  const meta = STATUS_META[row.status] || STATUS_META.cost_changed;
  const { Icon } = meta;

  // Markup editable: arranca en el "actual" inferido o en el default.
  const initialMarkup =
    row.markupAtual !== null && row.markupAtual !== undefined
      ? row.markupAtual
      : DEFAULT_MARKUP;

  const [markupPct, setMarkupPct] = useState(
    selection.markupPct !== undefined
      ? selection.markupPct
      : Number((initialMarkup * 100).toFixed(1))
  );

  // Costo de referencia: el nuevo de Elit si lo tenemos; si no, el registrado.
  const cost = Number(row.elitCost ?? row.costPvpArs) || 0;

  // Nuevo precio de venta en vivo, según el markup editado.
  const newPrice = useMemo(
    () => priceWithMarkup(cost, (Number(markupPct) || 0) / 100),
    [cost, markupPct]
  );

  const canApplyStock = row.status !== 'removed' && row.elitStock !== null;
  const canApplyPrice = row.status !== 'removed' && cost > 0;
  const canMarkRemoved = row.status === 'removed';

  const handleMarkup = (value) => {
    setMarkupPct(value);
    onMarkupChange(row.productId, value);
  };

  const selected =
    selection.applyStock || selection.applyPrice || selection.markRemoved;

  // Resaltado de la fila si está seleccionada.
  const rowClass = selected
    ? 'ring-1 ring-[#F26722]/40'
    : '';

  return (
    <div
      className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-xl border ${meta.row} ${rowClass} transition-all`}
    >
      {/* Producto + estado */}
      <div className="col-span-12 md:col-span-4 flex items-center gap-3 min-w-0">
        <img
          src={row.image}
          alt={row.name}
          className="w-10 h-10 rounded-lg object-contain bg-white dark:bg-zinc-800 flex-shrink-0"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate" title={row.name}>
            {row.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase ${meta.chip}`}>
              <Icon size={10} />
              {meta.label}
            </span>
            <span className="text-[10px] font-mono text-gray-400">#{row.providerRefId ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Costo proveedor: anterior (tachado) → nuevo + % variación */}
      <div className="col-span-6 md:col-span-1 text-right">
        <p className="text-[9px] uppercase text-gray-400 font-bold">Costo</p>
        {row.costChanged && row.costPvpArs > 0 ? (
          <>
            <p className="text-[10px] text-gray-400 line-through leading-none">
              {formatMoney(row.costPvpArs)}
            </p>
            <p
              className={`text-xs font-bold leading-tight ${
                row.costDirection === 'up'
                  ? 'text-red-500'
                  : 'text-violet-500'
              }`}
            >
              {formatMoney(cost)}
            </p>
            {row.costDeltaPct !== null && row.costDeltaPct !== undefined && (
              <p
                className={`text-[9px] font-bold leading-none ${
                  row.costDirection === 'up'
                    ? 'text-red-400'
                    : 'text-violet-400'
                }`}
              >
                {row.costDirection === 'up' ? '▲' : '▼'}{' '}
                {Math.abs(row.costDeltaPct * 100).toFixed(1)}%
              </p>
            )}
          </>
        ) : (
          <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
            {formatMoney(cost)}
          </p>
        )}
      </div>

      {/* Precio venta actual + markup actual */}
      <div className="col-span-6 md:col-span-2 text-right">
        <p className="text-[9px] uppercase text-gray-400 font-bold">Venta actual</p>
        <p className="text-xs font-bold text-gray-900 dark:text-white">
          {formatMoney(row.localPrice)}
        </p>
        <p className="text-[10px] text-gray-400">
          markup {formatPercent(row.markupAtual)}
        </p>
      </div>

      {/* Markup editable */}
      <div className="col-span-6 md:col-span-2">
        <p className="text-[9px] uppercase text-gray-400 font-bold mb-0.5">Nuevo markup</p>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="1"
            min="0"
            disabled={!canApplyPrice}
            value={markupPct}
            onChange={(e) => handleMarkup(e.target.value)}
            className="w-16 px-2 py-1 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs font-bold dark:text-white focus:outline-none focus:border-[#F26722] disabled:opacity-40"
          />
          <span className="text-xs font-bold text-gray-400">%</span>
        </div>
      </div>

      {/* Nuevo precio venta (en vivo) */}
      <div className="col-span-6 md:col-span-1 text-right">
        <p className="text-[9px] uppercase text-gray-400 font-bold">Nuevo</p>
        <p className="text-xs font-black text-[#F26722]">{formatMoney(newPrice)}</p>
      </div>

      {/* Stock */}
      <div className="col-span-6 md:col-span-1 text-center">
        <p className="text-[9px] uppercase text-gray-400 font-bold">Stock</p>
        <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
          {row.localStock}
          {row.status !== 'removed' && (
            <span className="text-gray-400"> → </span>
          )}
          {row.status !== 'removed' && (
            <span className="text-[#F26722]">{row.elitStock}</span>
          )}
        </p>
      </div>

      {/* Acciones */}
      <div className="col-span-12 md:col-span-1 flex md:flex-col items-center md:items-stretch justify-end gap-1">
        {canApplyStock && (
          <button
            type="button"
            onClick={() => onToggle(row.productId, 'applyStock')}
            title="Aplicar stock de Elit"
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selection.applyStock
                ? 'bg-[#F26722] text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-300'
            }`}
          >
            {selection.applyStock ? <Check size={11} /> : <PackageCheck size={11} />}
            Stock
          </button>
        )}
        {canApplyPrice && (
          <button
            type="button"
            onClick={() => onToggle(row.productId, 'applyPrice')}
            title="Aplicar el nuevo precio"
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selection.applyPrice
                ? 'bg-[#F26722] text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-300'
            }`}
          >
            {selection.applyPrice ? <Check size={11} /> : <DollarSign size={11} />}
            Precio
          </button>
        )}
        {canMarkRemoved && (
          <button
            type="button"
            onClick={() => onToggle(row.productId, 'markRemoved')}
            title="Pausar producto (dado de baja en Elit)"
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selection.markRemoved
                ? 'bg-[#F26722] text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-300'
            }`}
          >
            <Ban size={11} />
            Pausar
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ElitSyncPanel() {
  const { getAccessToken } = usePrivy();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [summary, setSummary] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [includeUnchanged, setIncludeUnchanged] = useState(false);

  // Selección por producto: { [productId]: { applyStock, applyPrice, markRemoved, markupPct } }
  const [selection, setSelection] = useState({});

  const selectedCount = useMemo(
    () =>
      Object.values(selection).filter(
        (s) => s.applyStock || s.applyPrice || s.markRemoved
      ).length,
    [selection]
  );

  // ── Cargar preview ──
  const loadPreview = useCallback(
    async (includeUnchangedOverride) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const inc = includeUnchangedOverride ?? includeUnchanged;
        const data = await previewElitSync(token, { includeUnchanged: inc });

        setRows(data?.rows || []);
        setSummary(data?.summary || null);
        setFetchedAt(data?.fetchedAt || null);
        setSelection({});
        setHasLoaded(true);
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          'No se pudo generar la vista previa de sincronización.';
        setError(msg);
        setRows([]);
        setSummary(null);
        Swal.fire({
          title: 'Error al sincronizar',
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
    [getAccessToken, includeUnchanged]
  );

  // ── Toggle de selección por acción ──
  const handleToggle = useCallback((productId, field) => {
    setSelection((prev) => {
      const current = prev[productId] || {};
      const next = { ...current, [field]: !current[field] };
      // Al marcar stock/precio, precargamos defaults útiles.
      if (field === 'applyStock' && next.applyStock) {
        // nada extra: el back usa elitStock de la fila.
      }
      return { ...prev, [productId]: next };
    });
  }, []);

  const handleMarkupChange = useCallback((productId, markupPct) => {
    setSelection((prev) => {
      const current = prev[productId] || {};
      return {
        ...prev,
        [productId]: {
          ...current,
          markupPct,
          // Tocar el markup implica querer aplicar precio.
          applyPrice: true,
        },
      };
    });
  }, []);

  const selectAllOfStatus = (status) => {
    const next = { ...selection };
    rows
      .filter((r) => r.status === status)
      .forEach((r) => {
        const cur = next[r.productId] || {};
        if (status === 'removed') {
          next[r.productId] = { ...cur, markRemoved: true };
        } else {
          next[r.productId] = {
            ...cur,
            applyStock: r.elitStock !== null,
            applyPrice: cur.applyPrice || false,
          };
        }
      });
    setSelection(next);
  };

  const clearSelection = () => setSelection({});

  // ── Aplicar seleccionados ──
  const handleApply = async () => {
    const entries = Object.entries(selection).filter(
      ([, s]) => s.applyStock || s.applyPrice || s.markRemoved
    );

    if (entries.length === 0) {
      Swal.fire({
        title: 'Nada seleccionado',
        text: 'Marcá al menos un cambio para aplicar.',
        icon: 'info',
        background: '#1A1A1A',
        color: '#ffffff',
        confirmButtonColor: '#F26722',
        customClass: { popup: 'rounded-3xl border border-gray-800' },
      });
      return;
    }

    const confirm = await Swal.fire({
      title: `¿Aplicar ${entries.length} cambio(s)?`,
      text: 'Se actualizará el stock y/o el precio de los productos marcados.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aplicar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#ffffff',
      confirmButtonColor: '#F26722',
      cancelButtonColor: '#3f3f46',
      customClass: { popup: 'rounded-3xl border border-gray-800' },
    });
    if (!confirm.isConfirmed) return;

    setApplying(true);
    try {
      const token = await getAccessToken();

      // Construimos el payload por producto.
      const changes = entries.map(([productId, s]) => {
        const row = rows.find((r) => r.productId === productId);
        const change = { productId };

        if (s.markRemoved) {
          change.markRemoved = true;
        }
        if (s.applyStock) {
          change.applyStock = true;
          change.elitStock = row?.elitStock;
        }
        if (s.applyPrice) {
          const cost = Number(row?.elitCost ?? row?.costPvpArs) || 0;
          const markup = (Number(s.markupPct) || 0) / 100;
          change.applyPrice = true;
          change.elitCost = cost;
          change.markup = markup;
          change.newPrice = priceWithMarkup(cost, markup);
        }
        return change;
      });

      const data = await applyElitSync(token, changes);

      await Swal.fire({
        title: '¡Sincronización aplicada!',
        html: `<b>${data.updated}</b> producto(s) actualizado(s).` +
          (data.errors ? `<br><span style="color:#f87171">${data.errors} con error.</span>` : ''),
        icon: data.errors ? 'warning' : 'success',
        background: '#1A1A1A',
        color: '#ffffff',
        confirmButtonColor: '#F26722',
        customClass: { popup: 'rounded-3xl border border-gray-800' },
      });

      // Recargamos el preview para reflejar el nuevo estado.
      await loadPreview();
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || 'No se pudieron aplicar los cambios.';
      Swal.fire({
        title: 'Error al aplicar',
        text: msg,
        icon: 'error',
        background: '#1A1A1A',
        color: '#ffffff',
        confirmButtonColor: '#F26722',
        customClass: { popup: 'rounded-3xl border border-gray-800' },
      });
    } finally {
      setApplying(false);
    }
  };

  const hasRows = rows.length > 0;

  return (
    <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="p-2 rounded-xl bg-[#F26722]/10 text-[#F26722]">
            <RefreshCw size={20} />
          </div>
          <div className="flex-1">
            <h2 className="font-black text-sm uppercase tracking-wider text-gray-800 dark:text-white">
              Sincronizar Stock y Precios
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Detecta diferencias con Elit y aplicá sólo lo que elijas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadPreview()}
              disabled={loading || applying}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase tracking-tight hover:bg-[#d9531e] transition-all disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {hasLoaded ? 'Re-sincronizar' : 'Sincronizar'}
            </button>
          </div>
        </div>

        {/* Filtro: incluir sin cambios */}
        {hasLoaded && (
          <label className="mt-3 inline-flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeUnchanged}
              onChange={(e) => {
                setIncludeUnchanged(e.target.checked);
                loadPreview(e.target.checked);
              }}
              className="accent-[#F26722]"
            />
            Mostrar también productos sin cambios
          </label>
        )}
      </div>

      {/* Cuerpo */}
      <div className="p-5">
        {loading && (
          <div className="py-16 flex justify-center">
            <InlineLoadingSpinner size="lg" text="Consultando Elit y comparando..." />
          </div>
        )}

        {!loading && error && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={26} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              No se pudo sincronizar
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{error}</p>
            <button
              onClick={() => loadPreview()}
              className="mt-2 px-5 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && !hasLoaded && (
          <div className="py-14 flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-500/10 flex items-center justify-center">
              <Eye size={26} className="text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Todavía no sincronizaste
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
              Presioná <b>Sincronizar</b> para comparar tu stock y precios con el
              catálogo de Elit. No se modifica nada hasta que lo confirmes.
            </p>
          </div>
        )}

        {!loading && !error && hasLoaded && (
          <>
            {/* Resumen */}
            {summary && (
              <div className="mb-4 flex flex-wrap gap-2">
                {summary.out_of_stock ? (
                  <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold">
                    {summary.out_of_stock} sin stock
                  </span>
                ) : null}
                {summary.stock_down ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                    {summary.stock_down} bajó stock
                  </span>
                ) : null}
                {summary.stock_up ? (
                  <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] font-bold">
                    {summary.stock_up} subió stock
                  </span>
                ) : null}
                {summary.cost_up ? (
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
                    {summary.cost_up} subió costo
                  </span>
                ) : null}
                {summary.cost_down ? (
                  <span className="px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[11px] font-bold">
                    {summary.cost_down} bajó costo
                  </span>
                ) : null}
                {summary.removed ? (
                  <span className="px-2.5 py-1 rounded-full bg-gray-500/10 text-gray-500 dark:text-gray-400 text-[11px] font-bold">
                    {summary.removed} baja proveedor
                  </span>
                ) : null}
                {fetchedAt ? (
                  <span className="ml-auto text-[10px] text-gray-400">
                    Actualizado: {new Date(fetchedAt).toLocaleString('es-AR')}
                  </span>
                ) : null}
              </div>
            )}

            {/* Barra de acciones masivas */}
            {hasRows && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => selectAllOfStatus('out_of_stock')}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 text-[11px] font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                >
                  Aplicar todo "sin stock"
                </button>
                <button
                  onClick={() => selectAllOfStatus('stock_down')}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 text-[11px] font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                >
                  Aplicar todo "bajó stock"
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 text-[11px] font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                >
                  Limpiar selección
                </button>

                <button
                  onClick={handleApply}
                  disabled={applying || selectedCount === 0}
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-bold uppercase tracking-tight hover:bg-green-700 transition-all disabled:opacity-40"
                >
                  <CheckSquare size={15} />
                  Aplicar seleccionados ({selectedCount})
                </button>
              </div>
            )}

            {/* Listado */}
            {hasRows ? (
              <div className="flex flex-col gap-1.5">
                {rows.map((row) => (
                  <SyncRow
                    key={row.productId}
                    row={row}
                    selection={selection[row.productId] || {}}
                    onToggle={handleToggle}
                    onMarkupChange={handleMarkupChange}
                  />
                ))}
              </div>
            ) : (
              <div className="py-14 flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                  <PackageCheck size={26} className="text-green-500" />
                </div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                  Todo en orden
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                  No hay diferencias entre tu stock/precios y Elit.
                  {includeUnchanged ? '' : ' Marcá "Mostrar sin cambios" para ver todos.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Nota */}
      <div className="px-5 py-3 bg-blue-500/5 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2">
        <AlertTriangle size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Esta vista <b>no modifica nada</b> hasta que presiones
          <b> Aplicar seleccionados</b>. El stock nunca baja por debajo de las
          unidades reservadas por compras grupales. El <b>markup</b> que edites se
          usa para recalcular el <i>nuevo precio de venta</i>.
        </p>
      </div>
    </div>
  );
}
