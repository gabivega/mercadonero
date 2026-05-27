import { useNavigate } from "react-router-dom";
import { ShoppingCart, Heart, BadgeCheck } from "lucide-react";
import { useCartStore } from "../store/useCartStore";
import noImage from "../assets/img/no-image.png";
import Swal from "sweetalert2";

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const addToCart = useCartStore((state) => state.addToCart);
  const handleCardClick = () => {
    navigate(`/product/${product._id}`);
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    addToCart(product);
    const Toast = Swal.mixin({
    toast: true,
    position: 'bottom-end', // Se muestra arriba a la derecha (estilo notificación)
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

  const handleFavorite = (e) => {
    e.stopPropagation();
    // TODO: Implement favorite functionality
    console.log("Added to favorites:", product.name);
  };

  // funcion para especificaciones de producto
  const getSpec = (key) => {
    return product.specifications?.find((s) => s.key === key)?.value || "";
  };
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
  return (
    <div
      className="poly-card poly-card--grid poly-card--xlarge bg-white dark:bg-zinc-800 rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col cursor-pointer"
      style={{ minWidthwidth: "170px", height: "360px" }}
      onClick={handleCardClick}
    >
      {/* Product Image Container */}
      <div
        className="poly-card__portada relative bg-white dark:bg-zinc-700 overflow-hidden flex-shrink-0"
        style={{ minWidth: "170px", height: "160px" }}
      >
        <img
          src={product.images?.[0]?.url || noImage}
          alt={product.name}
          className="w-full h-full object-contain object-center hover:scale-110 transition-transform duration-300 bg-white"
          loading="lazy"
        />
        {product.discount && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
            {product.discount}
          </div>
        )}

        {/* Hover Actions */}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-end justify-center gap-2 pb-3 opacity-0 hover:opacity-100">
          {product.listingType !== "classified" && (
            <button
              onClick={handleAddToCart}
              className="bg-[#F26722] text-white p-2 rounded-full hover:bg-[#d9531e] transition-colors"
              aria-label="add-to-cart"
            >
              <ShoppingCart className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleFavorite}
            className="bg-white dark:bg-zinc-700 text-[#F26722] p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-600 transition-colors"
            aria-label="favorite"
          >
            <Heart className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Product Content */}
      <div className="poly-card__content p-3 flex flex-col flex-grow">
        <div className="poly-component__title text-sm font-medium text-gray-900 dark:text-white line-clamp-2 h-[2.5rem] hover:text-[#F26722] transition-colors">
          {product.name}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize line-clamp-1">
            {product.sellerName ? `${product.sellerName}` : <br />}
          </span>
          {product.sellerIsVerified && (
            <span>
              <BadgeCheck color="#3483FA" size={16} />
            </span>
          )}
        </div>

        {/* Price Section */}
        <div className="poly-component__price mt-2">
          {product.sale?.price > 0 ? (
            <span className="text-xs text-gray-500 dark:text-gray-400 line-through block">
              {formatPrice(product.price, product.currency)}
            </span>
          ) : (
            <span
              className="text-xs opacity-0 block select-none leading-none"
              aria-hidden="true"
            >
              $0
            </span>
          )}
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {formatPrice(
                product.sale?.price || product.price,
                product.currency,
              )}
            </div>
            {product.sale?.price > 0 && (
              <span className="text-xs font-bold text-green-600 dark:text-green-400">
                {Math.round(100 - (product.sale.price / product.price) * 100)}%
                OFF
              </span>
            )}
          </div>
        </div>

        {/* Spacer to push bottom content down */}
        {product.category !== "autos-motos-y-otros" && (
          <div className="flex-grow"></div>
        )}

        {/* Free Shipping Badge */}
        {product.listingType == "product" ? (
          <div className="h-5">
            {product.shipping.free === true && (
              <div className="text-xs text-green-600 dark:text-green-400 font-semibold">
                Envío gratis
              </div>
            )}
          </div>
        ) : (
          <div className="h-5">
            {product.category === "autos-motos-y-otros" && (
              <span>
                {getSpec("Año")} | {getSpec("Kilómetros")}
              </span>
            )}
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 inline-block py-[2px] rounded mb-4">
              {product.listingType === "classified" &&
                `${product.location.city} - ${product.location.province}`}
            </span>
          </div>
        )}

        {/* Rating and Sold Info */}

        <div className="h-5">
          {product.rating > 0 && (
            <div className="text-[0.7rem] text-yellow-500">
              ⭐ {product.rating}{" "}
              {product.sold && `| +${product.sold} vendidos`}
            </div>
          )}
        </div>

        {/* Condition Badge */}
        {product.listingType === "product" &&
          product.condition &&
          product.condition !== "Nuevo" && (
            <div className="h-5">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 inline-block bg-gray-100 dark:bg-zinc-700 px-2 py-[2px] rounded">
                {product.condition === "new" && "Nuevo"}
                {product.condition === "used" && "Usado"}
                {product.condition === "refurbished" && "Reacondicionado"}
              </span>
            </div>
          )}
      </div>
    </div>
  );
}
