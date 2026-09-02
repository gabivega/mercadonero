import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import {
    Clock,
  CheckCircle,
  Package,
  Truck,
  FileText,
  Copy,
  AlertCircle,
  UploadCloud,
  MessageSquare,
  Sparkles,
    Star,
  Hourglass,
  ShieldCheck,
} from "lucide-react";
import Swal from "sweetalert2";
import { useUserStore } from "../../store/useUserStore";
import { useChat } from "../../Utils/useChat";
import ShippingForm from "../../components/ShippingForm";
import PaymentAction from "../../components/PaymentAction";
import ConfirmPaymentAction from "../../components/ConfirmPaymentAction";
import ShippingStatusCard from "../../components/ShippingStatusCard";
import OrderInfoAccordion from "../../components/OrderInfoAccordion";
import CancelOrderAction from "../../components/CancelOrderAction";
import LoadingSpinner from "../../components/LoadingSpinner";
import OrderRatings from "../../components/OrderRatings";
import CollateralHoldCard from "../../components/CollateralHoldCard";
import CashbackBadge from "../../components/CashbackBadge";

export default function OrderDetail() {
    const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const { getAccessToken } = usePrivy();
  const user = useUserStore((state) => state.dbUser);
    let role = "buyer"; // Default role
  const navigate = useNavigate();
  const { startConversation } = useChat();
  const [startingChat, setStartingChat] = useState(false);

    const isDark = document.documentElement.classList.contains("dark");

    // Referencia al bloque de calificaciones para hacer scroll cuando el
  // comprador confirma la recepción y queremos incentivarlo a calificar.
  const ratingsRef = useRef(null);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const scrollToRatings = () => {
    // Pequeño delay para dejar que el estado se actualice y Swal se cierre.
    setTimeout(() => {
      ratingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

    const fetchOrder = async () => {
    setFetching(true);
    try {
      const token = await getAccessToken();
      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setOrder(res.data.order);
      // console.log(res.data.order);
        } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  const handleUploadProof = async () => {
    const { value: file } = await Swal.fire({
      title: "Subir Comprobante",
      text: "Selecciona la imagen o PDF de tu transferencia",
      input: "file",
      inputAttributes: {
        accept: "image/*,application/pdf",
        "aria-label": "Subir comprobante",
      },
      showCancelButton: true,
      confirmButtonText: "Enviar",
      confirmButtonColor: "#3483fa",
      background: isDark ? "#121212" : "#ffffff",
      color: isDark ? "#f3f4f6" : "#1f2937",
    });

    if (file) {
      setLoading(true);
      const formData = new FormData();
      formData.append("paymentProof", file);

      try {
        const token = await getAccessToken();
        await axios.patch(
          `${import.meta.env.VITE_SERVER_URL}/api/order/${id}/upload-proof`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data",
            },
          },
        );
        Swal.fire("Éxito", "Comprobante subido correctamente", "success");
        fetchOrder(); // Refrescar datos
      } catch (err) {
        Swal.fire("Error", "No se pudo subir el archivo", "error");
      } finally {
        setLoading(false);
      }
    }
  };
      if (loading)
    return (
      <div className="p-20 text-center">
        <LoadingSpinner size="lg" text="Cargando detalles de la orden..." />
      </div>
    );
  if (!order)
    return <div className="p-20 text-center">Orden no encontrada.</div>;

  // Determinar rol según si el usuario logueado es el vendedor de la orden
  if (user && order.seller && user._id === order.seller._id) {
    role = "seller";
  }

    // ID de la otra parte (vendedor o comprador) según tu rol
  const otherUserId = role === "seller"
    ? (order.buyer?._id || order.buyer)
    : (order.seller?._id || order.seller);

  // Datos de la contraparte para navegar a su perfil público (/user/:id).
  // Puede venir poblado (objeto con _id) o como simple id string.
  const goToProfile = (uid) => {
    if (!uid) return;
    if (typeof uid === "string") navigate(`/user/${uid}`);
    else if (uid._id) navigate(`/user/${uid._id}`);
  };

  const isMeSeller = role === "seller";
  const counterpartyRaw = isMeSeller ? order.buyer : order.seller;
  const counterpartyId = otherUserId; // ya calculado como id de la contraparte
  const counterpartyName = isMeSeller
    ? `${order.buyer?.firstName || ""} ${order.buyer?.lastName || ""}`.trim() ||
      order.buyer?.username ||
      order.buyer ||
      "Usuario"
    : order.seller?.shop?.name || order.seller?.username || "Usuario";
  const counterpartyAvatar = isMeSeller
    ? order.buyer?.avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(counterpartyName)}&background=random`
    : order.seller?.shop?.logo ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(counterpartyName)}&background=random`;
  const counterpartyShop = isMeSeller
    ? null
    : order.seller?.shop?.name || null;


  const handleStartChat = async () => {
    if (!otherUserId || startingChat) return;
    setStartingChat(true);
    try {
      const conversation = await startConversation(otherUserId);
      if (conversation?._id) {
        navigate(`/mensajes?c=${conversation._id}`);
      } else {
        navigate("/mensajes");
      }
    } catch (err) {
      Swal.fire({
        icon: "info",
        title: "Chat no disponible",
        text:
          err?.message ||
          "Solo podés chatear mientras la compra/venta esté activa.",
        background: isDark ? "#121212" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
        confirmButtonColor: "#3483fa",
      });
    } finally {
      setStartingChat(false);
    }
  };

  const steps = [
    {
      id: "pending_payment",
      label: "Pago Pendiente",
      icon: <Clock size={20} />,
    },
    {
      id: "verifying_payment",
      label: "Verificando",
      icon: <AlertCircle size={20} />,
    },
    { id: "paid", label: "Pagado", icon: <CheckCircle size={20} /> },
    { id: "shipped", label: "En camino", icon: <Truck size={20} /> },
    { id: "completed", label: "Completado", icon: <Package size={20} /> },
  ];

                const currentStepIndex = steps.findIndex((s) => s.id === order.status);

    // Total de productos en ARS de esta orden (para estimar el cashback).
    const orderProductsTotal = (order.itemsSnapshot || []).reduce(
      (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0,
    );

    return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      {/* Indicador global de actualización de la orden */}
      {fetching && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 bg-black/80 dark:bg-white/90 text-white dark:text-black px-4 py-2 rounded-full shadow-lg text-xs font-semibold">
          <div className="w-3.5 h-3.5 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin" />
          Actualizando orden...
        </div>
      )}

      {role === "seller" && (
        <h4
          onClick={() => navigate("/mis-ordenes")}
          className="cursor-pointer text-blue-500"
        >
          Volver a mis ordenes
        </h4>
      )}
      {/* 1. Línea de Tiempo / Status */}
      <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
                <div className="flex flex-wrap justify-between gap-4">
       {order.status === "awaiting_collateral" ? (
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[100px]">
            <div className="p-3 rounded-full bg-amber-500 text-white animate-pulse">
              <Hourglass size={20} />
            </div>
            <p className="text-[10px] font-bold uppercase text-center text-amber-600 dark:text-amber-400">
              Esperando garantía del vendedor
            </p>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 text-center max-w-xs">
              El vendedor debe depositar su fondo de garantía para confirmar el envío de tu orden.
            </p>
          </div>
        ) : order.status !== "expired" ? steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex flex-col items-center gap-2 flex-1 min-w-[100px] ${index <= currentStepIndex ? "opacity-100" : "opacity-30"}`}
            >
              <div
                className={`p-3 rounded-full transition-all duration-500 ${
                  index <= currentStepIndex
                    ? "bg-[#3483fa] text-white" // Completado
                    : index === currentStepIndex + 1
                      ? "bg-[#3483fa]/20 text-[#3483fa] border-2 border-dashed border-[#3483fa] animate-pulse" // En proceso (Siguiente)
                      : "bg-gray-100 dark:bg-zinc-800 text-gray-400 opacity-50" // Pendiente
                }`}
              >
                {step.icon}
              </div>
              <p className="text-[10px] font-bold uppercase text-center">
                {step.label}
              </p>
            </div>
          )) : 
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[100px]">
            <div className="p-3 rounded-full bg-red-500 text-white">
              <AlertCircle size={20} />
            </div>
            <p className="text-[10px] font-bold uppercase text-center text-red-500">
              Orden Expirada por falta de pago en el plazo establecido de 60 minutos.
            </p>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 text-center">
              {order.expiresAt ? new Date(order.expiresAt).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : 'Fecha no disponible'}
                        </p>
          </div>}
        </div>
      </div>

            {/* Estado de espera de colateral (vendedor sin garantía suficiente) */}
      {order.status === "awaiting_collateral" && (
        <CollateralHoldCard order={order} role={role} onUpdate={fetchOrder} />
      )}

                        {/* Botón para comunicarse con la otra parte + acceso a su perfil */}
      <section className="bg-white dark:bg-[#121212] p-4 md:p-5 rounded-2xl border dark:border-zinc-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar + nombre de la contraparte → lleva a su perfil público */}
          <button
            onClick={() => goToProfile(counterpartyRaw)}
            disabled={!counterpartyId}
            className="shrink-0 group flex items-center gap-3 rounded-xl disabled:cursor-not-allowed"
            title="Ver el perfil de esta persona"
          >
            <img
              src={counterpartyAvatar}
              alt={counterpartyName}
              className="w-11 h-11 rounded-full object-cover border-2 border-zinc-200 dark:border-zinc-700 group-hover:ring-2 group-hover:ring-[#3483fa]/50 transition-all"
            />
            <div className="text-left min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">
                {role === "seller" ? "Comprador de esta venta" : "Vendedor de tu compra"}
              </p>
              <p className="font-bold text-sm dark:text-white truncate group-hover:text-[#3483fa] group-hover:underline capitalize transition-colors">
                {counterpartyName}
              </p>
              {counterpartyShop && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  Tienda {counterpartyShop}
                </p>
              )}
            </div>
          </button>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
          <h3 className="font-bold text-base dark:text-white">
            ¿Necesitás hablar con {role === "seller" ? "el comprador" : "el vendedor"}?
          </h3>
          <button
            onClick={handleStartChat}
            disabled={startingChat}
            className="flex items-center gap-2 bg-[#3483fa] hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
          >
            <MessageSquare size={18} />
            {startingChat
              ? "Abriendo chat..."
              : role === "seller"
                ? "Enviar mensaje al comprador"
                : "Enviar mensaje al vendedor"}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        {/* Columna Izquierda: Productos y Datos */}
        <div className="lg:col-span-1 space-y-6">
                    <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
            
            {/* Encabezado: título a la izquierda y, para el comprador, los
                "3 puntitos" (menú de cancelar) a la derecha, ya que en esa
                posición quedan integrados y no sueltos entre tarjetas. */}
                        <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Productos en esta orden</h3>
              {((role === "buyer" &&
                !order.pendingRequest?.exists &&
                (order.status === "pending_payment" ||
                  order.status === "verifying_payment")) ||
                (role === "seller" &&
                  order.status === "paid" &&
                  order.payment?.method !== "crypto" &&
                  !order.pendingRequest?.exists)) && (
                  <CancelOrderAction
                    order={order}
                    role={role}
                    onUpdate={() => fetchOrder()}
                  />
                )}
            </div>
                        {order.itemsSnapshot.map((item, idx) => (
              <div
                key={idx}
                className="flex gap-4 border-b dark:border-zinc-800 py-4 last:border-0"
              >
                <img
                  src={item.images[0]}
                  alt={item.title}
                  className="w-20 h-20 rounded-lg object-cover"
                />
                <div>
                  <h4 className="font-semibold">{item.title}</h4>
                  <p className="text-sm text-gray-500">
                    Cantidad: {item.quantity}
                  </p>
                  <p className="font-bold text-[#3483fa]">
                    ${item.price.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}

            {/* Cashback estimado (solo comprador, mientras la orden está activa) */}
            {role === "buyer" &&
              ["pending_payment", "verifying_payment", "paid", "shipped"].includes(
                order.status,
              ) && (
                <div className="pt-3">
                  <CashbackBadge priceArs={orderProductsTotal} />
                </div>
              )}
          </section>

                    {role === "buyer" && order.status === "pending_payment" && (
            <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
              {order.payment?.method === "crypto" ? (
                <EscrowPaymentStatus order={order} onUpdate={fetchOrder} />
              ) : (
                <PaymentAction
                  orderId={order._id}
                  onUpdate={() => {
                    // Refrescar la orden
                    fetchOrder();
                  }}
                  sellerId={order.seller._id}
                />
              )}
            </section>
          )}
                                                                                {role === "seller" && (order.status === "verifying_payment" || order.status === "pending_payment") && (
            <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
              <ConfirmPaymentAction
                order={order}
                orderId={order._id}
                onUpdate={() => {
                  // Refrescar la orden
                  fetchOrder();
                }}
              />
            </section>
          )}
                                        {/* Gestión de cancelación / garantía.
              - Comprador: el menú de "3 puntitos" (cancelar compra) ya está
                integrado en el encabezado de "Productos en esta orden". Acá solo
                mostramos la tarjeta cuando hay un reembolso en curso (pendiente de
                confirmación del reintegro).
              - Vendedor: siempre la tarjeta para solicitar la cancelación. */}
          {((order.status === "pending_payment" ||
            order.status === "verifying_payment" ||
            order.pendingRequest?.exists) &&
            (role === "seller" || order.pendingRequest?.exists)) && (
            <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
              <CancelOrderAction
                order={order}
                role={role}
                onUpdate={() => fetchOrder()}
              />
            </section>
          )}
                    {(role === "buyer" &&
            (order.status === "paid" || order.status === "shipped")) && (
            <ShippingStatusCard
              order={order}
              role={role}
              onUpdate={() => {
                fetchOrder();
                setJustConfirmed(true);
                scrollToRatings();
              }}
            />
          )}

                    {role === "seller" && order.status === "paid" && !order.pendingRequest?.exists && (
            <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
              <ShippingForm
                orderId={order._id}
                onUpdate={() => {
                  // Refrescar la orden
                  fetchOrder();
                }}
              />
            </section>
          )}
                    <OrderInfoAccordion 
            order={order} 
            role={role === 'seller' ? 'seller' : 'buyer'}/>

          {/* CASHBACK: el comprador aquí ve cuánto reintegro le generó esta compra al completarse */}
          {role === "buyer" && order.status === "completed" && (
            <section className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/40">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
                  <Sparkles className="text-emerald-600" size={24} />
                </div>
                <div className="flex-1">
                  <h4 className="font-black uppercase italic dark:text-white text-sm flex items-center gap-2">
                    ¡Recibiste Cashback!
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
                    Por completar esta compra, te acreditamos{" "}
                    <b className="text-emerald-600 dark:text-emerald-400">
                    US$ {(order.cashback?.earnedUsd || 0).toFixed(2)}
                    </b>{" "}
                    de reintegro. El importe ya está disponible en tu billetera
                    de la plataforma y podés consultarlo en{" "}
                                        <button
                    onClick={() => navigate("/billetera")}
                    className="text-[#3483fa] hover:underline font-semibold"
                    >
                    Mi Billetera
                    </button>
                    .
                  </p>
                  {order.cashback?.feePercentUsed ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    Reintegro calculado sobre la comisión de la plataforma
                    ({(order.cashback.feePercentUsed * 100).toFixed(0)}% de
                    la comisión aplicada).
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          )}

                    {/* Sistema de calificaciones (ratings) */}
            <div ref={ratingsRef} className="scroll-mt-6">
            {justConfirmed && (
              <div className="mb-4 p-5 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/10 flex items-start gap-4">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl shrink-0">
                  <Sparkles className="text-emerald-500" size={22} />
                </div>
                <div className="flex-1">
                  <h4 className="font-black uppercase italic dark:text-white text-sm">
                    ¡Gracias por confirmar tu compra!
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
                    Tu pedido quedó <b className="text-emerald-600 dark:text-emerald-400">finalizado</b>.
                    Ahora podés calificar el producto y al vendedor para ayudar a
                    la comunidad a comprar con confianza.
                  </p>
                  <button
                    onClick={() => {
                      setJustConfirmed(false);
                      window.scrollBy({ top: 120, behavior: "smooth" });
                    }}
                    className="mt-3 text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold uppercase tracking-wide transition-colors"
                  >
                    <Star size={14} /> Empezar a calificar
                  </button>
                </div>
              </div>
            )}
            <OrderRatings order={order} role={role} />
          </div>



          {/* {order.shippingDetails?.trackingNumber && (
            <section className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-200 dark:border-blue-800">
              <h3 className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                <Truck size={20} /> Seguimiento de envío
              </h3>
              <p className="mt-2 text-sm">
                El número de seguimiento es:{" "}
                <b>{order.shippingDetails.trackingNumber}</b>
              </p>
              <button className="mt-3 text-xs bg-blue-600 text-white px-4 py-2 rounded-lg">
                Rastrear paquete
              </button>
            </section>
          )} */}
        </div>

        {/* Columna Derecha: Resumen y Pago */}
        {/* <div className="space-y-6">
          <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
            <h3 className="font-bold mb-4">Resumen de pago</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>${order.productsAmount?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Envío</span>
                <span>${order.shippingAmount?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t dark:border-zinc-800 pt-2">
                <span>Total</span>
                <span>${order.totalAmount?.toLocaleString()}</span>
              </div>
            </div>

            {order.status === "pending_payment" && (
              <button
                onClick={handleUploadProof}
                className="w-full mt-6 bg-[#3483fa] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-all"
              >
                <UploadCloud size={18} /> Subir Comprobante
              </button>
            )}

            {order.paymentProof && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900 rounded-lg text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
                <FileText size={16} /> Comprobante enviado correctamente.
              </div>
            )}
          </section>


          <section className="bg-gray-50 dark:bg-zinc-900/50 p-6 rounded-2xl border dark:border-zinc-800">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">
              Dirección de Entrega
            </h4>
            <p className="text-sm">
              {order.shippingAddress.street} {order.shippingAddress.streetNumber}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.province}
            </p>
          </section>
                </div> */}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// TARJETA DE ESTADO DE PAGO CON CRIPTO (Escrow).
// Se muestra al comprador cuando la orden se pagó con criptomonedas.
// Reemplaza al PaymentAction (datos bancarios del vendedor), que NO
// aplica para pagos en cripto.
// ──────────────────────────────────────────────────────────────
function EscrowPaymentStatus({ order, onUpdate }) {
  const { getAccessToken } = usePrivy();
  const [checking, setChecking] = useState(false);
  const isDark = document.documentElement.classList.contains("dark");

    const payment = order.payment || {};
  // El escrow está fondeado cuando el sub-estado de pago lo indica (on-chain
  // confirmado por el backend) o el status de la orden ya está pagado.
  const isFunded =
    payment.status === "funded" ||
    ["paid", "shipped", "completed"].includes(order.status);
  // Monto retenido en USDT: usamos lo que configuró el backend en el escrow.
  const totalUsdt =
    payment.amountUsdRetained ||
    (order.financials?.totalUsd || 0) + (order.financials?.shippingCostUsd || 0);

    // Lee on-chain el estado del escrow (GET /escrow-status) y refresca la orden
  // para traer el estado más reciente del fondeo.
  const checkFunding = async () => {
    setChecking(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/order/${order._id}/escrow-status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success) {
        // Refrescamos la orden para reflejar el estado on-chain del escrow.
        onUpdate();
      }
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err?.response?.data?.message || "No se pudo verificar el escrow.",
        confirmButtonColor: "#F26722",
        background: isDark ? "#121212" : "#ffffff",
        color: isDark ? "#f3f4f6" : "#1f2937",
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-[#F26722]/5 border-2 border-[#F26722] p-6 rounded-[2.5rem] shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-[#F26722] p-2 rounded-xl text-white shadow-lg shadow-[#F26722]/20">
          <ShieldCheck size={20} />
        </div>
        <h3 className="font-black uppercase tracking-tight dark:text-white italic">
          Pago con Criptomonedas
        </h3>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium leading-relaxed">
        Esta compra se abona con USDT. Tus fondos quedaron retenidos en el
        contrato escrow de Mercado Nero y se liberarán al vendedor recién cuando
        confirmes la recepción del pedido.
      </p>

      <div className="bg-white dark:bg-[#252525] rounded-2xl p-5 border border-gray-100 dark:border-gray-800 mb-6">
        <h4 className="text-xs font-black uppercase text-center tracking-widest text-[#F26722] mb-4">
          Detalle del Escrow
        </h4>
        <div className="space-y-3 md:px-[25%]">
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Token</span>
            <span className="text-sm font-medium dark:text-white">{payment.token || "USDT"}</span>
          </div>
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Monto retenido</span>
            <span className="text-sm font-mono font-bold text-[#F26722]">
              {totalUsdt > 0 ? totalUsdt.toFixed(2) : "—"} USDT
            </span>
          </div>
                    <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</span>
                        <button
              onClick={() => {
                const addr = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS || "";
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(addr);
                }
                Swal.fire({
                  icon: "success",
                  title: "Dirección copiada",
                  text: "Contrato escrow copiado al portapapeles.",
                  confirmButtonColor: "#F26722",
                  toast: true,
                  position: "top-end",
                  timer: 2200,
                  showConfirmButton: false,
                });
              }}
              className="text-sm font-mono text-[#3483fa] hover:underline truncate max-w-[160px]"
            >
              {import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS
                ? import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS.slice(0, 8) + "..." + import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS.slice(-4)
                : "—"}
            </button>
          </div>
          <div className="flex justify-between items-center flex-col sm:flex-row">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Estado del depósito</span>
            <span
              className={`text-sm font-bold ${
                isFunded
                  ? "text-emerald-500"
                  : "text-amber-500"
              }`}
            >
              {isFunded ? "✓ Fondeado" : "En espera de fondeo"}
            </span>
          </div>
        </div>
      </div>

      {!isFunded && (
        <button
          onClick={checkFunding}
          disabled={checking}
          className="w-full group relative overflow-hidden py-4 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
        >
          <div className="flex items-center justify-center gap-2 relative z-10">
            {checking ? (
              <>
                <LoadingSpinner size="sm" />
                Verificando...
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                Verificar fondeo del escrow
              </>
            )}
          </div>
        </button>
      )}

      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
        <ShieldCheck size={12} />
        Tu pago está protegido en el contrato escrow
      </div>
    </div>
  );
}
