import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Package,
  Eye,
  ShoppingCart,
  DollarSign,
  Edit3,
  Pause,
  Play,
  Trash2,
  Plus,
  ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

export default function SellerDashboard() {
  const { getAccessToken } = usePrivy();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMyProducts();
  }, []);

  const fetchMyProducts = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/product/my-products`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json();
      console.log(data.products)
      if (data.success) setProducts(data.products);
    } catch (error) {
      console.error("Error cargando productos", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const token = await getAccessToken();
  const newStatus = currentStatus === "active" ? "paused" : "active";

  try {
    // 1. Petición al Backend (PATCH porque solo modificamos un campo)
    const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/product/toggle-status/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", 
        Authorization: `Bearer ${token}`
       },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!response.ok) throw new Error("Error al actualizar el estado");

    // 2. Si el back responde OK, actualizamos el State local
    setProducts(products.map((p) => (p._id === id ? { ...p, status: newStatus } : p)));

    // 3. Notificación Toast
    Swal.fire({
      toast: true,
      position: "top-end",
      title: `Producto ${newStatus === "active" ? "activado" : "pausado"}`,
      icon: "success",
      showConfirmButton: false,
      timer: 2000,
      background: "#1A1A1A",
      color: "#fff",
    });
  } catch (error) {
    Swal.fire({
      title: "Error",
      text: "No se pudo cambiar el estado. Intenta de nuevo.",
      icon: "error",
      background: "#1A1A1A",
      color: "#fff",
    });
  }
};

const confirmDelete = async (id) => {
Swal.fire({
  title: "¿Estás seguro?",
  text: "Esta acción marcará el producto como eliminado y no será visible.",
  icon: "warning",
  showCancelButton: true,
  confirmButtonColor: "#3b82f6", // El azul de Nero
  cancelButtonColor: "#ef4444",  // Rojo para cancelar
  confirmButtonText: "Sí, eliminar",
  cancelButtonText: "Cancelar",
  background: "#1A1A1A",
  color: "#fff",
}).then(async (result) => {
  if (result.isConfirmed) {
    try {
      const token = await getAccessToken();
      // 1. Llamada al Backend
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/product/delete/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", 
          Authorization: `Bearer ${token}`
         },
      });

      if (!response.ok) throw new Error("Error al eliminar");

      // 2. Filtramos el producto del estado local para que desaparezca de la tabla
      setProducts(products.filter((p) => p._id !== id));

      // 3. Feedback de éxito
      Swal.fire({
        title: "¡Eliminado!",
        text: "El producto ha sido quitado de tu lista.",
        icon: "success",
        background: "#1A1A1A",
        color: "#fff",
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: "No se pudo eliminar el producto.",
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
      });
    }
  }
});
};
// Stats calculados (Vistas e Inventario reales, Ventas mockeadas por ahora)
  const stats = [
    {
      label: "Productos",
      value: products.length,
      icon: <Package size={20} />,
      color: "text-blue-500",
    },
    {
      label: "Vistas Totales",
      value: products.reduce((acc, p) => acc + (p.views || 0), 0),
      icon: <Eye size={20} />,
      color: "text-purple-500",
    },
    {
      label: "Ventas (Mock)",
      value: "14",
      icon: <ShoppingCart size={20} />,
      color: "text-green-500",
    },
    {
      label: "Ingresos (Mock)",
      value: "$540.000",
      icon: <DollarSign size={20} />,
      color: "text-amber-500",
    },
  ];


  if (isLoading)
    return (
      <div className="p-10 text-center text-gray-500 animate-pulse font-black uppercase tracking-widest">
        Cargando Panel...
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black dark:text-white tracking-tighter">
            MI PANEL
          </h1>
          <p className="text-gray-500">
            Gestiona tus publicaciones y ventas en tiempo real.
          </p>
        </div>
        <button
          onClick={() => navigate("/vender")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-black flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20 uppercase text-xs tracking-widest"
        >
          <Plus size={18} /> Vender
        </button>
      </div>

      {/* Grid de Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div
            key={i}
            className="bg-white dark:bg-[#1A1A1A] p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm"
          >
            <div className={`mb-3 ${s.color}`}>{s.icon}</div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {s.label}
            </p>
            <p className="text-2xl font-black dark:text-white mt-1">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-[32px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-[#222] border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Producto
                </th>
                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Precio
                </th>
                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                  Estado
                </th>
                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="p-20 text-center text-gray-400 font-bold"
                  >
                    No tienes productos publicados todavía.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p._id}
                    className="group hover:bg-gray-50/50 dark:hover:bg-blue-500/5 transition-colors"
                  >
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 dark:bg-[#252525] border border-gray-100 dark:border-gray-800 flex-shrink-0">
                          <img
                            src={
                              p.images.find((i) => i.isMain)?.url ||
                              p.images[0]?.url
                            }
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        </div>
                        <div>
                          <p className="font-black text-sm dark:text-white line-clamp-1">
                            {p.name}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-1">
                            {p.category} • {p.stock} disponibles
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col">
                        {/* Si hay oferta activa, mostramos el precio de lista tachado arriba */}
                        {p.sale?.active && p.sale?.price > 0 ? (
                          <>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 line-through decoration-red-500/50 text-clamp-1">
                              {p.currency === "ARS" ? "$ " : "USD " }{p.price}
                            </span>
                           <p className="font-black text-green-600 dark:text-green-400 text-lg leading-tight truncate whitespace-nowrap">
  {p.currency === "ARS" ? "$ " : "USD "}{p.sale.price.toLocaleString("es-AR")}
</p>
                          </>
                        ) : (
                          /* Si no hay oferta, solo el precio normal */
                          <p className="font-black dark:text-white text-lg text-clamp-1">
                            ${p.price.toLocaleString("es-AR")}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <span
                        className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          p.status === "active"
                            ? "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                            : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                        }`}
                      >
                        {p.status === "active" ? "Activo" : "Pausado"}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => toggleStatus(p._id, p.status)}
                          className={`p-3 rounded-xl transition-all ${p.status === "active" ? "hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500" : "hover:bg-green-50 dark:hover:bg-green-500/10 text-green-500"}`}
                          title={p.status === "active" ? "Pausar" : "Activar"}
                        >
                          {p.status === "active" ? (
                            <Pause size={18} />
                          ) : (
                            <Play size={18} />
                          )}
                        </button>
                        <button
                          className="p-3 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-500 rounded-xl transition-all"
                          title="Editar"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button
                        onClick={() => confirmDelete(p._id)}
                          className="p-3 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-xl transition-all"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
