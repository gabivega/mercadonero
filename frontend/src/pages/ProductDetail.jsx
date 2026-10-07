import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShoppingCart,
  Heart,
  Truck,
  Shield,
  CreditCard,
  CheckCircle,
  Star,
  MapPin,
  Award,
  MessageCircle,
} from "lucide-react";
import ProductCarousel from "../components/ProductCarousel"; // Reutilizamos para relacionados y compras grupales
import ProductQuestions from "../components/ProductQuestions"; // Preguntas y respuestas
import ProductReviews from "../components/ProductReviews"; // Opiniones del producto
import { useCartStore } from "../store/useCartStore";
import LoadingSpinner from "../components/LoadingSpinner";
import Swal from "sweetalert2";
import CashbackBadge from "../components/CashbackBadge";
import ReferralShareBox from "../components/ReferralShareBox";
import SocialSellingSection from "../components/SocialSellingSection";
import SocialSellingBanner from "../components/SocialSellingBanner";
import ShippingQuoteBox from "../components/ShippingQuoteBox";
import PickupOption from "../components/PickupOption";
import { useUserStore } from "../store/useUserStore";
import { productUrl } from "../Utils/productUrl";

/**
 * Inyecta metadatos SEO (title, description, canonical, Open Graph y
 * JSON-LD estructurado) para la página de un producto. Se llama al cargar
 * el producto y mejora la indexación y los snippets en buscadores.
 * Si existe react-helmet en el proyecto, se podría migrar, pero este enfoque
 * sin dependencias es suficiente para una SPA con prerender.
 */
const setMetaTag = (attr, key, content) => {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const applyProductSeo = (product) => {
  const title = `${product.name} | Mercado Nero`;
  document.title = title;

  const price = product.sale?.active ? product.sale.price : product.price;
  const currencyLabel = product.currency === "USD" ? "USD" : "ARS";
  const priceLabel = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currencyLabel,
    minimumFractionDigits: 0,
  }).format(price || 0);

  // Descripción: recortamos la descripción del producto a ~155 caracteres
  // (largo recomendado por buscadores) sin cortar palabras.
  let desc = (product.description || "").replace(/\s+/g, " ").trim();
  if (desc.length > 155) {
    desc = desc.slice(0, 155);
    desc = desc.slice(0, desc.lastIndexOf(" ")) + "…";
  }
  const metaDescription =
    desc || `${product.name} a ${priceLabel}. Comprá en Mercado Nero.`;

  const url = productUrl(product);
  const image = product.images?.[0]?.url || "";

  setMetaTag("name", "description", metaDescription);
  setMetaTag("property", "og:type", "product");
  setMetaTag("property", "og:title", title);
  setMetaTag("property", "og:description", metaDescription);
  setMetaTag("property", "og:url", url);
  if (image) setMetaTag("property", "og:image", image);
  setMetaTag("name", "twitter:card", "summary_large_image");
  setMetaTag("name", "twitter:title", title);
  setMetaTag("name", "twitter:description", metaDescription);
  if (image) setMetaTag("name", "twitter:image", image);

  // URL canónica: consolida todas las variantes (con/sin ObjectId) en UN solo
  // enlace para evitar contenido duplicado.
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", url);

  // ── DATOS ESTRUCTURADOS (JSON-LD) ──
  // Permite a Google mostrar precio, disponibilidad y rating directamente en
  // los resultados de búsqueda (rich snippets), mejorando el CTR orgánico.
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images?.map((i) => i.url) || [],
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: currencyLabel,
      price: price || 0,
      availability:
        (product.stock ?? 0) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition:
        product.condition === "used"
          ? "https://schema.org/UsedCondition"
          : product.condition === "refurbished"
            ? "https://schema.org/RefurbishedCondition"
            : "https://schema.org/NewCondition",
    },
  };
  if (product.rating > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      bestRating: 5,
    };
  }

  const SCRIPT_ID = "product-jsonld";
  let script = document.getElementById(SCRIPT_ID);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = SCRIPT_ID;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(jsonLd);
};

export default function ProductDetail() {
  // El segmento puede ser el slug SEO o (en enlaces viejos) el ObjectId.
  const params = useParams();
  const id = params.idOrSlug || params.id;
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [isSaved, setIsSaved] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setDirectPurchase } = useCartStore();
  const { addToCart, cart, updateQuantity } = useCartStore();
  const dbUser = useUserStore((s) => s.dbUser);
  const currentUserId = dbUser?._id;

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/api/product/${id}`,
        );
        if (!response.ok) throw new Error("Producto no encontrado");
        const data = await response.json();
        // console.log(data);
        setProduct(data);

        // ── SEO DINÁMICO ──
        // Actualizamos los metadatos de la página con el título, la
        // descripción y la imagen del producto para mejorar el CTR y la
        // indexación orgánica. También fijamos la URL canónica con slug.
        if (data?.slug) {
          applyProductSeo(data);
          // Si llegamos por el ObjectId (enlace viejo), redirigimos a la
          // URL canónica con slug para consolidar el SEO (mismo contenido,
          // una sola URL). replace:true evita ensuciar el historial.
          if (id !== data.slug) {
            navigate(`/producto/${data.slug}`, { replace: true });
          }
        }
      } catch (error) {
        // console.error("Error fetching product:", error);   
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchProduct();
    window.scrollTo(0, 0);

    // Al salir de la página limpiamos el JSON-LD del producto para que no
    // quede colgado en otras vistas (evita datos estructurados incorrectos).
    return () => {
      const script = document.getElementById("product-jsonld");
      if (script) script.remove();
    };
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

  // ── STOCK APROXIMADO ──
  // Para inventarios grandes no mostramos el número exacto (no exponemos la
  // capacidad real del vendedor y comunicamos "hay de sobra" sin ruido).
  // Escalones suaves para que no haya un salto brusco de "9" a "+100":
  //   < 10      → número exacto (ahí la escasez real ayuda a decidir)
  //   10–24     → "+10"
  //   25–49     → "+25"
  //   50–99     → "+50"
  //   100–999   → "+100"
  //   ≥ 1000    → "+1000"
  const formatStock = (stock) => {
    const n = Number(stock) || 0;
    if (n < 10) return `${n}`;
    if (n < 25) return "+10";
    if (n < 50) return "+25";
    if (n < 100) return "+50";
    if (n < 1000) return "+100";
    return "+1000";
  };

  const handleBuyNow = () => {
    // 1. Verificamos si ya está en el carrito para no duplicar
    const isInCart = cart.some((item) => item._id === product._id);

    if (!isInCart) {
      const normalizedProduct = {
        ...product,
        sellerId: product.seller?._id || product.seller, // Siempre plano
        seller: product.seller, // Conservamos el objeto poblado (shop.name/username)
      };

      addToCart(normalizedProduct);
      // console.log("desde handle buy now: ", product); // Agregamos con cantidad 1 (o la que tengas seleccionada)
    }
    if (quantity > 1) {
      updateQuantity(product._id, quantity);
    }
    navigate(`/checkout/${product.seller._id || product.seller}`);
  };

  const handleAddToCart = () => {
    // Normalizamos: sellerId SIEMPRE plano, pero conservamos el objeto
    // `seller` poblado (con shop.name/username) para que el carrito pueda
    // mostrar el nombre de la tienda.
    const normalizedProduct = {
      ...product,
      sellerId: product.seller?._id || product.seller, // Siempre plano
      seller: product.seller, // Conservamos el objeto poblado
    };

    addToCart(normalizedProduct);
    if (quantity > 1) {
      updateQuantity(product._id, quantity);
    }
    const Toast = Swal.mixin({
      toast: true,
      position: "top-end", // Se muestra arriba a la derecha (estilo notificación)
      showConfirmButton: false,
      timer: 2000, // Dura 2 segundos y se va
      timerProgressBar: true, // Barra de tiempo visual abajo
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });

    Toast.fire({
      icon: "success",
      title: "¡Agregado al carrito!",
      text: product.title || product.name, // Muestra el nombre del producto abajo en chiquito
      background: document.documentElement.classList.contains("dark")
        ? "#18181b"
        : "#ffffff", // Soporte Dark Mode automático (Zinc-900 o Blanco)
      color: document.documentElement.classList.contains("dark")
        ? "#f4f4f5"
        : "#3f3f46",
      iconColor: "#3483fa", // El azul característico que estamos usando
      customClass: {
        popup:
          "border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg font-sans",
        title: "text-sm font-bold text-gray-800 dark:text-zinc-100",
        htmlContainer: "text-xs text-gray-500 dark:text-zinc-400",
      },
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
          <span className="capitalize whitespace-nowrap">{product.category.replace(/-/g, " ")}</span>
          <span>&gt;</span>
          <span className="font-semibold capitalize whitespace-nowrap">
            {product.subCategory.replace(/-/g, " ")}
          </span>
        </nav>

        {/* Contenedor Principal.
            El grid tiene DOS filas lógicas (implícitas):
              - Fila 1: [izquierda: imágenes + descripción] [derecha: compra]
              - Fila 2 (ancho completo, md:col-span-3): opiniones y preguntas.
            OJO: NO usar `overflow-hidden` en este contenedor — rompería el
            `position: sticky` de la columna de compra. */}
        <div className="bg-white dark:bg-[#121212] rounded-sm shadow-sm border border-gray-200 dark:border-gray-800 grid grid-cols-1 md:grid-cols-3">
          {/* COLUMNA IZQUIERDA (Fila 1): Fotos y Características */}
          <div className="border-r border-gray-100 dark:border-gray-800 p-4 md:p-6 order-2 md:order-1 md:col-span-2">
            <div className="hidden md:flex flex-col md:flex-row gap-6">
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
              <div className="flex-1 flex items-center justify-center min-h-[350px] md:min-h-[450px]">
                <img
                  src={product.images?.[selectedImageIndex]?.url}
                  className="max-w-full max-h-[450px] object-contain"
                  alt={product.name}
                />
              </div>
            </div>

            <hr className="my-8 border-gray-100 dark:border-gray-800" />
                {/* SOCIAL SELLING: Compra en Grupo (pools) — el gancho principal,
                arriba de todo en el bloque ancho para que se vea ni bien se
                accede. Solo productos con el feature habilitado por el vendedor. */}
            {product.listingType === "product" &&
              product.category !== "autos-motos-y-otros" &&
              product.socialSelling?.enabled && (
                <div className="pb-8">
                  <SocialSellingSection
                    product={product}
                    currentUserId={currentUserId}
                  />
                </div>
              )}
            {/* Características */}
            {/* <div className="mb-8">
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
            </div> */}

            {/* DESCRIPCIÓN — se muestra acá (columna izquierda) para equilibrar
                la altura con la columna de compra y evitar el hueco vacío que
                quedaba debajo de las imágenes en productos con poco texto. */}
            <div className="hidden md:block border-t border-gray-100 dark:border-gray-800 pt-6">
              <h2 className="text-xl mb-4 dark:text-white font-medium">
                Descripción
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-[16px] whitespace-pre-line leading-relaxed">
                {product.description}
              </p>
            </div>
          </div>

          {/* COLUMNA DERECHA (Fila 1): Compra (Compacta).
              Sticky en desktop: al scrollear, la caja de compra acompaña para
              no perderse. `self-start` es REQUERIDO para que el sticky funcione
              dentro de un grid item (si no, el item se estira toda la altura). */}
          <div className="order-1 md:order-2 p-4 md:p-5 bg-white dark:bg-[#121212] md:self-start md:sticky md:top-20">
            <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-[#121212]">
              <div className="text-[12px] text-gray-500">
                {/* Solo mostramos Nuevo/Usado si NO es un clasificado */}

                {product.listingType === "product" ? (
                  <div className="flex justify-between">
                    <div className="flex flex-row w-full">
                      <span className="text-xs font-medium text-gray-500">
                        {product.condition === "new" ? "Nuevo " : "Usado"}
                      </span>
                      <span className="ml-1">| {product.sold} vendidos</span>
                    </div>
                    <span className="whitespace-nowrap">⭐ {product.rating}</span>
                  </div>
                ) : (
                  ""
                )}
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

              {/* Vendido por → perfil público del vendedor */}
              {product.seller?._id && (
                <button
                  onClick={() => navigate(`/user/${product.seller._id}`)}
                  className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 hover:text-[#3483fa] transition-colors"
                >
                  Vendido por{" "}
                  <span className="underline">
                    {product.seller?.shop?.name ||
                      product.sellerName ||
                      `@${product.seller.username || "vendedor"}`}
                  </span>
                </button>
              )}

              <h1 className="text-lg lg:text-xl font-bold dark:text-white leading-snug mt-1">
                {product.name}
              </h1>

              {/* 📱 1. GALERÍA PARA MOBILE (Visible solo en pantallas menores a md) */}
              <div className="flex flex-col gap-4 md:hidden mb-6">
              {/* Imagen Principal Mobile */}
              <div className="w-full flex items-center justify-center min-h-[300px] bg-white dark:bg-[#121212] rounded-md p-2">
                <img
                  src={product.images?.[selectedImageIndex]?.url}
                  className="max-w-full max-h-[300px] object-contain"
                  alt={product.name}
                />
              </div>
              {/* Miniaturas en carrusel horizontal debajo (Mobile) */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {product.images?.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)} // En mobile usamos onClick en vez de hover
                    className={`w-14 h-14 border rounded-md overflow-hidden p-1 flex-shrink-0 transition-all ${
                      selectedImageIndex === idx
                        ? "border-[#F26722] border-2" // Usamos tu naranja de Mercado Nero
                        : "border-gray-200 dark:border-gray-700 bg-white"
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
              </div>
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

              {/* Cashback (reintegro en USDT) — solo productos de pago; los
                  clasificados (autos/inmuebles/servicios) no generan reintegro */}
              {product.listingType === "product" && (
                <CashbackBadge
                  priceArs={product.sale?.active ? product.sale.price : product.price}
                />
              )}

              {/* Envío y Ubicación */}
              <div className="space-y-3 py-2">
                {/* Envío: solo para productos (no clasificados). */}
                {product.listingType !== "classified" && (
                  <>
                    {/* Retiro en sucursal — GRATIS. Solo si el vendedor lo
                        habilitó. Los productos viejos sin `delivery` no lo tienen. */}
                    {product.shipping?.delivery?.pickup === true && (
                      <PickupOption product={product} compact />
                    )}

                    {/* Envío a domicilio (Zipnova). Se oculta si el vendedor lo
                        desactivó explícitamente (homeDelivery === false). */}
                    {product.shipping?.delivery?.homeDelivery !== false && (
                      <>
                        {product.shipping?.free ? (
                          // Envío gratis: hoy es solo un label del vendedor.
                          <div className="flex gap-2.5">
                            <Truck className="w-4 h-4 shrink-0 mt-1 text-green-500" />
                            <div>
                              <p className="text-green-500 text-sm font-medium">
                                Envío gratis a todo el país
                              </p>
                              <p className="text-gray-500 text-xs">
                                A través de Mercado Nero Envíos
                              </p>
                            </div>
                          </div>
                        ) : (
                          // Envío a cargo del comprador: cotizamos con Zipnova.
                          <ShippingQuoteBox product={product} />
                        )}
                      </>
                    )}
                  </>
                )}

                {/* La ubicación siempre es relevante, pero en clasificados es CRUCIAL */}
                <div className="flex gap-2.5">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <p className="text-[13px] dark:text-gray-400">
                      Ubicado en{" "}
                      <span className="text-gray-700 dark:text-gray-200 font-medium">
                        {product.location?.city || "Ubicación no especificada"}
                        {product.location?.province
                          ? `, ${product.location.province}`
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
                  {/* flex-wrap + max-w-full: en anchos intermedios (768–980px) el
                      span del stock aproximado ya no desborda el contenedor; baja
                      a una segunda línea. whitespace-nowrap evita que los textos
                      se partan feo dentro de su propia línea. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 max-w-full px-2 py-1 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded text-sm">
                    <select
                      className="bg-transparent font-bold text-gray-800 dark:text-gray-200 outline-none cursor-pointer min-w-0"
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
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        ({formatStock(product.stock)} disponibles)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Botones de Acción Principales */}
              <div className="space-y-2 pt-2">
                {product.listingType === "product" &&
                product.category !== "autos-motos-y-otros" ? (
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

              {/* ── PROGRAMA DE REFERIDOS ──
                  Va DEBAJO de los botones de compra (no arriba del precio, que
                  rompía la jerarquía visual). Caja doble: botón "Compartir y
                  ganar" (para quien comparte) y, si el visitante llegó por un
                  enlace ?ref=, una banda con su reintegro como incentivo. */}
              <div className="pt-2">
                <ReferralShareBox product={product} />
              </div>

              {/* SOCIAL SELLING: CTA compacto → hace scroll a la sección de
                  compra en grupo (columna izquierda). Solo productos. */}
              {product.listingType === "product" &&
                product.category !== "autos-motos-y-otros" && (
                  <SocialSellingBanner
                    product={product}
                    activePoolsCount={product.socialSelling?.activePoolsCount || 0}
                  />
                )}

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
                      con Mercado Nero. Recibí el producto que esperabas o se te devuelve tu dinero.
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

          {/* FILA 2: ancho completo (md:col-span-3). Opiniones y Preguntas
              aprovechan todo el ancho debajo de la zona de imágenes + compra.
              (La descripción va en la columna izquierda en desktop y acá en mobile.) */}
          <div className="order-3 md:col-span-3 border-t border-gray-100 dark:border-gray-800 p-4 md:p-6">
             {/* SOCIAL SELLING: Compra en Grupo (pools) — el gancho principal,
                arriba de todo en el bloque ancho para que se vea ni bien se
                accede. Solo productos con el feature habilitado por el vendedor. */}
            {/* {product.listingType === "product" &&
              product.category !== "autos-motos-y-otros" &&
              product.socialSelling?.enabled && (
                <div className="pb-8">
                  <SocialSellingSection
                    product={product}
                    currentUserId={currentUserId}
                  />
                </div>
              )}  */}

            {/* Descripción — SOLO en mobile/tablet. En desktop ya se muestra
                en la columna izquierda (debajo de las imágenes) para equilibrar
                la altura de las columnas. */}
            <div className="pb-8 md:hidden">
              <h2 className="text-xl mb-4 dark:text-white font-medium">
                Descripción
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-[16px] whitespace-pre-line leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* Opiniones del producto */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-8">
              <ProductReviews productId={product._id} />
            </div>

            {/* Preguntas y Respuestas */}
            <ProductQuestions
              productId={product._id}
              sellerId={product.seller?._id || product.seller}
            />
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

        {/* Compras grupales — productos con "Compra en Grupo" (social selling)
            habilitada por el vendedor. El backend expone la sección especial
            `social-selling` (productos de pago con tiers, sin filtrar por
            categoría). El botón "Explorar todo" lleva a /compras-grupales. */}
        <div className="mt-10">
          <ProductCarousel
            title="Comprá en grupo y ahorrá"
            category="social-selling"
            sectionId="group-buy"
            exploreTo="/compras-grupales"
          />
        </div>
      </div>
    </div>
  );
}
