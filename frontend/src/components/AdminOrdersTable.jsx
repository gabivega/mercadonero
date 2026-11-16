import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, ExternalLink, Undo2, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { usePrivy } from "../Utils/authClient";
import { formatOrderAmountCompact } from '../Utils/orderAmount';
import AdminOrderModal from './AdminOrderModal';
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2';

const AdminOrdersTable = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const {getAccessToken} = usePrivy();
    const [selectedOrder, setSelectedOrder] = useState(null);
const [isModalOpen, setIsModalOpen] = useState(false);

  // ── PAGINACIÓN (client-side) ──
  // El endpoint /api/admin/orders devuelve TODAS las órdenes de una, así que
  // paginamos en el cliente. `perPage` es el tamaño de página elegible (50/100).
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  // Página acotada por si cambia el total (p.ej. al recargar).
  const totalPages = Math.max(1, Math.ceil(orders.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedOrders = orders.slice(
    (safePage - 1) * perPage,
    safePage * perPage,
  );

  // Al cambiar el tamaño de página volvemos a la primera.
  const handlePerPageChange = (value) => {
    setPerPage(Number(value));
    setPage(1);
  };

  // Recarga la lista de órdenes desde el servidor.

const handleOpenModal = (order) => {
  setSelectedOrder(order);
  setIsModalOpen(true);
};

        // Acciones de admin desde el modal de órdenes
  const handleAdminAction = async (orderId, action) => {
    const token = await getAccessToken();
    const isDark = document.documentElement.classList.contains('dark');

    // ── Estilo común de los modales de SweetAlert (coherente con la app) ──
    const swalTheme = {
      background: isDark ? '#18181b' : '#fff',
      color: isDark ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem]' },
    };
    const confirmTheme = {
      ...swalTheme,
      customClass: { popup: 'rounded-[2.5rem] border-2 border-[#F26722]/20' },
    };
    const askConfirm = (title, text, confirmText = 'SÍ, CONTINUAR') =>
      Swal.fire({
        title: `<span class="font-black uppercase italic">${title}</span>`,
        text,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#F26722',
        cancelButtonColor: '#18181b',
        confirmButtonText: confirmText,
        cancelButtonText: 'CANCELAR',
        ...confirmTheme,
      });
    const okMsg = (title, text) =>
      Swal.fire({ title, text, icon: 'success', confirmButtonColor: '#F26722', ...swalTheme });
    const errMsg = (text) =>
      Swal.fire({ title: 'ERROR', text, icon: 'error', confirmButtonColor: '#ef4444', ...swalTheme });

    if (action === 'cancel_order') {
      // Solo marca la orden como cancelada. La garantía NO se libera acá:
      // se resuelve aparte, manualmente, después de verificar con el comprador.
      const c = await askConfirm(
        '¿Cancelar esta orden?',
        'Esto marca la orden como CANCELADA pero NO libera la garantía automáticamente. La garantía se libera en un paso aparte (manual) tras verificar con el comprador.',
        'SÍ, CANCELAR ORDEN',
      );
      if (!c.isConfirmed) return;
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
        await okMsg('ORDEN CANCELADA', 'La garantía sigue retenida hasta que la liberes manualmente.');
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo cancelar la orden.');
      }
      return;
    }

    if (action === 'admin_complete') {
      // El comprador confirmó la recepción (reception_confirmed). El admin cierra
      // la orden y libera la garantía/escrow. El backend exige el buffer cumplido
      // salvo que se fuerce.
      const current = orders.find((o) => o._id === orderId) || selectedOrder;
      const bufferOk =
        current?.releaseEligibleAt && new Date(current.releaseEligibleAt) <= new Date();
      const force = !bufferOk;
      const c = await askConfirm(
        force ? '¿Forzar cierre de la orden?' : '¿Completar la orden?',
        force
          ? `El período de seguridad todavía NO se cumplió (liberable desde ${current?.releaseEligibleAt ? new Date(current.releaseEligibleAt).toLocaleString('es-AR') : 'N/D'}). ¿Forzar igual la liberación de la garantía/escrow y completar la orden? Quedará registrado en la auditoría.`
          : 'Se CIERRA la venta como COMPLETADA y se libera la garantía/escrow al vendedor. Esta acción no se puede deshacer.',
        force ? 'SÍ, FORZAR LIBERACIÓN' : 'SÍ, COMPLETAR Y LIBERAR',
      );
      if (!c.isConfirmed) return;
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/complete`,
          { note: 'Completada desde panel admin', force },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        await okMsg('ORDEN COMPLETADA', 'La garantía/escrow fue liberado al vendedor.');
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo completar la orden.');
      }
      return;
    }

    if (action === 'release_guarantee') {
      // ⚠️ Esta acción CANCELA la orden (liberación en flujo de cancelación).
      // NO debe usarse para cerrar ventas ya recibidas por el comprador.
      const c = await askConfirm(
        '¿Liberar garantía y CANCELAR la orden?',
        'Esta acción libera la garantía del vendedor y marca la orden como CANCELADA. Usala solo tras verificar con el comprador que NO abonó o que ya recibió su reintegro. Si el comprador ya confirmó la recepción, usá "Completar Orden y Liberar Garantía" en su lugar.',
        'SÍ, LIBERAR Y CANCELAR',
      );
      if (!c.isConfirmed) return;
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/release-guarantee`,
          { approve: true, note: 'Liberación manual desde panel admin' },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        await okMsg('GARANTÍA LIBERADA', 'La garantía fue liberada y la orden quedó CANCELADA.');
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo liberar la garantía.');
      }
      return;
    }

    if (action === 'resolve_payment_received' || action === 'resolve_payment_no') {
      const yes = action === 'resolve_payment_received';
      const c = await askConfirm(
        yes ? '¿El pago SÍ se acreditó?' : '¿El pago NO se acreditó?',
        yes
          ? 'La orden volverá a "verificación de pago" para que el vendedor confirme la recepción y despache.'
          : 'Se cancelará la orden, se liberará la garantía al vendedor y se sumará una cancelación al comprador.',
        yes ? 'SÍ, SE ACREDITÓ' : 'SÍ, NO SE ACREDITÓ',
      );
      if (!c.isConfirmed) return;
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/resolve-payment-dispute`,
          { resolution: yes ? 'payment_received' : 'no_payment', note: 'Resuelta desde panel admin' },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        await okMsg(
          'DISPUTA RESUELTA',
          yes
            ? 'A favor del comprador. La orden vuelve a verificación para que el vendedor confirme.'
            : 'A favor del vendedor. Orden cancelada y garantía liberada.',
        );
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo resolver la disputa de pago.');
      }
      return;
    }

    if (action === 'refund_buyer') {
      // Reembolsar al COMPRADOR y cancelar la orden.
      //  - Crypto con escrow fondeado  → cancel-escrow (devuelve el 100% de los
      //    USDT on-chain al comprador).
      //  - Cualquier otro caso         → cancel normal del admin (marca la orden
      //    como cancelada; si hubiera garantía, se libera aparte).
      const current = orders.find((o) => o._id === orderId) || selectedOrder;
      const isCryptoFunded =
        current?.payment?.method === 'crypto' && current?.payment?.status === 'funded';

      const c = await askConfirm(
        isCryptoFunded ? '¿Reembolsar el escrow al comprador?' : '¿Cancelar la orden y reembolsar al comprador?',
        isCryptoFunded
          ? 'Se devolverá el 100% de los USDT del escrow a la billetera del comprador, on-chain. La orden quedará CANCELADA. Esta acción no se puede deshacer.'
          : 'Se marcará la orden como CANCELADA. Si el comprador ya abonó, asegurate de haberle devuelto el dinero: esta acción deja constancia del reembolso. No mueve fondos del escrow (la orden no tiene escrow crypto fondeado).',
        isCryptoFunded ? 'SÍ, REEMBOLSAR ESCROW' : 'SÍ, CANCELAR Y REEMBOLSAR',
      );
      if (!c.isConfirmed) return;
      try {
        Swal.fire({
          title: isCryptoFunded ? 'Reembolsando escrow...' : 'Cancelando orden...',
          text: isCryptoFunded
            ? 'Firmando cancelOrder() del contrato. Esto puede tardar unos segundos.'
            : 'Actualizando el estado de la orden.',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
          ...swalTheme,
        });
        if (isCryptoFunded) {
          await axios.patch(
            `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/cancel-escrow`,
            {},
            { headers: { Authorization: `Bearer ${token}` } },
          );
        } else {
          await axios.patch(
            `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/cancel`,
            {},
            { headers: { Authorization: `Bearer ${token}` } },
          );
        }
        await okMsg(
          isCryptoFunded ? 'ESCROW REEMBOLSADO' : 'ORDEN CANCELADA',
          isCryptoFunded
            ? 'Los USDT fueron devueltos a la billetera del comprador y la orden quedó CANCELADA.'
            : 'La orden quedó CANCELADA. Verificá que el reembolso al comprador ya se haya realizado.',
        );
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo reembolsar al comprador.');
      }
      return;
    }

    if (action === 'open_dispute') {
      // El admin cataloga la orden como "en disputa". NO cambia el estado ni
      // mueve fondos: solo marca dispute.exists y avisa a ambas partes.
      const { value: description } = await Swal.fire({
        title: `<span class="font-black uppercase italic">Abrir disputa</span>`,
        input: 'textarea',
        inputLabel: 'Motivo / detalle de la disputa (opcional)',
        inputPlaceholder: 'Ej: el comprador reportó que el producto llegó dañado...',
        inputAttributes: { maxlength: 2000 },
        showCancelButton: true,
        confirmButtonColor: '#F26722',
        cancelButtonColor: '#18181b',
        confirmButtonText: 'ABRIR DISPUTA',
        cancelButtonText: 'CANCELAR',
        ...confirmTheme,
      });
      if (!description && description !== '') return; // canceló
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/open-dispute`,
          { issueType: 'admin_manual', description: description || '' },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        await okMsg('DISPUTA ABIERTA', 'La orden quedó marcada como en disputa y se notificó a ambas partes.');
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo abrir la disputa.');
      }
      return;
    }

    if (action === 'close_dispute_buyer' || action === 'close_dispute_seller') {
      // Cerrar la disputa a favor de una de las partes. Solo registra la
      // resolución: el admin mueve fondos/estado con los botones de
      // reembolso/completar/liberar según corresponda.
      const favorBuyer = action === 'close_dispute_buyer';
      const c = await askConfirm(
        favorBuyer ? '¿Resolver a favor del COMPRADOR?' : '¿Resolver a favor del VENDEDOR?',
        favorBuyer
          ? 'Se cierra la disputa a favor del comprador. Después usá "Reembolsar Comprador" para devolverle el dinero.'
          : 'Se cierra la disputa a favor del vendedor. Después usá "Completar Orden" o "Liberar Garantía" para mover los fondos.',
        favorBuyer ? 'SÍ, A FAVOR DEL COMPRADOR' : 'SÍ, A FAVOR DEL VENDEDOR',
      );
      if (!c.isConfirmed) return;
      const { value: note } = await Swal.fire({
        title: 'Nota de resolución (opcional)',
        input: 'textarea',
        inputPlaceholder: 'Detalle de la resolución...',
        inputAttributes: { maxlength: 2000 },
        showCancelButton: true,
        confirmButtonColor: '#F26722',
        cancelButtonColor: '#18181b',
        confirmButtonText: 'GUARDAR Y CERRAR',
        cancelButtonText: 'CANCELAR',
        ...confirmTheme,
      });
      if (note === undefined) return; // canceló
      try {
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/close-dispute`,
          { favor: favorBuyer ? 'buyer' : 'seller', note: note || '' },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        await okMsg(
          'DISPUTA CERRADA',
          favorBuyer
            ? 'Resuelta a favor del comprador. Ahora reembolsá al comprador.'
            : 'Resuelta a favor del vendedor. Ahora completá/liberá la orden.',
        );
        setSelectedOrder(null);
        setIsModalOpen(false);
        await refreshOrders(token);
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo cerrar la disputa.');
      }
      return;
    }

    if (action === 'check_collateral') {
      // Consulta el estado real del colateral on-chain para discernir entre:
      //  - lock activo (está congelado de verdad) → toca liberar
      //  - lock en 0 (ya se liberó, hash falso positivo) → solo reconciliar DB
      try {
        Swal.fire({
          title: 'Consultando colateral...',
          text: 'Leyendo el estado on-chain del contrato.',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
          ...swalTheme,
        });
        const res = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/orders/${orderId}/collateral-status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const r = res.data;
        const onChain = r.onChain || {};
        const activo = onChain.orderLockActive;
        await Swal.fire({
          title: `<span class="font-black uppercase italic">Estado del colateral</span>`,
          html: `
            <div style="text-align:left;font-size:13px;line-height:1.7">
              <p><b>Estado orden (DB):</b> ${r.orderStatus}</p>
              <p><b>Lock on-chain:</b> ${activo ? '⚠️ ACTIVO (congelado)' : '✅ Liberado (0)'}</p>
              <p><b>Lock amount:</b> ${onChain.orderLockUsd ?? 'N/D'} USDT</p>
              <p><b>Vendedor bloqueado:</b> ${onChain.vendorLockedCollateral ?? 'N/D'} USDT</p>
              <p><b>Vendedor disponible:</b> ${onChain.vendorAvailable ?? 'N/D'} USDT</p>
              <p style="margin-top:10px;opacity:.85"><b>Acción sugerida:</b> ${r.resolucion_requerida || 'N/D'}</p>
            </div>`,
          icon: activo ? 'warning' : 'success',
          confirmButtonColor: '#F26722',
          ...swalTheme,
        });
      } catch (err) {
        await errMsg(err?.response?.data?.message || 'No se pudo verificar el colateral.');
      }
      return;
    }
  };

  // Recarga la lista de órdenes desde el servidor
  const refreshOrders = async (token) => {
    setLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(res.data?.orders || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  
  // Simulación de fetch a tu controlador de admin
  useEffect(() => {
    const fetchOrders = async () => {
      const token = await getAccessToken();
      try {
                const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/orders`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        // console.log(res.data);
        setOrders(res.data?.orders || res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);
  
        // Devuelve un texto si la orden tiene una solicitud de cancelación
    // pendiente que requiere intervención del admin (para detectarla fácil).
        const detectPendingCancellation = (order) => {
      const pendingRelease =
        order.releaseRequest?.exists && order.releaseRequest.status === 'pending';
      const pendingRefund =
        order.pendingRequest?.exists && order.pendingRequest.status === 'pending';
      const dispute = order.dispute?.exists && order.dispute.status === 'open';
      if (dispute) return `⚖️ Disputa: ${order.dispute.issueType || 'problema'}`;
      if (pendingRelease) return 'Cancelación solicitada (admin)';
      if (pendingRefund) return 'Reembolso en proceso';
      return null;
    };

    const StatusBadge = ({ status, label }) => {
    const styles = {
      pending_payment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      verifying_payment: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      shipped: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      reception_confirmed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
      expired: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-zinc-100 text-zinc-600'}`}>
        {label || status}
      </span>
    );
  };
  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-12">
        <LoadingSpinner size="lg" text="Cargando órdenes..." />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800">
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">ID Orden</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">Comprador</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">Vendedor</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">Monto</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">Fecha</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">Estado</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400">Acciones</th>
            </tr>
          </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {paginatedOrders.map((order) => {
              // Normalizar código de orden corto por si el backend no lo manda
              const code = order.code || String(order._id || '').slice(-6).toUpperCase();
              const statusLabels = {
                pending_payment: 'Pago Pendiente',
                verifying_payment: 'Verificando',
                                paid: 'Pagado',
                shipped: 'En camino',
                reception_confirmed: 'Recibido',
                completed: 'Completado',
                cancelled: 'Cancelado',
                expired: 'Expirado',
              };
              const buyerName =
                order.buyer?.firstName || order.buyer?.username || order.buyer?.email || 'Comprador';
              const sellerName =
                order.seller?.username || order.seller?.firstName || order.seller?.email || 'Vendedor';
              return (
                <tr key={order._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">#{code}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-bold">{buyerName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-bold">{sellerName}</div>
                  </td>
                  {/* No usar formatMoney(order.totalAmount) a secas: en órdenes
                      con saldo de recompensas el backend guarda USD en ese
                      campo. Mostramos la moneda real (ARS por defecto, USD con
                      badge cuando corresponde) para no confundir al admin. */}
                  <td className="px-4 py-3 font-black text-sm">
                    {(() => {
                      const { text, currency } = formatOrderAmountCompact(order);
                      return currency === 'USD' ? (
                        <span className="inline-flex items-center gap-1">
                          {text}
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 not-italic">
                            USD
                          </span>
                        </span>
                      ) : (
                        text
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-zinc-500 flex flex-col">
                      <p>{new Date(order.createdAt).toLocaleDateString()}</p>
                      <p>{new Date(order.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <StatusBadge status={order.status} label={statusLabels[order.status] || order.status} />
                      {detectPendingCancellation(order) && (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 animate-pulse">
                          {detectPendingCancellation(order)}
                        </span>
                      )}
                    </div>
                  </td>
                                    <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                                            <button
                        onClick={() => handleOpenModal(order)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors">
                        <Eye size={18} />
                      </button>
                      {/* Acción rápida: reembolsar al comprador (escrow crypto fondeado). */}
                      {order.payment?.method === 'crypto' &&
                        order.payment?.status === 'funded' &&
                        !['completed', 'cancelled', 'expired'].includes(order.status) && (
                          <button
                            onClick={() => handleAdminAction(order._id, 'refund_buyer')}
                            title="Reembolsar comprador (escrow)"
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-rose-500 transition-colors">
                            <Undo2 size={18} />
                          </button>
                        )}
                                            <button
                        onClick={async () => {
                          try {
                            const token = await getAccessToken();
                            setLoading(true);
                            const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/orders`, {
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            setOrders(res.data?.orders || res.data || []);
                          } catch (e) {
                            console.error(e);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-500 transition-colors"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
                    </tbody>
        </table>
      </div>

      {/* ── PAGINACIÓN (client-side) ── */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Selector de tamaño de página */}
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Mostrar</span>
          <select
            value={perPage}
            onChange={(e) => handlePerPageChange(e.target.value)}
            className="px-2 py-1 text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-[#F26722] dark:text-zinc-100"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>
            · {orders.length} orden{orders.length === 1 ? '' : 'es'}
          </span>
        </div>

        {/* Navegación entre páginas */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 mr-1">
            Página {safePage} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <AdminOrderModal order={selectedOrder} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAction={handleAdminAction} />
    </div>
  );
};

export default AdminOrdersTable;