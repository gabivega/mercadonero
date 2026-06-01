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
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import axios from "axios";
import LoadingSpinner from "../../components/LoadingSpinner";
import ProductEditModal from "../../components/ProductEditModal";

export default function SellerDashboard() {
  const { getAccessToken } = usePrivy(); //
  const [products, setProducts] = useState([]); //
  const [orders, setOrders] = useState([]); //[cite: 1]
  const [isLoading, setIsLoading] = useState(true); //[cite: 1]
  const [selectedProduct, setSelectedProduct] = useState(null); //[cite: 1]
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); //[cite: 1]
  const navigate = useNavigate(); //[cite: 1]

  // 🔍 ESTADOS NUEVOS PARA FILTRADO Y PAGINACIÓN
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25); // Paginación por defecto de 25

  useEffect(() => {
    fetchMyProducts(); //[cite: 1]
    fetchMyOrders(); //[cite: 1]
  }, []);

  // Resetear a la página 1 si el usuario escribe un filtro de búsqueda
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleEditClick = (product) => {
    setSelectedProduct(product); //[cite: 1]
    setIsEditModalOpen(true); //[cite: 1]
  };

  const fetchMyOrders = async () => {
    try {
      const token = await getAccessToken(); //[cite: 1]
      const { data } = await axios.get( //[cite: 1]
        `${import.meta.env.VITE_SERVER_URL}/api/order/my-orders?role=seller`, //[cite: 1]
        {
          headers: {
            Authorization: `Bearer ${token}`, //[cite: 1]
          },
        },
      );
      setOrders(data.orders || []); //[cite: 1]
    } catch (error) {
      console.error("Error al traer órdenes:", error); //[cite: 1]
    }
  };

  const fetchMyProducts = async () => {
    try {
      const token = await getAccessToken(); //[cite: 1]
      const response = await fetch( //[cite: 1]
        `${import.meta.env.VITE_SERVER_URL}/api/product/my-products`, //[cite: 1]
        {
          headers: { Authorization: `Bearer ${token}` }, //[cite: 1]
        },
      );
      const data = await response.json(); //[cite: 1]
      if (data.success) setProducts(data.products); //[cite: 1]
    } catch (error) {
      console.error("Error cargando productos", error); //[cite: 1]
    } finally {
      setIsLoading(false); //[cite: 1]
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const token = await getAccessToken(); //[cite: 1]
    const newStatus = currentStatus === "active" ? "paused" : "active"; //[cite: 1]
    setIsLoading(true); //[cite: 1]

    try {
      const response = await fetch( //[cite: 1]
        `${import.meta.env.VITE_SERVER_URL}/api/product/toggle-status/${id}`, //[cite: 1]
        {
          method: "PATCH", //[cite: 1]
          headers: {
            "Content-Type": "application/json", //[cite: 1]
            Authorization: `Bearer ${token}`, //[cite: 1]
          },
          body: JSON.stringify({ status: newStatus }), //[cite: 1]
        },
      );

      if (!response.ok) throw new Error("Error al actualizar el estado"); //[cite: 1]

      setProducts( //[cite: 1]
        products.map((p) => (p._id === id ? { ...p, status: newStatus } : p)), //[cite: 1]
      ); //[cite: 1]

      Swal.fire({
        toast: true, //[cite: 1]
        position: "top-end", //[cite: 1]
        title: `Producto ${newStatus === "active" ? "activado" : "pausado"}`, //[cite: 1]
        icon: "success", //[cite: 1]
        showConfirmButton: false, //[cite: 1]
        timer: 2000, //[cite: 1]
        background: "#1A1A1A", //[cite: 1]
        color: "#fff", //[cite: 1]
      });
    } catch (error) {
      Swal.fire({
        title: "Error", //[cite: 1]
        text: "No se pudo cambio el estado. Intenta de nuevo.", //[cite: 1]
        icon: "error", //[cite: 1]
        background: "#1A1A1A", //[cite: 1]
        color: "#fff", //[cite: 1]
      });
    } finally {
      setIsLoading(false); //[cite: 1]
    }
  };

  const confirmDelete = async (id) => {
    Swal.fire({
      title: "¿Estás seguro?", //[cite: 1]
      text: "Esta acción marcará el producto como eliminado y no será visible.", //[cite: 1]
      icon: "warning", //[cite: 1]
      showCancelButton: true, //[cite: 1]
      confirmButtonColor: "#3b82f6", //[cite: 1]
      cancelButtonColor: "#ef4444", //[cite: 1]
      confirmButtonText: "Sí, eliminar", //[cite: 1]
      cancelButtonText: "Cancelar", //[cite: 1]
      background: "#1A1A1A", //[cite: 1]
      color: "#fff", //[cite: 1]
    }).then(async (result) => {
      if (result.isConfirmed) {
        setIsLoading(true); //[cite: 1]
        try {
          const token = await getAccessToken(); //[cite: 1]
          const response = await fetch( //[cite: 1]
            `${import.meta.env.VITE_SERVER_URL}/api/product/delete/${id}`, //[cite: 1]
            {
              method: "DELETE", //[cite: 1]
              headers: {
                "Content-Type": "application/json", //[cite: 1]
                Authorization: `Bearer ${token}`, //[cite: 1]
              },
            },
          );

          if (!response.ok) throw new Error("Error al eliminar"); //[cite: 1]

          setProducts(products.filter((p) => p._id !== id)); //[cite: 1]

          Swal.fire({
            title: "¡Eliminado!", //[cite: 1]
            text: "El producto ha sido quitado de tu lista.", //[cite: 1]
            icon: "success", //[cite: 1]
            background: "#1A1A1A", //[cite: 1]
            color: "#fff", //[cite: 1]
          });
        } catch (error) {
          Swal.fire({
            title: "Error", //[cite: 1]
            text: "No se pudo eliminar el producto.", //[cite: 1]
            icon: "error", //[cite: 1]
            background: "#1A1A1A", //[cite: 1]
            color: "#fff", //[cite: 1]
          });
        } finally {
          setIsLoading(false); //[cite: 1]
        }
      }
    });
  };

  // 🧮 LOGICA DE FILTRADO Y PAGINACIÓN LOCAL (Variables Derivadas)
  const filteredProducts = products.filter((product) => {
    const nameMatch = product.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const categoryMatch = product.category?.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || categoryMatch;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  
  // Estos son los productos recortados finales que se van a mapear en el render
  const currentProducts = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);

  const stats = [
    {
      label: "Productos",
      value: products.length, //[cite: 1]
      icon: <Package size={20} />, //[cite: 1]
      color: "text-blue-500", //[cite: 1]
    },
    {
      label: "Vistas Totales",
      value: products.reduce((acc, p) => acc + (p.views || 0), 0), //[cite: 1]
      icon: <Eye size={20} />, //[cite: 1]
      color: "text-purple-500", //[cite: 1]
    },
    {
      label: "Mis Órdenes",
      value: orders.length, //[cite: 1]
      icon: <ShoppingCart size={20} />, //[cite: 1]
      color: "text-green-500", //[cite: 1]
      clickable: true, //[cite: 1]
      onClick: () => navigate("/mis-ordenes"), //[cite: 1]
    },
    {
      label: "Ingresos (Mock)",
      value: "$540.000", //[cite: 1]
      icon: <DollarSign size={20} />, //[cite: 1]
      color: "text-amber-500", //[cite: 1]
    },
  ];

  if (isLoading)
    return (
      <div className="p-10 text-center">
        <LoadingSpinner size="lg" text="Cargando Panel..." />
      </div>
    );

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="w-full md:w-auto">
          <h1 className="text-3xl md:text-4xl font-black dark:text-white tracking-tighter">
            MI PANEL
          </h1>
          <p className="text-gray-500 text-sm md:text-base">
            Gestiona tus publicaciones y ventas en tiempo real.
          </p>
        </div>
        <button
          onClick={() => navigate("/vender")} //[cite: 1]
          className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20 uppercase text-xs tracking-widest"
        >
          <Plus size={18} /> Vender
        </button>
      </div>

      {/* Grid de Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s, i) => (
          <div
            key={i}
            onClick={s.clickable ? s.onClick : undefined} //[cite: 1]
            className={`bg-white dark:bg-[#1A1A1A] p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm ${ //[cite: 1]
              s.clickable
                ? "cursor-pointer hover:border-green-500 hover:shadow-md transition-all" //[cite: 1]
                : ""
            }`}
          >
            <div className="flex justify-between items-start">
              <div className={`mb-2 md:mb-3 ${s.color}`}>{s.icon}</div> {/*[cite: 1] */}
              {s.clickable && ( //[cite: 1]
                <ExternalLink size={16} className="text-gray-400" /> //[cite: 1]
              )}
            </div>
            <p className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {s.label}
            </p>
            <p className="text-xl md:text-2xl font-black dark:text-white mt-1">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* 🛠️ ACCIONES DE LA TABLA: BUSCADOR Y SELECTOR DE CANTIDAD */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre o categoría..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#222] border border-gray-100 dark:border-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 dark:text-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider self-end sm:self-center">
          <span>Mostrar:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-gray-50 dark:bg-[#222] border border-gray-100 dark:border-gray-800 px-3 py-2 rounded-xl text-xs dark:text-white focus:outline-none focus:border-blue-500 font-black"
          >
            <option value={25}>25 filas</option>
            <option value={50}>50 filas</option>
            <option value={100}>100 filas</option>
          </select>
        </div>
      </div>

      {/* Tabla de Productos - Responsive */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-[24px] md:rounded-[32px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        {/* Vista Desktop - Tabla */}
        <div className="hidden md:block">
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
              {currentProducts.length === 0 ? ( // Usamos los del slice
                <tr>
                  <td
                    colSpan="4"
                    className="p-20 text-center text-gray-400 font-bold"
                  >
                    {searchTerm ? "No se encontraron productos coincidentes." : "No tienes productos publicados todavía."}
                  </td>
                </tr>
              ) : (
                currentProducts.map((p) => ( // Cambiado a currentProducts
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
                              p.images[0]?.url //[cite: 1]
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
                        {p.sale?.active && p.sale?.price > 0 ? ( //[cite: 1]
                          <>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 line-through decoration-red-500/50">
                              {p.currency === "ARS" ? "$ " : "USD "}
                              {p.price}
                            </span>
                            <p className="font-black text-green-600 dark:text-green-400 text-lg leading-tight whitespace-nowrap">
                              {p.currency === "ARS" ? "$ " : "USD "}
                              {p.sale.price.toLocaleString("es-AR")}
                            </p>
                          </>
                        ) : (
                          <p className="font-black dark:text-white text-lg">
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
                            : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" //[cite: 1]
                        }`}
                      >
                        {p.status === "active" ? "Activo" : "Pausado"}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => toggleStatus(p._id, p.status)} //[cite: 1]
                          className={`p-3 rounded-xl transition-all ${p.status === "active" ? "hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500" : "hover:bg-green-50 dark:hover:bg-green-500/10 text-green-500"}`} //[cite: 1]
                          title={p.status === "active" ? "Pausar" : "Activar"} //[cite: 1]
                        >
                          {p.status === "active" ? ( //[cite: 1]
                            <Pause size={18} /> //[cite: 1]
                          ) : (
                            <Play size={18} /> //[cite: 1]
                          )}
                        </button>
                        <button
                          className="p-3 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-500 rounded-xl transition-all" //[cite: 1]
                          title="Editar" //[cite: 1]
                          onClick={() => handleEditClick(p)} //[cite: 1]
                        >
                          <Edit3 size={18} /> {/*[cite: 1] */}
                        </button>
                        <button
                          onClick={() => confirmDelete(p._id)} //[cite: 1]
                          className="p-3 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-xl transition-all" //[cite: 1]
                          title="Eliminar" //[cite: 1]
                        >
                          <Trash2 size={18} /> {/*[cite: 1] */}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Vista Mobile - Cards */}
        <div className="md:hidden p-4 space-y-4">
          {currentProducts.length === 0 ? ( // Cambiado a currentProducts
            <div className="p-8 text-center text-gray-400 font-bold">
              {searchTerm ? "No se encontraron productos coincidentes." : "No tienes productos publicados todavía."}
            </div>
          ) : (
            currentProducts.map((p) => ( // Cambiado a currentProducts
              <div
                key={p._id}
                className="bg-gray-50 dark:bg-[#252525] rounded-2xl p-4 border border-gray-100 dark:border-gray-800"
              >
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 dark:bg-[#333] flex-shrink-0">
                    <img
                      src={
                        p.images.find((i) => i.isMain)?.url || p.images[0]?.url //[cite: 1]
                      }
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm dark:text-white line-clamp-2">
                      {p.name}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-1">
                      {p.category} • {p.stock} disponibles
                    </p>
                    <div className="mt-2">
                      {p.sale?.active && p.sale?.price > 0 ? ( //[cite: 1]
                        <>
                          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 line-through decoration-red-500/50">
                            {p.currency === "ARS" ? "$ " : "USD "}
                            {p.price}
                          </span>
                          <p className="font-black text-green-600 dark:text-green-400 text-base leading-tight">
                            {p.currency === "ARS" ? "$ " : "USD "}
                            {p.sale.price.toLocaleString("es-AR")}
                          </p>
                        </>
                      ) : (
                        <p className="font-black dark:text-white text-base">
                          ${p.price.toLocaleString("es-AR")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <span
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      p.status === "active"
                        ? "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                        : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" //[cite: 1]
                    }`}
                  >
                    {p.status === "active" ? "Activo" : "Pausado"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleStatus(p._id, p.status)} //[cite: 1]
                      className={`p-2 rounded-lg transition-all ${p.status === "active" ? "hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500" : "hover:bg-green-50 dark:hover:bg-green-500/10 text-green-500"}`} //[cite: 1]
                      title={p.status === "active" ? "Pausar" : "Activar"} //[cite: 1]
                    >
                      {p.status === "active" ? ( //[cite: 1]
                        <Pause size={16} /> //[cite: 1]
                      ) : (
                        <Play size={16} /> //[cite: 1]
                      )}
                    </button>
                    <button
                      className="p-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-500 rounded-lg transition-all" //[cite: 1]
                      title="Editar" //[cite: 1]
                      onClick={() => handleEditClick(p)}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => confirmDelete(p._id)} //[cite: 1]
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 rounded-lg transition-all" //[cite: 1]
                      title="Eliminar" //[cite: 1]
                    >
                      <Trash2 size={16} /> {/*[cite: 1] */}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 📑 CONTROLADOR DE PAGINACIÓN DEBAJO DE LA TABLA (Solo renderiza si hay más de 1 página) */}
        {totalPages > 1 && (
          <div className="p-4 md:p-6 bg-gray-50 dark:bg-[#222] border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">
              Página {currentPage} de {totalPages} ({filteredProducts.length} ítems)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-xl text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              
              <div className="hidden sm:flex items-center gap-1">
                {[...Array(totalPages)].map((_, index) => {
                  const pageNumber = index + 1;
                  // Mostrar solo páginas cercanas para no saturar si hay 20 páginas
                  if (
                    pageNumber === 1 ||
                    pageNumber === totalPages ||
                    Math.abs(pageNumber - currentPage) <= 1
                  ) {
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`w-9 h-9 text-xs font-black rounded-xl transition-all ${
                          currentPage === pageNumber
                            ? "bg-blue-600 text-white shadow-md shadow-blue-500/10"
                            : "bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  }
                  if (
                    pageNumber === 2 ||
                    pageNumber === totalPages - 1
                  ) {
                    return <span key={pageNumber} className="text-gray-400 px-1 text-xs">...</span>;
                  }
                  return null;
                })}
              </div>

              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-xl text-gray-500 dark:text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ProductEditModal
        product={selectedProduct} //[cite: 1]
        isOpen={isEditModalOpen} //[cite: 1]
        onClose={() => setIsEditModalOpen(false)} //[cite: 1]
      />
    </div>
  );
}