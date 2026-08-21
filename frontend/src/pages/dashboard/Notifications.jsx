import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ShoppingBag,
  CreditCard,
  Truck,
  CheckCircle2,
  XCircle,
  CheckCheck,
  ChevronRight,
    Star,
  RotateCcw,
  ShieldCheck,
  Coins,
} from "lucide-react";
import { useNotificationStore } from "../../store/useNotificationStore";
import { useNotifications } from "../../Utils/useNotifications";
import LoadingSpinner from "../../components/LoadingSpinner";

const typeMeta = {
  order_created: { icon: ShoppingBag, color: "text-blue-500 bg-blue-50 dark:bg-blue-900/20" },
  payment_confirmed: { icon: CreditCard, color: "text-purple-500 bg-purple-50 dark:bg-purple-900/20" },
  order_shipped: { icon: Truck, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" },
  order_completed: { icon: CheckCircle2, color: "text-green-500 bg-green-50 dark:bg-green-900/20" },
    order_cancelled: { icon: XCircle, color: "text-red-500 bg-red-50 dark:bg-red-900/20" },
  // Recordatorios de calificar / reviews recibidas
  rating_reminder: { icon: Star, color: "text-amber-500 bg-amber-50 dark:bg-amber-900/20" },
  review_received: { icon: Star, color: "text-amber-500 bg-amber-50 dark:bg-amber-900/20" },
  // Flujo de reembolsos / cancelaciones con pago
  order_refund_requested: { icon: RotateCcw, color: "text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20" },
  order_refund_paid_by_vendor: { icon: RotateCcw, color: "text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20" },
  order_refund_received: { icon: RotateCcw, color: "text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20" },
  // Garantías / liberaciones / admin
  order_release_requested_to_admin: { icon: ShieldCheck, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
  order_admin_release_request: { icon: ShieldCheck, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
  order_guarantee_released: { icon: Coins, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
  general: { icon: Bell, color: "text-[#F26722] bg-orange-50 dark:bg-orange-900/20" },
};

const getTypeMeta = (type) => typeMeta[type] || typeMeta.general;

const formatDate = (date) => {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

export default function Notifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const loading = useNotificationStore((s) => s.loading);
  const { fetchNotifications, markAsRead, markAllAsRead, isMarkingAll } =
    useNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleClick = async (notification) => {
    if (!notification.read) {
      await markAsRead(notification._id);
    }
    // Si la notificación está vinculada a una orden, navegamos a su detalle.
    if (notification.data?.orderId) {
      navigate(`/order/${notification.data.orderId}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">
            Notificaciones
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : "Estás al día 🎉"}
          </p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={isMarkingAll || unreadCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-[#F26722] hover:text-[#F26722] transition-colors disabled:opacity-50"
          >
            <CheckCheck size={16} />
            Marcar todas
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="p-8 text-center">
          <LoadingSpinner size="lg" text="Cargando notificaciones..." />
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2rem] text-center">
          <Bell className="mx-auto text-zinc-300 mb-4" size={48} />
          <p className="text-zinc-500 font-medium">No tienes notificaciones.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {notifications.map((notification) => {
            const meta = getTypeMeta(notification.type);
            const Icon = meta.icon;
            return (
              <button
                key={notification._id}
                onClick={() => handleClick(notification)}
                className={`group relative w-full text-left bg-white dark:bg-zinc-900 border p-5 rounded-[1.75rem] hover:border-[#F26722] transition-all shadow-sm hover:shadow-md ${
                  notification.read
                    ? "border-zinc-200 dark:border-zinc-800 opacity-70"
                    : "border-[#F26722]/40 dark:border-[#F26722]/40"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl shrink-0 ${meta.color}`}>
                    <Icon size={22} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold text-zinc-900 dark:text-white leading-tight">
                        {notification.title}
                      </h3>
                      <span className="text-[11px] text-zinc-400 shrink-0 font-medium">
                        {formatDate(notification.createdAt)}
                      </span>
                    </div>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      {notification.message}
                    </p>
                    {notification.data?.orderId && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F26722] mt-2">
                        Ver orden
                        <ChevronRight size={14} />
                      </span>
                    )}
                  </div>

                  {notification.data?.orderId && (
                    <ChevronRight className="shrink-0 text-zinc-300 group-hover:text-[#F26722] group-hover:translate-x-0.5 transition-all mt-1" size={18} />
                  )}
                </div>

                {!notification.read && (
                  <span className="absolute top-5 right-5 h-2.5 w-2.5 rounded-full bg-[#F26722]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}