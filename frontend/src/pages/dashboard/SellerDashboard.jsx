import { useEffect, useState } from "react";
import { usePrivy } from "../../Utils/authClient";
import {
    Package,
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Edit3,
  Pause,
  Play,
  Trash2,
  Plus,
  ExternalLink,
  Search,
  ChevronLeft,
    ChevronRight,
    Store,
  AlertTriangle,
  DownloadCloud,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import axios from "axios";
import LoadingSpinner from "../../components/LoadingSpinner";
import ProductEditModal from "../../components/ProductEditModal";
import SellerOnboarding from "../../components/SellerOnboarding";
import MyStoreImporter from "../../components/MyStoreImporter";
import { useUserStore } from "../../store/useUserStore";
import { useSyncUser } from "../../Utils/userSync";
import { authFetch } from "../../Utils/axiosAuth";

export default function SellerDashboard() {
  const { getAccessToken } = usePrivy(); //
  const { dbUser, setDbUser } = useUserStore();
  const { syncUser } = useSyncUser(setDbUser);
  const [products, setProducts] = useState([]); //
  const [orders, setOrders] = useState([]); //[cite: 1]
  const [isLoading, setIsLoading] = useState(true); //[cite: 1]
  const [selectedProduct, setSelectedProduct] = useState(null); //[cite: 1]
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); //[cite: 1]
  const [isShopEditOpen, setIsShopEditOpen] = useState(false);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const navigate = useNavigate(); //[cite: 1]

    // 🔍 BÚSQUEDA + PAGINACIÓN (SERVER-SIDE)
  // Un vendedor puede tener miles de productos (import masivo). Por eso NO
  // traemos todo: el backend devuelve de a una página y busca en el server.
  //   - searchTerm      → lo que el usuario escribe (control del input)
  //   - debouncedSearch → término efectivo enviado al backend (con delay)
  //   - currentPage / itemsPerPage → página y tamaño
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // 100 por página

  // Metadatos que devuelve el backend para la paginación.
  const [totalProducts, setTotalProducts] = useState(0); // total con filtro
  const [totalPages, setTotalPages] = useState(1);
  const [isProductsLoading, setIsProductsLoading] = useState(false);

  // Carga inicial de órdenes (independiente de la paginación de productos).
  useEffect(() => {
    fetchMyOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce del buscador: espera 400ms tras la última tecla antes de
  // consultar. Al cambiar el término volvemos a la página 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Recargamos cada vez que cambia página, tamaño o término buscado.
  useEffect(() => {
    fetchMyProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage, debouncedSearch]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

    const handleEditClick = (product) => {
    setSelectedProduct(product); //[cite: 1]
    setIsEditModalOpen(true); //[cite: 1]
  };

    // 👁️ Función para previsualizar el producto en una nueva pestaña
  const handlePreview = (product) => {
    const seg = product?.slug || product?._id || product;
    window.open(`/producto/${seg}`, "_blank", "noopener,noreferrer");
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

      // Trae SOLO la página actual (con búsqueda server-side, si hay término).
  const fetchMyProducts = async () => {
    setIsProductsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(itemsPerPage),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await authFetch(
        `${import.meta.env.VITE_SERVER_URL}/api/product/my-products?${params.toString()}`,
        {},
        getAccessToken,
      );
      const data = await response.json();
      if (data.success) {
        setProducts(data.products || []);
        setTotalProducts(data.total ?? (data.products?.length || 0));
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (error) {
      console.error("Error cargando productos", error);
    } finally {
      setIsProductsLoading(false);
      setIsLoading(false);
    }
  };

      // Pausa/activa un producto. Actualización optimista de la fila mostrada.
  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";

    try {
      const response = await authFetch(
        `${import.meta.env.VITE_SERVER_URL}/api/product/toggle-status/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        },
        getAccessToken,
      );

      if (!response.ok) throw new Error("Error al actualizar el estado");

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
        try {
          const response = await authFetch(
            `${import.meta.env.VITE_SERVER_URL}/api/product/delete/${id}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
            },
            getAccessToken,
          );

                    if (!response.ok) throw new Error("Error al eliminar");

          // Refrescamos la página actual (el total baja en el server). Si la
          // página queda vacía y no es la primera, retrocedemos una página.
          const remaining = products.filter((p) => p._id !== id);
          if (remaining.length === 0 && currentPage > 1) {
            setCurrentPage((p) => p - 1);
          } else {
            fetchMyProducts();
          }

          Swal.fire({
            title: "¡Eliminado!", //[cite: 1]
            text: "El producto ha sido quitado de tu lista.", //[cite: 1]
            icon: "success", //[cite: 1]
            background: "#1A1A1A", //[cite: 1]
            color: "#fff", //[cite: 1]
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

  // Datos reales de la tienda para el modal de edición (prefilleo).
  const shop = dbUser?.shop || {};
  const shopPrefill = {
    firstName: dbUser?.firstName || "",
    lastName: dbUser?.lastName || "",
    dni: dbUser?.dni || "",
    phone: dbUser?.phone || "",
    shopName: shop?.name || "",
    shopDescription: shop?.description || "",
    province: shop?.location?.province || "",
    city: shop?.location?.city || "",
    zipCode: shop?.location?.zipCode || "",
    bankName: shop?.bankAccounts?.[0]?.bankName || "",
    holderName: shop?.bankAccounts?.[0]?.holderName || "",
    cuitCuil: shop?.bankAccounts?.[0]?.cuit || "",
    cbuCvu: shop?.bankAccounts?.[0]?.cbu || "",
                alias: shop?.bankAccounts?.[0]?.alias || "",
  };

  // 💰 Total COMERCIADO en USD: suma del valor bruto (totalUsd) de las órdenes completadas.
  const totalTradedUsd = orders
    .filter((order) => order.status === "completed")
    .reduce((acc, order) => acc + (order.financials?.totalUsd || 0), 0);

    // ⚠️ "Productos" usa el total real del server (no solo la página). "Vistas"
  // refleja la página actual, porque no traemos todo el catálogo.
  const stats = [
    {
      label: "Productos",
      value: totalProducts,
      icon: <Package size={20} />,
      color: "text-blue-500",
    },
    {
      label: "Vistas (página)",
      value: products.reduce((acc, p) => acc + (p.views || 0), 0),
      icon: <Eye size={20} />,
      color: "text-purple-500",
    },
    {
      label: "Mis Órdenes",
      value: orders.length,
      icon: <ShoppingCart size={20} />,
      color: "text-green-500",
      clickable: true,
      onClick: () => navigate("/mis-ordenes"),
    },
    {
      label: "Total Comerciado",
      value: `USD ${totalTradedUsd.toLocaleString("en-US")}`,
      icon: <TrendingUp size={20} />,
      color: "text-amber-500",
    },
  ];

    if (isLoading)
    return (
      <div className="p-10 text-center">
        <LoadingSpinner size="lg" text="Cargando Panel..." />
      </div>
    );

  // Rango visible actual para el pie de paginación (ej: "1–100 de 9714").
  const rangeStart = totalProducts === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const rangeEnd = Math.min(currentPage * itemsPerPage, totalProducts);


    return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8">

      {/* 🔒 AVISO: SIN WALLET NO PUEDE PUBLICAR RCELAB/SEGUIR PUBLICANDO */}
      {dbUser && !dbUser.walletAddress && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
          <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
              Vinculá una wallet Web3 para recibir tus pagos
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
              Para publicar productos y cobrar en USDT necesitás una billetera vinculada (la garantía se gestiona on-chain). Los productos que publiques sin wallet no podrán venderse ni mostrarse. Activá tu billetera desde{" "}
              <span
                className="underline font-semibold cursor-pointer hover:text-amber-900 dark:hover:text-amber-200"
                onClick={() => navigate("/billetera")}
              >
                Mi Billetera
              </span>.
            </p>
          </div>
        </div>
      )}

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
                                <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3">
                  {/* ── Importador Tiendanube OCULTO ──
                      Feature INTERNA (no expuesta a sellers). Se conserva el
                      código y el estado (`isImporterOpen`) para reactivarlo más
                      adelante, pero el botón NO se muestra. */}
                  {false && dbUser?.shop?.active && (
                    <button
                      onClick={() => setIsImporterOpen(true)}
                      className="w-full md:w-auto bg-[#F26722]/10 hover:bg-[#F26722]/20 text-[#F26722] border border-[#F26722]/30 px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 uppercase text-xs tracking-widest"
                    >
                      <DownloadCloud size={18} /> Importar mi Tienda
                    </button>
                  )}
                  {dbUser?.shop?.active && (
            <button
              onClick={() => setIsShopEditOpen(true)}
              className="w-full md:w-auto bg-white dark:bg-[#1A1A1A] hover:bg-gray-50 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 uppercase text-xs tracking-widest"
            >
              <Store size={18} /> Editar tienda
            </button>
          )}
          <button
            onClick={() => navigate("/vender")} //[cite: 1]
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20 uppercase text-xs tracking-widest"
          >
            <Plus size={18} /> Vender
          </button>
        </div>
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
              {isProductsLoading ? (
                <tr>
                  <td colSpan="4" className="p-20 text-center">
                    <LoadingSpinner size="md" text="Cargando productos..." />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="p-20 text-center text-gray-400 font-bold"
                  >
                    {debouncedSearch ? "No se encontraron productos coincidentes." : "No tienes productos publicados todavía."}
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
                                                            p.images?.find((i) => i.isMain)?.url ||
                              p.images?.[0]?.url
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
                            ${Number(p.price || 0).toLocaleString("es-AR")}
                          </p>
                        )}
                      </div>
                    </td>
                                        <td className="p-6 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            p.status === "active"
                              ? "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                              : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                          }`}
                        >
                          {p.status === "active" ? "Activo" : "Pausado"}
                        </span>
                        {/* Estado de MODERACIÓN (independiente del de venta). */}
                        {p.moderation?.status === "pending" && (
                          <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                            En revisión
                          </span>
                        )}
                        {p.moderation?.status === "rejected" && (
                          <span
                            className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 cursor-help"
                            title={p.moderation?.reason || "Publicación rechazada"}
                          >
                                                        Rechazado
                          </span>
                        )}
                        {/* Oculto al publico por falta de wallet del vendedor
                            (solo productos de pago; clasificados no la usan). */}
                        {!dbUser?.walletAddress && p.listingType === "product" && (
                          <span
                            className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-zinc-200 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300 cursor-help"
                            title="No visible para compradores hasta que vincules tu wallet (Mi Billetera)."
                          >
                            Oculto · sin wallet
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-6">
                                            <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handlePreview(p)}
                          className="p-3 hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-500 rounded-xl transition-all"
                          title="Vista previa"
                        >
                          <Eye size={18} />
                        </button>
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
          {isProductsLoading ? (
            <div className="p-8 text-center">
              <LoadingSpinner size="md" text="Cargando productos..." />
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-gray-400 font-bold">
              {debouncedSearch ? "No se encontraron productos coincidentes." : "No tienes productos publicados todavía."}
            </div>
          ) : (
            products.map((p) => (
              <div
                key={p._id}
                className="bg-gray-50 dark:bg-[#252525] rounded-2xl p-4 border border-gray-100 dark:border-gray-800"
              >
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 dark:bg-[#333] flex-shrink-0">
                    <img
                      src={
                        p.images?.find((i) => i.isMain)?.url ||
                        p.images?.[0]?.url
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
                          ${Number(p.price || 0).toLocaleString("es-AR")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col gap-1.5">
                    <span
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        p.status === "active"
                          ? "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                          : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                      }`}
                    >
                      {p.status === "active" ? "Activo" : "Pausado"}
                    </span>
                    {/* Estado de MODERACIÓN (independiente del de venta). */}
                    {p.moderation?.status === "pending" && (
                      <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                        En revisión
                      </span>
                    )}
                                        {p.moderation?.status === "rejected" && (
                      <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                        Rechazado: {p.moderation?.reason || "ver detalle"}
                      </span>
                    )}
                    {/* Oculto al publico por falta de wallet (solo productos de pago). */}
                    {!dbUser?.walletAddress && p.listingType === "product" && (
                      <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-zinc-200 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                        Oculto · sin wallet
                      </span>
                    )}
                  </div>
                                    <div className="flex gap-2">
                    <button
                      onClick={() => handlePreview(p)}
                      className="p-2 hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-500 rounded-lg transition-all"
                      title="Vista previa"
                    >
                      <Eye size={16} />
                    </button>
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
              Mostrando {rangeStart}–{rangeEnd} de {totalProducts} ({totalPages} páginas)
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
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
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
        product={selectedProduct}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          // Al cerrar, refrescamos: editar vuelve el producto a "pending" y
          // queremos reflejar el estado de moderación en la tabla.
          fetchMyProducts();
        }}
      />

            <SellerOnboarding
        isOpen={isShopEditOpen}
        mode="edit"
        prefill={shopPrefill}
        onClose={() => {
          setIsShopEditOpen(false);
          // Refrescamos el usuario en el store para reflejar los cambios de la tienda.
          syncUser();
        }}
        onComplete={() => {}}
      />

            {/* Importador de Tiendanube (tienda propia del vendedor) — OCULTO.
          Se mantiene por si se reactiva el feature interno. `isImporterOpen`
          nunca se pone en true (el botón está oculto), así que no se renderiza. */}
      {false && isImporterOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-5xl my-4">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => {
                  setIsImporterOpen(false);
                  // Refrescamos productos: pudo haber importado.
                  fetchMyProducts();
                }}
                className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold text-xs uppercase hover:bg-white/20 transition-all"
              >
                Cerrar
              </button>
            </div>
            <MyStoreImporter />
          </div>
        </div>
      )}
    </div>
  );
}