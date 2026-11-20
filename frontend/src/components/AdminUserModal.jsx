import React, { useEffect, useState } from 'react';
import {
  X,
  User as UserIcon,
  Mail,
  ShieldCheck,
  Store,
  Calendar,
  Star,
  Phone,
  FileText,
  Hash,
  CreditCard,
  Clock,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { usePrivy } from "../Utils/authClient";
import LoadingSpinner from './LoadingSpinner';

/**
 * Modal de detalle de un usuario del panel de admin.
 * Carga la info completa desde el backend y deja espacio para acciones de moderación.
 */
const AdminUserModal = ({ user, isOpen, onClose, onStatusChange }) => {
  const { getAccessToken } = usePrivy();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  // Loading de la acción Aprobar/Desactivar tienda. Debe declararse acá arriba,
  // junto al resto de hooks, ANTES del `return null` (Reglas de Hooks: no se
  // puede llamar un hook después de un return condicional).
  const [shopLoading, setShopLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user?._id) {
      setDetail(null);
      return;
    }
    const fetchDetail = async () => {
      setLoading(true);
      setError('');
      try {
        const token = await getAccessToken();
        const res = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/admin/users/${user._id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setDetail(res.data?.user || user);
      } catch (err) {
        console.error(err);
        setError('No se pudo cargar el detalle del usuario.');
        setDetail(user);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [isOpen, user, getAccessToken]);

  if (!isOpen || !user) return null;

  const data = detail || user;
  const isSuspended = data.accountStatus === 'suspended';
  // Estado de la tienda: aprobada (puede publicar) o pendiente de aprobación.
  const shopActive = Boolean(data.shop?.active ?? data.shopActive);
  const shopApproved = Boolean(data.shop?.approved ?? data.shopApproved);
  const shopApprovalReason = data.shop?.approvalReason ?? data.shopApprovalReason ?? '';

  // Suspender / Reactivar la cuenta.
  const handleToggleStatus = async () => {
    const suspend = !isSuspended;

    // Motivo obligatorio al suspender (prompt).
    let reason = '';
    if (suspend) {
      const res = await Swal.fire({
        title: 'Suspender cuenta',
        input: 'textarea',
        inputLabel: 'Motivo de la suspensión (obligatorio)',
        inputPlaceholder: 'Ej: incumplimiento de entrega, fraude, etc.',
        showCancelButton: true,
        confirmButtonText: 'Suspender',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e11d48',
        inputValidator: (v) => (!v || !v.trim() ? 'Ingresá un motivo.' : null),
      });
      if (!res.isConfirmed) return;
      reason = res.value.trim();
    } else {
      const res = await Swal.fire({
        title: 'Reactivar cuenta',
        text: 'La cuenta volverá a estar operativa. Sus publicaciones seguirán pausadas hasta que el vendedor las reactive.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Reactivar',
        cancelButtonText: 'Cancelar',
      });
      if (!res.isConfirmed) return;
    }

    try {
      setStatusLoading(true);
      const token = await getAccessToken();
      const res = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/users/${data._id}/status`,
        { status: suspend ? 'suspended' : 'active', reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Refrescamos el detalle con el nuevo estado.
      setDetail((prev) => ({ ...(prev || data), accountStatus: res.data?.user?.accountStatus }));
      // Refrescamos la tabla de usuarios para reflejar el nuevo estado.
      if (onStatusChange) onStatusChange();
      Swal.fire({
        icon: 'success',
        title: res.data?.message || 'Estado actualizado',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo actualizar',
        text: err?.response?.data?.message || 'Intentá de nuevo.',
      });
    } finally {
      setStatusLoading(false);
    }
  };

  // Aprobar / Desactivar la TIENDA (publicación sujeta a aprobación manual).
  const handleToggleShop = async () => {
    // Al desactivar pedimos motivo (opcional) para mostrárselo al vendedor.
    let reason = '';

    if (shopApproved) {
      // ── DESACTIVAR ──
      const res = await Swal.fire({
        title: 'Desactivar tienda',
        input: 'textarea',
        inputLabel: 'Motivo (se mostrará al vendedor)',
        inputPlaceholder: 'Ej: datos incompletos, verificación pendiente...',
        showCancelButton: true,
        confirmButtonText: 'Desactivar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e11d48',
      });
      if (!res.isConfirmed) return;
      reason = (res.value || '').trim();
    } else {
      // ── APROBAR ──
      const res = await Swal.fire({
        title: 'Aprobar tienda',
        text: 'El vendedor quedará habilitado para publicar productos de pago.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Aprobar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10b981',
      });
      if (!res.isConfirmed) return;
    }

    const approve = !shopApproved;
    try {
      setShopLoading(true);
      const token = await getAccessToken();
      const response = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/admin/users/${data._id}/shop`,
        { approved: approve, reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setDetail((prev) => ({
        ...(prev || data),
        shopApproved: response.data?.user?.shopApproved ?? approve,
        shopApprovalReason: response.data?.user?.shopApprovalReason ?? (approve ? '' : reason),
      }));
      if (onStatusChange) onStatusChange();
      Swal.fire({
        icon: 'success',
        title: response.data?.message || 'Tienda actualizada',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: approve ? 'No se pudo aprobar' : 'No se pudo desactivar',
        text: err?.response?.data?.message || 'Intentá de nuevo.',
      });
    } finally {
      setShopLoading(false);
    }
  };

  const InfoItem = ({ icon: Icon, label, value, mono }) => (
    <div className="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl">
      <Icon size={16} className="text-[#F26722] mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</p>
        <p className={`text-sm font-medium text-zinc-800 dark:text-zinc-200 break-all ${mono ? 'font-mono text-xs' : ''}`}>
          {value || '—'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
        {/* HEADER */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
              {data.avatar ? (
                <img src={data.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={28} className="text-zinc-400" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-black italic uppercase tracking-tighter">
                {data.fullName || data.firstName || data.username || 'Usuario'}
              </h2>
              <p className="text-xs text-zinc-500 font-mono">@{data.username || 'sin usuario'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500 dark:text-zinc-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {loading && (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="lg" text="Cargando detalle..." />
            </div>
          )}

          {error && !loading && <p className="text-sm text-rose-500">{error}</p>}

          {!loading && (
            <>
              {/* Estado de la cuenta (suspendida) */}
              {isSuspended && (
                <div className="p-4 rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-sm font-bold flex items-start gap-2">
                  <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p>Cuenta SUSPENDIDA</p>
                    {data.accountStatusReason && (
                      <p className="font-normal text-xs mt-1">Motivo: {data.accountStatusReason}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Aviso: tienda pendiente de aprobación */}
              {shopActive && !shopApproved && (
                <div className="p-4 rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-bold flex items-start gap-2">
                  <Clock size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p>Tienda PENDIENTE de aprobación</p>
                    <p className="font-normal text-xs mt-1">
                      El vendedor completó sus datos pero todavía no puede publicar productos de pago.
                    </p>
                    {shopApprovalReason && (
                      <p className="font-normal text-xs mt-1">Motivo: {shopApprovalReason}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Métricas */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-[#F26722]/10 rounded-3xl text-center">
                  <p className="text-2xl font-black italic text-[#F26722]">{data.totalSales ?? 0}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ventas</p>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-3xl text-center">
                  <p className="text-2xl font-black italic text-blue-500">{data.totalPurchases ?? 0}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Compras</p>
                </div>
                <div className="p-4 bg-emerald-500/10 rounded-3xl text-center">
                  <p className="text-2xl font-black italic text-emerald-500">{data.rating ?? 0}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Rating</p>
                </div>
              </div>

              {/* Datos personales */}
              <section>
                <h3 className="text-xs font-black italic uppercase mb-3 text-zinc-400 tracking-widest">
                  Datos del usuario
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoItem icon={Mail} label="Email" value={data.email} />
                  <InfoItem icon={CreditCard} label="DNI" value={data.dni} />
                  <InfoItem
                    icon={Hash}
                    label="Supabase ID"
                    value={data.supabaseId || data._id}
                    mono
                  />
                </div>
              </section>

              {/* Registro anti-abuso (cancelaciones/devoluciones/reclamos) */}
              <section>
                <h3 className="text-xs font-black italic uppercase mb-3 text-zinc-400 tracking-widest">
                  Registro anti-abuso
                </h3>
                {data.restricted && (
                  <div className="p-3 mb-3 rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-xs font-bold">
                    ⚠️ Usuario restringido
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoItem icon={X} label="Canceló (compra)" value={data.accounting?.cancellationsAsBuyer ?? 0} />
                  <InfoItem icon={X} label="Canceló (venta)" value={data.accounting?.cancellationsAsSeller ?? 0} />
                  <InfoItem icon={Mail} label="Reembolsos pedidos" value={data.accounting?.refundsRequested ?? 0} />
                  <InfoItem icon={Mail} label="Reembolsos pend." value={data.accounting?.refundsPending ?? 0} />
                  <InfoItem icon={FileText} label="Reclamos" value={data.accounting?.claimsOpened ?? 0} />
                  <InfoItem icon={Store} label="Devoluciones" value={data.accounting?.returnsRequested ?? 0} />
                  <InfoItem icon={Clock} label="Garantías vencidas" value={data.accounting?.expiredCollateralHolds ?? 0} />
                  <InfoItem icon={X} label="Orden rechazada (vendedor)" value={data.accounting?.collateralRejectedBySeller ?? 0} />
                  <InfoItem icon={Clock} label="Espera cancelada p/ comprador" value={data.accounting?.collateralHoldCancelledByBuyer ?? 0} />
                </div>
              </section>

              {/* TL;DR de la cuenta */}
              <section>
                <h3 className="text-xs font-black italic uppercase mb-3 text-zinc-400 tracking-widest">
                  Estado de la cuenta
                </h3>
                <div className="flex flex-wrap gap-2">
                  {data.isVerified && (
                    <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck size={12} /> Verificado
                    </span>
                  )}
                  {data.isSeller && (
                    <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#F26722]/20 text-[#F26722] flex items-center gap-1">
                      <Store size={12} /> Vendedor
                    </span>
                  )}
                  {data.shopActive && (
                    <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                      <Store size={12} /> Tienda activa
                    </span>
                  )}
                  {shopActive && (
                    <span
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                        shopApproved
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}
                    >
                      {shopApproved ? <ShieldCheck size={12} /> : <Clock size={12} />}
                      {shopApproved ? 'Tienda aprobada' : 'Aprobación pendiente'}
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 flex items-center gap-1">
                    <Star size={12} /> Rating {data.rating ?? 0}
                  </span>
                  <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 flex items-center gap-1">
                    <Calendar size={12} /> Registro: {data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>
              </section>

              {/* Tienda */}
              {data.shop?.name && (
                <section>
                  <h3 className="text-xs font-black italic uppercase mb-3 text-zinc-400 tracking-widest">
                    Tienda
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoItem icon={Store} label="Nombre" value={data.shop.name} />
                    <InfoItem icon={Star} label="Rating tienda" value={data.shop.rating ?? 0} />
                  </div>
                </section>
              )}

              {/* Bio */}
              {data.bio && (
                <section>
                  <h3 className="text-xs font-black italic uppercase mb-2 text-zinc-400 tracking-widest flex items-center gap-1">
                    <FileText size={12} /> Bio
                  </h3>
                  <p className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {data.bio}
                  </p>
                </section>
              )}
            </>
          )}
        </div>

        {/* FOOTER ACCIONES */}
        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-3">
          {/* Aprobar / Desactivar TIENDA (solo si el vendedor completó onboarding) */}
          {data.role !== 'admin' && shopActive && (
            <button
              onClick={handleToggleShop}
              disabled={shopLoading || loading}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-colors disabled:opacity-50 ${
                shopApproved
                  ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
              }`}
            >
              {shopLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : shopApproved ? (
                <ShieldAlert size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              {shopApproved ? 'Desactivar tienda' : 'Aprobar tienda'}
            </button>
          )}

          {data.role !== 'admin' && (
            <button
              onClick={handleToggleStatus}
              disabled={statusLoading || loading}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-colors disabled:opacity-50 ${
                isSuspended
                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20'
              }`}
            >
              {statusLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isSuspended ? (
                <ShieldCheck size={16} />
              ) : (
                <ShieldAlert size={16} />
              )}
              {isSuspended ? 'Reactivar cuenta' : 'Suspender cuenta'}
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-5 py-3 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cerrar Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminUserModal;
