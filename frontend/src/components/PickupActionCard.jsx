import React, { useState } from 'react';
import { Store, CheckCircle, PackageCheck, MapPin, Clock } from 'lucide-react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import LoadingSpinner from './LoadingSpinner';

/**
 * PickupActionCard
 * ─────────────────────────────────────────────────────────────
 * Tarjeta de acciones para órdenes con deliveryMethod === "pickup"
 * (RETIRO EN SUCURSAL). Reemplaza al ShippingStatusCard / ShippingForm,
 * que son exclusivos de envío a domicilio.
 *
 * VENDEDOR:
 *   - Marca el pedido como "listo para retirar" (pickupReady).
 *   - Confirma que el comprador retiró el producto (pickupConfirmed).
 * COMPRADOR:
 *   - Confirma que retiró el pedido (status: "completed"), lo que cierra
 *     la orden y libera los fondos al vendedor.
 */
export default function PickupActionCard({ order, role, onUpdate }) {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const isDark = document.documentElement.classList.contains('dark');

  const isCrypto = order.payment?.method === 'crypto';
  const pickup = order.pickupLocation || {};
  const details = order.pickupDetails || {};

  const readyForPickup = !!details.readyForPickup;
  const pickedUp = !!details.pickedUp;

  // El comprador puede confirmar el retiro cuando la orden está 'paid' y el
  // vendedor ya la marcó lista (o directamente registró el retiro).
  const buyerCanComplete = readyForPickup || pickedUp;

  // Texto del overlay de carga.
  // ⚠️ El vendedor NUNCA libera los fondos (eso lo hace el comprador al
  // confirmar el retiro), por lo que NO debe ver el mensaje de "liberando los
  // USDT del escrow". Le mostramos un texto acorde a su propia acción.
  const loadingText =
    role === 'seller'
      ? 'Procesando la operación en sucursal...'
      : isCrypto
        ? 'Procesando: liberando los USDT del contrato al vendedor...'
        : 'Procesando el retiro en sucursal...';

  // Instrucciones del punto de retiro (si el vendedor las cargó).
  const addressLine = [
    pickup.street && `${pickup.street} ${pickup.streetNumber || ''}`.trim(),
    pickup.city,
    pickup.state,
  ]
    .filter(Boolean)
    .join(', ');

  // ── VENDEDOR: marcar listo para retirar ──
  const handleMarkReady = async () => {
    const confirm = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿Marcar listo para retirar?</span>',
      text: 'El comprador recibirá un aviso de que su pedido lo espera en tu punto de retiro.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#F26722',
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, ESTÁ LISTO',
      cancelButtonText: 'CANCELAR',
      background: isDark ? '#18181b' : '#fff',
      color: isDark ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-[#F26722]/20' },
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    const token = await getAccessToken();
    try {
      const { data } = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}`,
        { pickupReady: true, pickupNote: note || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
        // ⚠️ Apagamos el overlay ANTES de abrir el Swal. Si no, el overlay
        // fullScreen tapa el modal de SweetAlert y queda "pegado" detrás.
        setLoading(false);
        await Swal.fire({
          title: '¡PEDIDO LISTO!',
          text: 'El comprador fue notificado de que puede retirar su pedido.',
          icon: 'success',
          confirmButtonColor: '#F26722',
          background: isDark ? '#18181b' : '#fff',
          color: isDark ? '#fff' : '#000',
          customClass: { popup: 'rounded-[2.5rem]' },
        });
        onUpdate?.();
      }
    } catch (error) {
      Swal.fire({
        title: 'ERROR',
        text:
          error?.response?.data?.message ||
          'No se pudo marcar el pedido como listo para retirar.',
        icon: 'error',
        confirmButtonColor: '#ef4444',
        background: isDark ? '#18181b' : '#fff',
        color: isDark ? '#fff' : '#000',
        customClass: { popup: 'rounded-[2.5rem]' },
      });
    } finally {
      setLoading(false);
    }
  };

  // ── VENDEDOR: confirmar que el comprador retiró ──
  const handleConfirmPickedUp = async () => {
    const confirm = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿El comprador retiró el pedido?</span>',
      text: 'Confirmá solo si ya le entregaste el producto en tu punto de retiro.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, LO RETIRÓ',
      cancelButtonText: 'CANCELAR',
      background: isDark ? '#18181b' : '#fff',
      color: isDark ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-emerald-500/20' },
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    const token = await getAccessToken();
    try {
      const { data } = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}`,
        { pickupConfirmed: true },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
        // Apagamos el overlay antes del Swal (ver comentario en handleMarkReady).
        setLoading(false);
        await Swal.fire({
          title: '¡ENTREGA REGISTRADA!',
          text: 'El comprador fue notificado para que confirme el retiro y se cierre la compra.',
          icon: 'success',
          confirmButtonColor: '#F26722',
          background: isDark ? '#18181b' : '#fff',
          color: isDark ? '#fff' : '#000',
          customClass: { popup: 'rounded-[2.5rem]' },
        });
        onUpdate?.();
      }
    } catch (error) {
      Swal.fire({
        title: 'ERROR',
        text:
          error?.response?.data?.message ||
          'No se pudo registrar la entrega en sucursal.',
        icon: 'error',
        confirmButtonColor: '#ef4444',
        background: isDark ? '#18181b' : '#fff',
        color: isDark ? '#fff' : '#000',
        customClass: { popup: 'rounded-[2.5rem]' },
      });
    } finally {
      setLoading(false);
    }
  };

  // ── COMPRADOR: confirmar que retiró el pedido (cierra la orden) ──
  const handleBuyerComplete = async () => {
    const confirm = await Swal.fire({
      title: '<span class="font-black uppercase italic">¿Retiraste tu pedido?</span>',
      text: 'Confirma solo si ya tenés el producto y está en las condiciones acordadas. Se completa la orden y se liberan los fondos al vendedor. No puedes revertir esta acción.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#18181b',
      confirmButtonText: 'SÍ, LO RETIRÉ',
      cancelButtonText: 'CANCELAR',
      background: isDark ? '#18181b' : '#fff',
      color: isDark ? '#fff' : '#000',
      customClass: { popup: 'rounded-[2.5rem] border-2 border-emerald-500/20' },
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    const token = await getAccessToken();
    try {
      const { data } = await axios.patch(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}`,
        { status: 'completed' },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
        // Apagamos el overlay antes del Swal (ver comentario en handleMarkReady).
        setLoading(false);
        await Swal.fire({
          title: '¡ORDEN FINALIZADA!',
          text: isCrypto
            ? 'Gracias por confirmar. Los USDT del contrato fueron liberados al vendedor.'
            : 'Gracias por confirmar. Se completó la orden.',
          icon: 'success',
          confirmButtonColor: '#F26722',
          background: isDark ? '#18181b' : '#fff',
          color: isDark ? '#fff' : '#000',
          customClass: { popup: 'rounded-[2.5rem]' },
        });
        onUpdate?.();
      }
    } catch (error) {
      Swal.fire({
        title: 'No se pudo procesar',
        html: `${error?.response?.data?.message || 'No se pudo completar la orden.'}<br/><br/><span style="font-size:12px;opacity:.7">La orden no se marcó como completada. Podés reintentar o contactar a soporte.</span>`,
        icon: 'error',
        confirmButtonColor: '#ef4444',
        background: isDark ? '#18181b' : '#fff',
        color: isDark ? '#fff' : '#000',
        customClass: { popup: 'rounded-[2.5rem]' },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {loading && <LoadingSpinner fullScreen text={loadingText} />}

      <div className="p-6 rounded-[2.5rem] border-2 border-violet-500/20 bg-violet-500/5 transition-all duration-500">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm">
            <Store className="text-violet-500" />
          </div>

          <div className="flex-1">
            <h3 className="font-black uppercase tracking-tight dark:text-white text-lg italic">
              Retiro en sucursal
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-medium">
              {!readyForPickup && !pickedUp &&
                (role === 'seller'
                  ? 'Prepará el pedido y marcalo como listo para retirar cuando el comprador pueda pasar a buscarlo.'
                  : 'Tu pedido está en preparación. Te avisaremos cuando esté listo para retirar.')}
              {readyForPickup &&
                !pickedUp &&
                (role === 'seller'
                  ? 'El pedido está marcado como listo. Confirmá la entrega cuando el comprador lo retire.'
                  : 'Tu pedido te espera. Acercate al punto de retiro, retiralo y confirmá la recepción.')}
              {pickedUp &&
                (role === 'seller'
                  ? 'Registraste la entrega. Esperando que el comprador confirme el retiro para cerrar la compra.'
                  : 'Confirmá el retiro para completar la compra y liberar los fondos al vendedor.')}
            </p>

            {/* Datos del punto de retiro */}
            {(pickup.name || addressLine) && (
              <div className="mt-4 p-4 bg-white/60 dark:bg-black/20 rounded-2xl border border-black/5 dark:border-white/5 space-y-1">
                {pickup.name && (
                  <p className="text-sm font-bold dark:text-zinc-200 flex items-center gap-2">
                    <Store size={14} className="text-violet-500" /> {pickup.name}
                  </p>
                )}
                {addressLine && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <MapPin size={13} /> {addressLine}
                  </p>
                )}
                {details.readyNote && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-2">
                    <Clock size={13} className="mt-0.5" />
                    <span>Nota del vendedor: {details.readyNote}</span>
                  </p>
                )}
              </div>
            )}

            {/* ── ACCIONES VENDEDOR ── */}
            {role === 'seller' && (
              <div className="mt-6 space-y-3">
                {!readyForPickup && !pickedUp && (
                  <>
                    <div className="p-4 bg-white/50 dark:bg-black/20 rounded-3xl border border-black/5">
                      <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">
                        Nota para el comprador (opcional)
                      </label>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={300}
                        placeholder="Ej: Pasá de 9 a 18hs por el local"
                        className="w-full mt-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl p-3 font-medium dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <button
                      onClick={handleMarkReady}
                      disabled={loading}
                      className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
                    >
                      <PackageCheck size={20} /> Marcar listo para retirar
                    </button>
                  </>
                )}

                {readyForPickup && !pickedUp && (
                  <button
                    onClick={handleConfirmPickedUp}
                    disabled={loading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle size={20} /> Confirmar que lo retiró
                  </button>
                )}

                {pickedUp && (
                  <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-3xl border-2 border-emerald-300/50 dark:border-emerald-500/40">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
                      ✓ Entrega registrada
                    </p>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                      Esperando que el comprador confirme el retiro para cerrar la
                      compra y liberar los fondos.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── ACCIONES COMPRADOR ── */}
            {role === 'buyer' && (
              <div className="mt-6">
                {buyerCanComplete ? (
                  <button
                    onClick={handleBuyerComplete}
                    disabled={loading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle size={20} /> Confirmar retiro y finalizar
                  </button>
                ) : (
                  <div className="p-4 bg-white/50 dark:bg-black/20 rounded-3xl border border-black/5 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                      Esperando que el vendedor prepare tu pedido
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
