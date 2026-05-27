import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShoppingCart,
  Heart,
  Share2,
  Truck,
  Shield,
  CreditCard,
  CheckCircle,
  Star,
  MapPin,
  Award,
  MessageCircle,
} from "lucide-react";
import ProductCarousel from "../components/ProductCarousel"; // Reutilizamos para relacionados
import { useCartStore } from "../store/useCartStore";
import LoadingSpinner from "../components/LoadingSpinner";
import Swal from "sweetalert2";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [isSaved, setIsSaved] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setDirectPurchase } = useCartStore();
  const { addToCart, cart, updateQuantity } = useCartStore();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/api/product/${id}`,
        );
        if (!response.ok) throw new Error("Producto no encontrado");
        const data = await response.json();
        console.log(data);
        setProduct(data);
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchProduct();
    window.scrollTo(0, 0);
  }, [id]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-900 dark:text-white">
        <LoadingSpinner size="lg" text="Cargando producto..." />
      </div>
    );
  if (!product)
    return (
      <div className="text-center py-12 dark:text-white">
        Producto no encontrado
      </div>
    );

  const formatPrice = (price, currency) => {
    const formatter = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    // Ajuste visual para que el dólar se vea como "U$S" que es común en Argentina
    let formatted = formatter.format(price);
    if (currency === "USD") {
      formatted = formatted.replace("US$", "USD");
    }
    return formatted;
  };

  const discount = product.sale?.active
    ? Math.round((1 - product.sale.price / product.price) * 100)
    : 0;

  const handleBuyNow = () => {
    // 1. Verificamos si ya está en el carrito para no duplicar
    const isInCart = cart.some((item) => item._id === product._id);

    if (!isInCart) {
        const normalizedProduct = {
      ...product,
      sellerId: product.seller?._id || product.seller, // Siempre plano
      seller: product.seller?._id || product.seller, // Lo sobreescribimos para unificar
    };

    addToCart(normalizedProduct);
      console.log("desde handle buy now: ", product) // Agregamos con cantidad 1 (o la que tengas seleccionada)
    }
    if (quantity > 1) {
      updateQuantity(product._id, quantity);
    }
    navigate(`/checkout/${product.seller._id || product.seller}`);
  };

  const handleAddToCart = () => {
    // Normalizamos: nos aseguramos que seller sea el ID plano
    // pero conservamos la info del vendedor en otra propiedad si la necesitás
    const normalizedProduct = {
      ...product,
      sellerId: product.seller?._id || product.seller, // Siempre plano
      seller: product.seller?._id || product.seller, // Lo sobreescribimos para unificar
    };

    addToCart(normalizedProduct);
    if (quantity > 1) {
      updateQuantity(product._id, quantity);
    }
     const Toast = Swal.mixin({
        toast: true,
        position: 'top-end', // Se muestra arriba a la derecha (estilo notificación)
        showConfirmButton: false,
        timer: 2000, // Dura 2 segundos y se va
        timerProgressBar: true, // Barra de tiempo visual abajo
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer);
          toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
      });
    
      Toast.fire({
        icon: 'success',
        title: '¡Agregado al carrito!',
        text: product.title || product.name, // Muestra el nombre del producto abajo en chiquito
        background: document.documentElement.classList.contains('dark') ? '#18181b' : '#ffffff', // Soporte Dark Mode automático (Zinc-900 o Blanco)
        color: document.documentElement.classList.contains('dark') ? '#f4f4f5' : '#3f3f46',
        iconColor: '#3483fa', // El azul característico que estamos usando
        customClass: {
          popup: 'border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg font-sans',
          title: 'text-sm font-bold text-gray-800 dark:text-zinc-100',
          htmlContainer: 'text-xs text-gray-500 dark:text-zinc-400'
        }
      });
  };

  return (
    <div className="bg-[#f5f5f5] dark:bg-[#0a0a0a] min-h-screen pb-12 transition-colors">
      <div className="max-w-[1200px] mx-auto px-4 pt-4">
        {/* Breadcrumbs */}
        <nav className="text-[11px] mb-3 flex gap-2 text-gray-500 dark:text-gray-400">
          <span
            className="hover:underline cursor-pointer"
            onClick={() => navigate("/")}
          >
            Volver al listado
          </span>
          <span>|</span>
          <span>{product.category.replace(/-/g, ' ')}</span>
          <span>&gt;</span>
          <span className="font-semibold">{product.subCategory.replace(/-/g, ' ')}</span>
        </nav>

        {/* Contenedor Principal */}
        <div className="bg-white dark:bg-[#121212] rounded-sm shadow-sm border border-gray-200 dark:border-gray-800 grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
          {/* COLUMNA IZQUIERDA: Fotos y Detalles */}
          <div className="lg:col-span-2 border-r border-gray-100 dark:border-gray-800 p-4 lg:p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Selector de fotos lateral */}
              <div className="hidden md:flex flex-col gap-2">
                {product.images?.map((img, idx) => (
                  <button
                    key={idx}
                    onMouseEnter={() => setSelectedImageIndex(idx)}
                    className={`w-11 h-11 border rounded-md overflow-hidden p-1 transition-all ${
                      selectedImageIndex === idx
                        ? "border-[#3483fa] border-2"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <img
                      src={img.url}
                      className="w-full h-full object-contain bg-white"
                      alt="thumb"
                    />
                  </button>
                ))}
              </div>

              {/* Imagen Principal */}
              <div className="flex-1 flex items-center justify-center min-h-[350px] lg:min-h-[450px]">
                <img
                  src={product.images?.[selectedImageIndex]?.url}
                  className="max-w-full max-h-[450px] object-contain"
                  alt={product.name}
                />
              </div>
            </div>

            <hr className="my-8 border-gray-100 dark:border-gray-800" />

            {/* Características */}
            <div className="mb-8">
              <h2 className="text-xl mb-4 dark:text-white font-medium">
                Características principales
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 border border-gray-100 dark:border-gray-800 rounded-md overflow-hidden">
                {product.specifications?.slice(0, 10).map((spec, idx) => (
                  <div
                    key={idx}
                    className={`flex p-2.5 text-sm ${idx % 2 === 0 ? "bg-gray-50 dark:bg-[#1a1a1a]" : "bg-white dark:bg-[#121212]"} border-b border-gray-100 dark:border-gray-800`}
                  >
                    <span className="font-semibold w-1/2 dark:text-gray-300">
                      {spec.key}
                    </span>
                    <span className="w-1/2 dark:text-gray-400">
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Descripción */}
            <div className="pb-8">
              <h2 className="text-xl mb-4 dark:text-white font-medium">
                Descripción
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-[16px] whitespace-pre-line leading-relaxed">
                {product.description}
              </p>
            </div>
          </div>

          {/* COLUMNA DERECHA: Compra (Compacta) */}
          <div className="p-4 lg:p-5 bg-white dark:bg-[#121212]">
            <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-[#121212]">
              <div className="text-[12px] text-gray-500">
                {/* Solo mostramos Nuevo/Usado si NO es un clasificado */}
                {product.listingType !== "classified" && (
                  <span className="text-xs font-medium text-gray-500">
                    {product.condition === "new" ? "Nuevo " : "Usado"}
                  </span>
                )}
                {product.listingType === "product"
                  ? `| ${product.sold} vendidos`
                  : ""}
                {/* Badge de estado/kilometraje para Clasificados */}
                {product.listingType === "classified" && (
                  <div className="flex items-center gap-2 mb-2">
                    {product.specifications?.map((spec) => {
                      if (spec.key === "Kilómetros") {
                        return (
                          <span
                            key={spec.key}
                            className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase rounded-md border border-zinc-200 dark:border-zinc-700"
                          >
                            {spec.value}
                          </span>
                        );
                      }
                      return null;
                    })}

                    {/* Opcional: Podés agregar otro para el Año si la key es "Año" */}
                    {product.specifications?.find((s) => s.key === "Año") && (
                      <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase rounded-md border border-zinc-200 dark:border-zinc-700">
                        {
                          product.specifications.find((s) => s.key === "Año")
                            .value
                        }
                      </span>
                    )}
                  </div>
                )}
              </div>

              <h1 className="text-lg lg:text-xl font-bold dark:text-white leading-snug">
                {product.name}
              </h1>

              {/* Precio Compacto */}
              <div className="pt-2">
                {product.sale?.active && (
                  <span className="text-gray-400 line-through text-sm block">
                    {formatPrice(product.price, product.currency)}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-normal dark:text-white">
                    {formatPrice(
                      product.sale?.active ? product.sale.price : product.price,
                      product.currency,
                    )}
                  </span>
                  {discount > 0 && (
                    <span className="text-green-500 text-base font-medium">
                      {discount}% OFF
                    </span>
                  )}
                </div>
                {/* <p className="text-[#3483fa] text-[13px] mt-0.5 cursor-pointer hover:underline">
                  Ver medios de pago
                </p> */}
              </div>

              {/* Envío y Ubicación */}
              <div className="space-y-3 py-2">
                {/* Solo mostramos envío si NO es un clasificado */}
                {product.listingType !== "classified" || product.category !== "autos-motos-y-otros" && (
                  <div className="flex gap-2.5">
                    <Truck
                      className={`w-4 h-4 shrink-0 mt-1 ${product.shipping?.free ? "text-green-500" : "text-gray-400"}`}
                    />
                    <div>
                      {product.shipping?.free ? (
                        <>
                          <p className="text-green-500 text-sm font-medium">
                            Envío gratis a todo el país
                          </p>
                          <p className="text-gray-500 text-xs">
                            A través de Mercado Nero Envíos
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-gray-900 dark:text-gray-200 text-sm font-medium">
                            Envío a cargo del comprador
                          </p>
                          <p className="text-[#3483fa] text-xs cursor-pointer hover:underline">
                            Calcular costo de envío
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* La ubicación siempre es relevante, pero en clasificados es CRUCIAL */}
                <div className="flex gap-2.5">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <p className="text-[13px] dark:text-gray-400">
                      Ubicado en{" "}
                      <span className="text-gray-700 dark:text-gray-200 font-medium">
                        {product.location?.city || "Ubicación no especificada"}
                        {product.location?.state
                          ? `, ${product.location.state}`
                          : ""}
                      </span>
                    </p>
                    {product.listingType === "classified" && (
                      <p className="text-[#3483fa] text-xs cursor-pointer hover:underline mt-1">
                        Ver mapa y contacto
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Stock Selector - Solo si NO es clasificado */}
              {product.listingType !== "classified" && product.stock > 0 && (
                <div className="py-2">
                  <p className="text-sm font-semibold mb-1.5 dark:text-white">
                    Stock disponible
                  </p>
                  <div className="inline-flex items-center px-2 py-1 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded text-sm">
                    <span className="text-gray-500">Cantidad: </span>
                    <select
                      className="bg-transparent font-bold text-gray-800 dark:text-gray-200 outline-none ml-1 cursor-pointer"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    >
                      {/* Generamos opciones basadas en el stock real (tope 6 como ML) */}
                      {[...Array(Math.min(product.stock, 6))].map((_, i) => (
                        <option
                          key={i + 1}
                          value={i + 1}
                          className="dark:bg-[#121212]"
                        >
                          {i + 1} unidad{i > 0 ? "es" : ""}
                        </option>
                      ))}
                    </select>
                    {product.stock > 6 && (
                      <span className="text-xs text-gray-400 ml-2">
                        ({product.stock} disponibles)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Botones de Acción Principales */}
              <div className="space-y-2 pt-2">
                {product.listingType === "product" && product.category !== "autos-motos-y-otros"? (
                  // FLUJO DE PRODUCTO: Carrito y Compra Directa
                  <>
                    <button
                      className="w-full bg-[#3483fa] hover:bg-[#2968c8] text-white py-2.5 rounded-md font-semibold text-sm transition-colors"
                      onClick={() => handleBuyNow()}
                    >
                      Comprar ahora
                    </button>
                    <button
                      className="w-full bg-[#3483fa1a] hover:bg-[#3483fa26] text-[#3483fa] py-2.5 rounded-md font-semibold text-sm transition-colors"
                      onClick={() => handleAddToCart()}
                    >
                      Agregar al carrito
                    </button>
                  </>
                ) : (
                  // FLUJO DE CLASIFICADO: Contacto Directo
                  <>
                    <button
                      className="w-full bg-[#00bb2d] hover:bg-[#00a327] text-white py-2.5 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                      onClick={() => {
                        const message = `Hola! Estoy interesado en el producto: ${product.title}. Me podrías dar más información?`;
                        window.open(
                          `https://wa.me/${product.seller?.phone}?text=${encodeURIComponent(message)}`,
                          "_blank",
                        );
                      }}
                    >
                      <MessageCircle size={18} />
                      Contactar por WhatsApp
                    </button>

                    <button
                      className="w-full border border-[#3483fa] text-[#3483fa] py-2.5 rounded-md font-semibold text-sm hover:bg-[#3483fa0d] transition-colors"
                      onClick={() => {
                        /* Aquí podrías abrir un modal de "Preguntar" */
                      }}
                    >
                      Hacer una pregunta
                    </button>
                  </>
                )}
              </div>

              {/* Info extra compacta */}
              {/* Solo mostramos confianza y garantía en productos físicos/ecommerce */}
              {product.listingType === "product" && (
                <div className="text-[11px] space-y-2 pt-4 text-gray-500">
                  <div className="flex gap-2">
                    <Shield className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    <p>
                      <span className="text-[#3483fa] cursor-pointer hover:underline">
                        Compra Protegida
                      </span>{" "}
                      con Mercado Nero. Recibí el producto que esperabas o te
                      devolvemos tu dinero.
                    </p>
                  </div>

                  {/* Mostramos garantía solo si el campo existe, sino omitimos la línea */}
                  {product.warranty && (
                    <div className="flex gap-2">
                      <Award className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      <p>
                        Garantía del vendedor:{" "}
                        {typeof product.warranty === "object"
                          ? product.warranty.duration || "Consultar"
                          : String(product.warranty)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Si es clasificado, podrías poner una leyenda de seguridad diferente */}
              {product.listingType === "classified" && (
                <div className="text-[11px] pt-4 text-gray-500 italic">
                  <p>
                    Al ser un vehículo, inmueble o servicio, la transacción se
                    realiza de forma privada. Recomendamos siempre tomar
                    recaudos necesarios antes de transferir dinero ya que la
                    plataforma no protege estas transacciones.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Relacionados */}
        <div className="mt-10">
          <ProductCarousel
            title="Productos similares"
            category={product.category}
            sectionId="related"
          />
        </div>
      </div>
    </div>
  );
}
