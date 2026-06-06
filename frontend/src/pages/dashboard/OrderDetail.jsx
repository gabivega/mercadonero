import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import Swal from "sweetalert2";
import { useUserStore } from "../../store/useUserStore";
import ShippingForm from "../../components/ShippingForm";
import PaymentAction from "../../components/PaymentAction";
import ConfirmPaymentAction from "../../components/ConfirmPaymentAction";
import ShippingStatusCard from "../../components/ShippingStatusCard";
import OrderInfoAccordion from "../../components/OrderInfoAccordion";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getAccessToken } = usePrivy();
  const user = useUserStore((state) => state.dbUser);
  let role = "buyer"; // Default role
  const navigate = useNavigate();

  const isDark = document.documentElement.classList.contains("dark");

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
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
  if (order && user._id === order.seller._id) {
    role = "seller";
  }
  if (loading)
    return (
      <div className="p-20 text-center">
        <LoadingSpinner size="lg" text="Cargando detalles de la orden..." />
      </div>
    );
  if (!order)
    return <div className="p-20 text-center">Orden no encontrada.</div>;

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

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
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
       {order.status !== "expired" ? steps.map((step, index) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        {/* Columna Izquierda: Productos y Datos */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
            <h3 className="font-bold text-lg mb-4">Productos en esta orden</h3>
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
          </section>

          {role === "buyer" && order.status === "pending_payment" && (
            <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
              <PaymentAction
                orderId={order._id}
                onUpdate={() => {
                  // Refrescar la orden
                  fetchOrder();
                }}
                sellerId={order.seller._id}
              />
            </section>
          )}
          {role === "seller" && order.status === "verifying_payment" && (
            <section className="bg-white dark:bg-[#121212] p-6 rounded-2xl border dark:border-zinc-800">
              <ConfirmPaymentAction
                orderId={order._id}
                onUpdate={() => {
                  // Refrescar la orden
                  fetchOrder();
                }}
              />
            </section>
          )}
          {role === "buyer" && order.status === "paid" || order.status === "shipped" && (
            <ShippingStatusCard
              order={order}
              role={role}
            />
          )}

          {role === "seller" && order.status === "paid" && (
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
