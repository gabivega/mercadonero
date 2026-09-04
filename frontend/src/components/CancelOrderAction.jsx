import React, { useState } from 'react';
import { XCircle, RotateCcw, Star, Mail, CheckCheck, ShieldAlert, MoreVertical } from 'lucide-react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import Swal from 'sweetalert2';
import LoadingSpinner from './LoadingSpinner';

/**
 * Gestión de cancelación / garantía previa al envío.
 *
 * ── COMPRADOR ──
 *  - [POLÍTICA ACTUAL] Solo puede CANCELAR/iniciar la cancelación mientras la
 *    orden NO está marcada como pagada, es decir únicamente en
 *    'pending_payment'. Si declara "no pagué" → libera la garantía y cancela
 *    directo. Si declara "sí aboné" (todavía sin notificar) → pasa por el
 *    flujo de notificación/reembolso.
 *  - Una vez la orden figura con el pago notificado ('verifying_payment') o
 *    pagada ('paid'), el comprador ya no cancela desde la interfaz: debe
 *    resolverlo por chat con el vendedor (o, en casos especiales, soporte/admin).
 *
 *  NOTA: el flujo histórico de "verifying_payment → reembolso directo" quedó
 *  COMENTADO. Si en el futuro se quiere habilitar de nuevo la cancelación del
 *  comprador cuando el pago ya fue notificado, hay que:
 *   (1) Quitar la restricción en OrderDetail (descomentar verifying_payment), y
 *   (2) Descomentar la llamada "await handleBuyerPaidFlow();" en handleBuyerInitiate.
 *
 * ── VENDEDOR ──
 *  - Nunca libera su garantía por sí mismo (política anti-fraude). Solo puede
 *    solicitar al admin la liberación manual, que se resuelve tras verificar
 *    con el comprador.
 *  - Si hay una solicitud de reembolso con pago, el vendedor confirma haber
 *    reembolsado y espera la confirmación del comprador.
 */
const CancelOrderAction = ({ order, role, onUpdate }) => {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  const swalBase = {
    background: isDark ? '#18181b' : '#fff',
    color: isDark ? '#fff' : '#111',
    customClass: {
      popup: 'rounded-[2.5rem] border-2 border-[#F26722]/20',
      confirmButton:
        'rounded-2xl font-bold uppercase tracking-widest px-6 !bg-[#F26722]',
      cancelButton: 'rounded-2xl font-bold uppercase tracking-widest px-6',
    },
  };

  const iAmBuyer = role === 'buyer';
  const status = order.status;
  const pending = order.pendingRequest?.exists || false;
  const pendingStatus = order.pendingRequest?.status || 'pending';

  const callApi = async (url, body = {}) => {
    const token = await getAccessToken();
    const { data } = await axios.patch(
      `${import.meta.env.VITE_SERVER_URL}${url}`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return data;
  };

  const handleApiError = (err, fallback) => {
    Swal.fire({
      ...swalBase,
      icon: 'error',
      title: 'Error',
      text: err?.response?.data?.message || err?.message || fallback,
    });
  };

  // Spinner de carga a pantalla completa mientras se procesa la operación.
  // Evita que el usuario cierre o toque otra cosa mientras espera la respuesta
  // del servidor (la pantalla quedaba "congelada" sin feedback).
  const showProcessing = (message = 'Procesando solicitud...') => {
    Swal.fire({
      ...swalBase,
      title: message,
      allowOutsideClick: false,
      allowEscapeKey: false,
      allowEnterKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  };
  const closeProcessing = () => {
    if (Swal.isVisible()) Swal.close();
  };

  // ══════════════════════════════════════════════
  // FLUJO COMPRADOR
  // ══════════════════════════════════════════════
  // PUNTO 1: flujo contextual según el estado.
  //  - pending_payment: todavía no notificó el pago → informamos el contexto y
  //    ofrecemos las 2 opciones. Si eligió "No pagué" cancela directo; si eligió
  //    "Ya pagué" notifica el pago (verifying_payment) y luego solicita reembolso.
  //  - verifying_payment: el pago ya está notificado → va directo al reembolso,
  //    sin volver a preguntarle genéricamente si pagó.
  const handleBuyerInitiate = async () => {
    const isPendingPayment = status === 'pending_payment';

    const step1 = await Swal.fire({
      ...swalBase,
      icon: 'warning',
      title: '¿Cancelar esta compra?',
      html: isPendingPayment
        ? `<p style="text-align:left; font-size:16px;font-weight:600; margin:0; color:${isDark ? '#a1a1aa' : '#52525b'}">Cancelar ordenes creadas puede llevar a la suspension definitiva de tu cuenta.</p>
        <p style="text-align:left; font-size:13px; margin:0; color:${isDark ? '#a1a1aa' : '#52525b'}">
            Tu orden figura como <b>pendiente de pago</b>. Si ya abonaste, marca la orden como pagada para poder tramitar tu reintegro.
          </p>`
        : `<p style="text-align:left; font-size:13px; margin:0; color:${isDark ? '#a1a1aa' : '#52525b'}">
            Tu orden ya tiene el <b>pago notificado</b>. Para cancelarla vas a pasar
            por el flujo de reembolso, donde el vendedor te devuelve el dinero y vos
            confirmás haberlo recibido.
          </p>`,
      showCancelButton: true,
      confirmButtonText: 'SÍ, CONTINUAR',
      cancelButtonText: 'VOLVER',
    });
    if (!step1.isConfirmed) return;

    // Solo en pending_payment preguntamos sobre el pago (2 opciones). En
    // verifying_payment el pago ya está notificado → reembolso directo.
    if (isPendingPayment) {
      const step2 = await Swal.fire({
        ...swalBase,
        title: '¿Has realizado el pago?',
        text: 'Necesitamos saberlo para gestionar la garantía correctamente.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'SÍ, ABONÉ LA ORDEN',
        cancelButtonText: 'NO ABONÉ LA ORDEN',
        reverseButtons: true,
      });

      if (step2.isConfirmed) {
        await handleBuyerPaidFlow();
      } else if (step2.dismiss === Swal.DismissReason.cancel) {
        await handleBuyerNotPaidFlow();
      }
    } else {
      // ⚠️ [POLÍTICA ACTUAL] Este componente ya NO debería renderizarse para el
      // comprador en 'verifying_payment' (el menú de cancelar se oculta desde
      // OrderDetail una vez que la orden está marcada como pagada). Por
      // seguridad/contingencia (si por alguna vía llega acá con el pago ya
      // notificado), NO iniciamos la cancelación/reembolso del comprador de
      // forma directa: lo deriva al chat con el vendedor.
      //
      // Si en el futuro se quiere volver a permitir que el comprador cancele
      // una orden cuyo pago ya está notificado (verifying_payment), volver a
      // habilitar esta llamada:
      // await handleBuyerPaidFlow();
      await Swal.fire({
        ...swalBase,
        icon: 'info',
        title: 'Orden con pago notificado',
        text: 'Tu orden ya figura con el pago notificado. Estas cancelaciones se resuelven coordinando con el vendedor (chat) o, en casos especiales, con el equipo de soporte/admin. Contactá al vendedor desde la orden para acordar cómo proceder.',
      });
    }
  };

  const handleBuyerNotPaidFlow = async () => {
    // Solo se invoca desde 'pending_payment'. En 'verifying_payment' el pago ya
    // está notificado, por lo que no aplica este caso de "no aboné".
    const confirm = await Swal.fire({
      ...swalBase,
      icon: 'info',
      title: 'Confirmar cancelación',
      text: 'Al no haber abonado, se liberará la garantía al vendedor y la orden quedará cancelada. No puedes revertir esta acción.',
      showCancelButton: true,
      confirmButtonText: 'CONFIRMAR',
      cancelButtonText: 'VOLVER',
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    showProcessing('Cancelando y liberando la garantía...');
    try {
      const data = await callApi(`/api/order/${order._id}/cancel`, {
        paidStatus: 'not_paid',
        reason: 'Cancelación sin pago',
      });
      closeProcessing();
      await Swal.fire({
        ...swalBase,
        icon: 'success',
        title: 'Orden cancelada',
        text: 'La orden fue cancelada y la garantía liberada al vendedor.',
      });
      onUpdate(data.order);
    } catch (err) {
      closeProcessing();
      handleApiError(err, 'No se pudo cancelar la orden.');
    } finally {
      setLoading(false);
    }
  };

  const handleBuyerPaidFlow = async () => {
    const { value: bank } = await Swal.fire({
      ...swalBase,
      title: 'Datos para el reembolso',
      html: `
        <p style="text-align:left; margin-bottom:12px; font-size:13px; color:${isDark ? '#a1a1aa' : '#52525b'}">
          La garantía del vendedor quedará retenida hasta que te reembolse y confirmes la recepción.
          Ingresá los datos bancarios donde recibirás el pago de vuelta.
        </p>
        <form id="refundForm" style="display:flex; flex-direction:column; gap:8px; text-align:left;">
          <input id="r_holder" class="swal2-input" placeholder="Nombre del titular" style="margin:0">
          <input id="r_bank" class="swal2-input" placeholder="Banco" style="margin:0">
          <input id="r_cbu" class="swal2-input" placeholder="CBU / CVU *" style="margin:0">
          <input id="r_alias" class="swal2-input" placeholder="Alias" style="margin:0">
          <input id="r_cuit" class="swal2-input" placeholder="CUIT / CUIL" style="margin:0">
        </form>
      `,
      focusConfirm: false,
      preConfirm: () => {
        const holderName = document.getElementById('r_holder')?.value || '';
        const bankName = document.getElementById('r_bank')?.value || '';
        const cbuCvu = document.getElementById('r_cbu')?.value || '';
        const alias = document.getElementById('r_alias')?.value || '';
        const cuitCuil = document.getElementById('r_cuit')?.value || '';
        if (!cbuCvu) {
          Swal.showValidationMessage('El CBU/CVU es obligatorio');
          return false;
        }
        return { holderName, bankName, cbuCvu, alias, cuitCuil };
      },
      showCancelButton: true,
      confirmButtonText: 'SOLICITAR REEMBOLSO',
      cancelButtonText: 'VOLVER',
    });

    if (!bank) return;

    setLoading(true);
    showProcessing('Registrando la solicitud de reembolso...');
    try {
      const data = await callApi(`/api/order/${order._id}/cancel`, {
        paidStatus: 'paid',
        reason: 'Cancelación con pago - reembolso solicitado',
        refundBankAccount: bank,
      });
      closeProcessing();
      await Swal.fire({
        ...swalBase,
        icon: 'success',
        title: 'Solicitud registrada',
        text: 'Se notificó al vendedor. Te devolverá el pago y deberás confirmar la recepción para cerrar la cancelación.',
      });
      onUpdate(data.order);
    } catch (err) {
      closeProcessing();
      handleApiError(err, 'No se pudo registrar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // COMPRADOR: confirma que recibió el reintegro
  // ══════════════════════════════════════════════
  const handleBuyerConfirmReceived = async () => {
    const confirm = await Swal.fire({
      ...swalBase,
      icon: 'success',
      title: 'Confirmar que recibiste el reintegro',
      text: 'Confirmá solo si ya te llegó la transferencia del vendedor. Esto cerrará la cancelación y liberará su garantía.',
      showCancelButton: true,
      confirmButtonText: 'SÍ, LO RECIBÍ',
      cancelButtonText: 'VOLVER',
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    showProcessing('Confirmando y liberando la garantía...');
    try {
      const data = await callApi(
        `/api/order/${order._id}/buyer-confirms-refund-received`,
      );
      closeProcessing();
      await Swal.fire({
        ...swalBase,
        icon: 'success',
        title: '¡Listo!',
        text: 'Confirmaste la recepción del reintegro. La orden quedó cancelada y la garantía del vendedor fue liberada.',
      });
      onUpdate(data.order);
    } catch (err) {
      closeProcessing();
      handleApiError(err, 'No se pudo confirmar la recepción.');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // VENDEDOR: confirma que ya reembolsó al comprador
  // ══════════════════════════════════════════════
  const handleVendorConfirmRefund = async () => {
    const confirm = await Swal.fire({
      ...swalBase,
      icon: 'warning',
      title: '¿Ya reembolsaste al comprador?',
      text: 'Confirmá solo si ya le transferiste el dinero. Tu garantía seguirá retenida hasta que el comprador confirme la recepción.',
      showCancelButton: true,
      confirmButtonText: 'SÍ, YA REEMBOLSÉ',
      cancelButtonText: 'VOLVER',
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    showProcessing('Confirmando el reembolso...');
    try {
      const data = await callApi(
        `/api/order/${order._id}/vendor-confirms-refund`,
      );
      closeProcessing();
      await Swal.fire({
        ...swalBase,
        icon: 'success',
        title: 'Reembolso confirmado',
        text: 'Avisamos al comprador. Cuando confirme la recepción, tu garantía será liberada.',
      });
      onUpdate(data.order);
    } catch (err) {
      closeProcessing();
      handleApiError(err, 'No se pudo confirmar el reembolso.');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // VENDEDOR: solicita liberación de garantía al admin
  // ══════════════════════════════════════════════
  const handleVendorRequestAdminRelease = async () => {
    const { value: reason } = await Swal.fire({
      ...swalBase,
      title: 'Cancelar Orden',
      html: `
        <p style="text-align:left; margin-bottom:10px; font-size:13px; color:${isDark ? '#a1a1aa' : '#52525b'}">
          Podés solicitar la cancelación y la liberación de los fondos en
          garantía. Este proceso se realiza de forma manual por los
          administradores: primero se cancela la orden y, tras verificar con el
          comprador que no hubo pago, se libera la garantía.
        </p>
        <input id="r_reason" class="swal2-input" placeholder="Motivo de la solicitud" style="margin:0">
      `,
      focusConfirm: false,
      preConfirm: () => document.getElementById('r_reason')?.value || '',
      showCancelButton: true,
      confirmButtonText: 'ENVIAR SOLICITUD',
      cancelButtonText: 'VOLVER',
    });
    if (reason === null || reason === undefined) return;

    setLoading(true);
    showProcessing('Enviando la solicitud...');
    try {
      const data = await callApi(`/api/order/${order._id}/request-admin-release`, {
        reason,
      });
      closeProcessing();
      await Swal.fire({
        ...swalBase,
        icon: 'success',
        title: 'Solicitud enviada',
        text: 'El admin recibió tu solicitud. La garantía se liberará manualmente tras verificar con el comprador.',
      });
      onUpdate(data.order);
    } catch (err) {
      closeProcessing();
      handleApiError(err, 'No se pudo enviar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // VENDEDOR: cancela una orden ya PAGADA (transferencia bancaria).
  // Para evitar que el vendedor libere su garantía sin control, cuando la
  // orden ya está pagada el vendedor NO puede liberar la garantía por sí mismo:
  // registramos una solicitud de reembolso (pendingRequest con initiator
  // 'seller'). El vendedor deberá devolver el dinero al comprador y éste
  // confirmar la recepción recién para que la garantía sea liberada.
  // ══════════════════════════════════════════════
  const handleVendorInitiateCancel = async () => {
    const confirm = await Swal.fire({
      ...swalBase,
      icon: 'warning',
      title: '¿Cancelar esta venta?',
      html: `
        <p style="text-align:left; font-size:14px; font-weight:600; margin:0 0 10px;
             color:${isDark ? '#a1a1aa' : '#52525b'}">
          La orden ya está <b>pagada</b>. Para cancelarla deberás:
        </p>
        <ol style="text-align:left; font-size:13px; margin:0 0 8px 18px;
            color:${isDark ? '#a1a1aa' : '#52525b'}; line-height:1.6;">
          <li>Devolver el dinero al comprador (reembolso).</li>
          <li>Confirmar que reembolsaste.</li>
          <li>Que el comprador confirme haberlo recibido.</li>
        </ol>
        <p style="text-align:left; font-size:13px; margin:0; color:#ef4444; font-weight:600;">
          Tu garantía se liberará recién cuando el comprador confirme la recepción del reintegro.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: 'SÍ, CANCELAR',
      cancelButtonText: 'VOLVER',
    });
    if (!confirm.isConfirmed) return;

    setLoading(true);
    showProcessing('Registrando la cancelación...');
    try {
      const data = await callApi(`/api/order/${order._id}/cancel`, {
        paidStatus: 'paid',
        reason: 'Cancelación iniciada por el vendedor con la orden pagada',
      });
      closeProcessing();
      await Swal.fire({
        ...swalBase,
        icon: 'success',
        title: 'Cancelación en proceso',
        text: 'Se notificó al comprador. Deberás devolverle el dinero y él confirmará la recepción para que tu garantía sea liberada.',
      });
      onUpdate(data.order);
    } catch (err) {
      closeProcessing();
      handleApiError(err, 'No se pudo iniciar la cancelación.');
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════
  // RENDER según estados
  // ══════════════════════════════════════════════

  // 1) Solicitud de reembolso activa (verifying_payment & abonado)
  if (pending) {
    // --- COMPRADOR con reembolso en curso ---
    if (iAmBuyer) {
      const compradorEspera = pendingStatus === 'pending';
      const vendedorReembolso = pendingStatus === 'refunded_by_vendor';
      return (
        <div className="bg-amber-500/10 border-2 border-amber-500/60 p-6 rounded-[2.5rem]">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-amber-500 p-2 rounded-xl text-white"><Star size={20} /></div>
            <h3 className="font-black uppercase italic dark:text-white">Cancelación en proceso</h3>
          </div>
          {compradorEspera ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Solicitaste la cancelación. La garantía está retenida y el vendedor
              debe reembolsarte. Cuando lo haga, se te habilitará la confirmación
              de recepción.
            </p>
          ) : vendedorReembolso ? (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                El vendedor confirmó que te reembolsó. Verificá que te llegó la
                transferencia y confirmá la recepción para cerrar la cancelación
                y liberar su garantía.
              </p>
              <button
                onClick={handleBuyerConfirmReceived}
                disabled={loading}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <LoadingSpinner size="sm" /> : <><CheckCheck size={18} /> Confirmar que recibí el reintegro</>}
              </button>
            </>
          ) : null}
        </div>
      );
    }

    // --- VENDEDOR con reembolso en curso ---
    const vendorEsperaComprador = pendingStatus === 'refunded_by_vendor';
    // La cancelación puede haber sido iniciada por el COMPRADOR o por el
    // VENDEDOR. El mensaje debe reflejar quién la inició para que sea claro.
    const iniciadaPorVendedor = order.pendingRequest?.initiator === 'seller';
    return (
      <div className="bg-amber-500/10 border-2 border-amber-500/60 p-6 rounded-[2.5rem]">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-amber-500 p-2 rounded-xl text-white"><Star size={20} /></div>
          <h3 className="font-black uppercase italic dark:text-white">Reembolso pendiente</h3>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {iniciadaPorVendedor ? (
            <>Iniciaste la cancelación de esta venta porque está pagada. Devolvele
            el dinero al comprador y confirmá que lo reembolsaste para continuar.</>
          ) : (
            <>El comprador solicitó cancelar con pago. Devolvele el dinero y confirmá
            que lo reembolsaste para continuar.</>
          )}
        </p>
        {order.pendingRequest?.refundBankAccount && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 my-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-[#F26722] mb-3">Datos bancarios del comprador</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <p><span className="text-zinc-400">Titular:</span> {order.pendingRequest.refundBankAccount.holderName || '-'}</p>
              <p><span className="text-zinc-400">Banco:</span> {order.pendingRequest.refundBankAccount.bankName || '-'}</p>
              <p className="font-mono"><span className="text-zinc-400">CBU/CVU:</span> {order.pendingRequest.refundBankAccount.cbuCvu}</p>
              <p><span className="text-zinc-400">Alias:</span> {order.pendingRequest.refundBankAccount.alias || '-'}</p>
              <p><span className="text-zinc-400">CUIT:</span> {order.pendingRequest.refundBankAccount.cuitCuil || '-'}</p>
            </div>
          </div>
        )}
        {vendorEsperaComprador ? (
          <div className="p-3 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold">
            Confirmaste el reembolso. Ahora esperamos que el comprador confirme
            haberlo recibido para liberar tu garantía.
          </div>
        ) : (
          <button
            onClick={handleVendorConfirmRefund}
            disabled={loading}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <LoadingSpinner size="sm" /> : <><Mail size={18} /> Confirmar que reembolsé</>}
          </button>
        )}
      </div>
    );
  }

  // 2) VENDEDOR con solicitud de liberación pendiente al admin
  if (!iAmBuyer && order.releaseRequest?.exists) {
    const pendingRelease = order.releaseRequest.status === 'pending';
    return (
      <div className="bg-amber-500/10 border-2 border-amber-500/60 p-6 rounded-[2.5rem]">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-amber-500 p-2 rounded-xl text-white"><ShieldAlert size={20} /></div>
          <h3 className="font-black uppercase italic dark:text-white">Solicitud de liberación enviada</h3>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {pendingRelease
            ? 'Tu solicitud fue enviada al admin. La garantía se liberará manualmente tras verificar con el comprador.'
            : order.releaseRequest.status === 'approved_released'
              ? 'El admin liberó tu garantía.'
              : 'El admin rechazó la solicitud de liberación.'}
        </p>
      </div>
    );
  }

  // 3) Estados terminales o no cancelables: no mostramos acciones extra
  if (['shipped', 'completed', 'cancelled', 'expired'].includes(status)) return null;

  // 4) Estado normal (comprador o vendedor en pending/verifying)
  // PUNTO 4: Para el comprador, el botón de cancelar queda discreto dentro de un
  // menú de "3 puntitos" en lugar de un botón grande en pantalla.
  // ⚠️ [POLÍTICA ACTUAL] El comprador SOLO puede cancelar mientras la orden NO
  // está marcada como pagada o con pago notificado: únicamente en
  // 'pending_payment'. Acá ya pasamos el bloque `pending` (no hay reembolso en
  // curso), así que si el estado no es 'pending_payment' no mostramos nada.
  if (iAmBuyer) {
    // Guard defensivo: no renderizar cancelación del comprador una vez que
    // notificó el pago (verifying_payment o posterior). Imposible desde
    // OrderDetail (el menú ahí solo se muestra en pending_payment), pero lo
    // dejamos por robustez frente a estados heredados.
    if (status !== 'pending_payment') {
      return null;
    }
    return (
      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={loading}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400"
            aria-label="Más opciones"
          >
            <MoreVertical size={20} />
          </button>

          {menuOpen && (
            <>
              {/* Fondo invisible para cerrar al hacer clic afuera */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 mt-1 z-20 w-52 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    await handleBuyerInitiate();
                  }}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  Cancelar compra
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Vendedor con la orden YA PAGADA (transferencia bancaria): mostramos los
  // "3 puntitos" discretos (como el comprador) para que pueda cancelar la venta
  // y reembolsar. Las órdenes cripto se cancelan devolviendo el escrow, por lo
  // que acá solo consideramos el flujo bancario.
  if (!iAmBuyer && status === 'paid' && order.payment?.method !== 'crypto') {
    return (
      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={loading}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400"
            aria-label="Más opciones"
          >
            <MoreVertical size={20} />
          </button>

          {menuOpen && (
            <>
              {/* Fondo invisible para cerrar al hacer clic afuera */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 mt-1 z-20 w-64 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    await handleVendorInitiateCancel();
                  }}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  Cancelar venta y reembolsar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Vendedor: mantenemos la tarjeta de gestión de la garantía (más relevante).
  return (
    <div className="bg-red-500/5 border-2 border-red-500/50 p-6 rounded-[2.5rem]">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-[#F26722] p-2 rounded-xl text-white shadow-lg shadow-[#F26722]/20">
          <ShieldAlert size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight italic dark:text-white">
          Cancelar Orden
        </h3>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium">
        Si no podés concretar esta orden, podés solicitar la cancelación y la
        liberación de los fondos en garantía. Este proceso se realiza de forma
        manual por los administradores.
      </p>

      <button
        onClick={handleVendorRequestAdminRelease}
        disabled={loading}
        className="w-full py-4 bg-[#F26722] hover:bg-[#d95514] text-white rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <><ShieldAlert size={18} /> Solicitar Cancelación</>
        )}
      </button>
    </div>
  );
};

export default CancelOrderAction;
