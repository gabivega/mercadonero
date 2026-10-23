import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { usePrivy } from '../Utils/authClient';
import Swal from 'sweetalert2';
import {
  Store,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  KeyRound,
  Copy,
  RefreshCw,
  Loader2,
  Link2,
} from 'lucide-react';
import { InlineLoadingSpinner } from './LoadingSpinner.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// AdminStoreConnections
//
// Panel de ADMIN para habilitar/gestionar conexiones de tienda Tiendanube.
//
// Flujo:
//   1) "+ Conectar tienda": email del user + dominio.
//   2) "Enviar OTP": genera un código (lo devolvemos al admin para pasárselo
//      al usuario por el canal que quiera).
//   3) "Verificar": ingresa el OTP (o verificación manual) → verified.
//   4) Una vez verificado, el usuario ya puede importar desde su dashboard.
//
// También permite suspender/reactivar y eliminar.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META = {
  pending: { label: 'Pendiente', cls: 'bg-amber-500/10 text-amber-500', icon: Clock },
  verified: { label: 'Verificada', cls: 'bg-green-500/10 text-green-500', icon: ShieldCheck },
  suspended: { label: 'Suspendida', cls: 'bg-rose-500/10 text-rose-500', icon: ShieldAlert },
};

export default function AdminStoreConnections() {
  const { getAccessToken } = usePrivy();
  const serverUrl = import.meta.env.VITE_SERVER_URL;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${serverUrl}/api/admin/store-connections`, {
        headers: await authHeaders(),
      });
      setItems(data.items || []);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    } finally {
      setLoading(false);
    }
  }, [serverUrl, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Crear conexión ──
  const handleCreate = async () => {
    const { value: form } = await Swal.fire({
      title: 'Conectar tienda Tiendanube',
      html: `
        <input id="swal-email" class="swal2-input" placeholder="Email del usuario (MN)" />
        <input id="swal-domain" class="swal2-input" placeholder="Dominio (ej: redsports.com.ar)" />
        <input id="swal-vemail" class="swal2-input" placeholder="Email autorizado (opcional)" />
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Conectar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#fff',
      confirmButtonColor: '#F26722',
      preConfirm: () => ({
        email: document.getElementById('swal-email').value.trim(),
        domain: document.getElementById('swal-domain').value.trim(),
        verificationEmail: document.getElementById('swal-vemail').value.trim(),
      }),
    });
    if (!form) return;

    if (!form.email || !form.domain) {
      return Swal.fire({ title: 'Faltan datos', text: 'Email y dominio son obligatorios.', icon: 'warning', background: '#1A1A1A', color: '#fff' });
    }

    try {
      await axios.post(`${serverUrl}/api/admin/store-connections`, form, { headers: await authHeaders() });
      Swal.fire({ toast: true, position: 'top-end', title: 'Conexión creada', icon: 'success', showConfirmButton: false, timer: 2000, background: '#1A1A1A', color: '#fff' });
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    }
  };

  // ── Enviar OTP ──
  const handleSendOtp = async (conn) => {
    setBusyId(conn._id);
    try {
      const { data } = await axios.post(
        `${serverUrl}/api/admin/store-connections/${conn._id}/send-otp`,
        {},
        { headers: await authHeaders() }
      );
      await Swal.fire({
        title: 'OTP generado',
        html: `
          <p style="font-size:13px;margin-bottom:8px">Comunicáselo al titular de <b>${conn.domain}</b>:</p>
          <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#F26722">${data.otp}</div>
          <p style="font-size:11px;opacity:.6;margin-top:8px">Vence: ${new Date(data.expiresAt).toLocaleString('es-AR')}</p>
        `,
        icon: 'success',
        background: '#1A1A1A',
        color: '#fff',
        confirmButtonColor: '#F26722',
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    } finally {
      setBusyId(null);
    }
  };

  // ── Verificar ──
  const handleVerify = async (conn) => {
    const { value: otp, isConfirmed } = await Swal.fire({
      title: 'Verificar tienda',
      html: `
        <input id="swal-otp" class="swal2-input" placeholder="Código OTP" />
        <label style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:10px;font-size:12px">
          <input id="swal-manual" type="checkbox" /> Verificar manualmente (sin OTP)
        </label>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Verificar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#fff',
      confirmButtonColor: '#F26722',
      preConfirm: () => ({
        otp: document.getElementById('swal-otp').value.trim(),
        manual: document.getElementById('swal-manual').checked,
      }),
    });
    if (!isConfirmed) return;

    try {
      await axios.post(
        `${serverUrl}/api/admin/store-connections/${conn._id}/verify`,
        otp,
        { headers: await authHeaders() }
      );
      Swal.fire({ toast: true, position: 'top-end', title: 'Tienda verificada', icon: 'success', showConfirmButton: false, timer: 2000, background: '#1A1A1A', color: '#fff' });
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    }
  };

  // ── Suspender / Reactivar ──
  const handleToggleStatus = async (conn) => {
    const newStatus = conn.status === 'suspended' ? 'verified' : 'suspended';
    try {
      await axios.patch(
        `${serverUrl}/api/admin/store-connections/${conn._id}`,
        { status: newStatus },
        { headers: await authHeaders() }
      );
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    }
  };

  // ── Eliminar ──
  const handleDelete = async (conn) => {
    const confirm = await Swal.fire({
      title: '¿Eliminar conexión?',
      text: `Se desconectará ${conn.domain}. Los productos importados NO se borran.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#fff',
      confirmButtonColor: '#ef4444',
    });
    if (!confirm.isConfirmed) return;

    try {
      await axios.delete(`${serverUrl}/api/admin/store-connections/${conn._id}`, {
        headers: await authHeaders(),
      });
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#1A1A1A', color: '#fff' });
    }
  };

  const copyDomain = (domain) => {
    navigator.clipboard?.writeText(domain);
    Swal.fire({ toast: true, position: 'top-end', title: 'Dominio copiado', icon: 'success', showConfirmButton: false, timer: 1500, background: '#1A1A1A', color: '#fff' });
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#F26722]/10 text-[#F26722]">
          <Store size={20} />
        </div>
        <div>
          <h2 className="font-black text-sm uppercase tracking-wider text-gray-800 dark:text-white">
            Conexiones de Tiendanube
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Habilitá cuentas para importar su tienda (verificación por OTP).
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-[#F26722] text-white rounded-xl font-bold text-xs uppercase hover:bg-[#d9531e] transition-all"
        >
          <Plus size={15} /> Conectar tienda
        </button>
        <button
          onClick={load}
          className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
          title="Recargar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <InlineLoadingSpinner size="lg" text="Cargando conexiones..." />
        </div>
      ) : items.length === 0 ? (
        <div className="py-14 text-center text-gray-400 text-sm font-bold border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[24px]">
          Todavía no hay tiendas conectadas.
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[24px] overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
          {items.map((c) => {
            const meta = STATUS_META[c.status] || STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div key={c._id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                    <button onClick={() => copyDomain(c.domain)} className="font-black text-sm dark:text-white truncate hover:text-[#F26722]">
                      {c.domain}
                    </button>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${meta.cls}`}>
                      <Icon size={11} /> {meta.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {c.owner?.email || c.owner?.username || '—'}
                    {c.verification?.email ? ` · OTP: ${c.verification.email}` : ''}
                  </p>
                  {c.usage?.totalImported > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {c.usage.totalImported} importados
                      {c.sync?.lastSyncAt ? ` · sync: ${new Date(c.sync.lastSyncAt).toLocaleDateString('es-AR')}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {c.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleSendOtp(c)}
                        disabled={busyId === c._id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-200 font-bold text-[11px] hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-50"
                      >
                        {busyId === c._id ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                        OTP
                      </button>
                      <button
                        onClick={() => handleVerify(c)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 text-green-600 font-bold text-[11px] hover:bg-green-500/20"
                      >
                        <ShieldCheck size={13} /> Verificar
                      </button>
                    </>
                  )}
                  {c.status !== 'pending' && (
                    <button
                      onClick={() => handleToggleStatus(c)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-[11px] ${c.status === 'suspended' ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20' : 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'}`}
                    >
                      {c.status === 'suspended' ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                      {c.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(c)}
                    className="p-2 rounded-xl text-red-500 hover:bg-red-500/10"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-400 leading-relaxed">
        Al verificar una tienda, el usuario podrá importar su catálogo desde su panel de
        vendedor (import individual, masivo por categorías y sincronización de stock/precios).
      </p>
    </div>
  );
}
