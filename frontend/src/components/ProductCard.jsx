import { useNavigate, Link } from "react-router-dom";
import { ShoppingCart, Heart, BadgeCheck, Users } from "lucide-react";
import { usePrivy } from "../Utils/authClient";
import { useCartStore } from "../store/useCartStore";
import { useFavoritesStore } from "../store/useFavoritesStore";
import { useFavorites } from "../Utils/useFavorites";
import { useUserStore } from "../store/useUserStore";
import noImage from "../assets/img/no-image.png";
import Swal from "sweetalert2";
import { productPath } from "../Utils/productUrl";

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { ready, authenticated } = usePrivy();
  const { toggleFavorite } = useFavorites();
  const favorites = useFavoritesStore((state) => state.favorites);
  const isFavorite = favorites.some(
    (f) => String(f._id) === String(product?._id),
  );
    const addToCart = useCartStore((state) => state.addToCart);
  const currentUserId = useUserStore((state) => state.dbUser?._id || null);
  // Anti-autocompra: un vendedor no puede agregar al carrito SUS propios
  // productos (el backend también lo bloquea al crear la orden).
  const isOwnProduct =
    Boolean(currentUserId) &&
    String(product.seller?._id || product.seller) === String(currentUserId);

        // Ya NO hace falta navegar por JS: el <Link> hace la navegación nativa
    // (y así el navegador puede interceptar Ctrl+Click / clic con rueda).
    // El onClick quedó vacío a propósito en vez de borrarlo para dejar claro
    // que la navegación se delegó al <Link> de abajo.

                const handleAddToCart = (e) => {
    e.stopPropagation();
    // La card entera es un <Link>: sin preventDefault, un Ctrl+Click sobre
    // este botón abriría el PRODUCTO en una pestaña nueva en vez de (o además
    // de) agregar al carrito.
    e.preventDefault();

    // Bloqueo duro: no permitir comprarse a sí mismo.
    if (isOwnProduct) {
      Swal.fire({
        toast: true,
        position: "bottom-end",
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
        icon: "info",
        title: "Es tu propia publicación",
        text: "No podés agregar al carrito tus propios productos.",
        background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
        color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#3f3f46",
        iconColor: "#F26722",
        customClass: {
          popup: "border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg font-sans mb-10",
          title: "text-sm font-bold text-gray-800 dark:text-zinc-100",
          htmlContainer: "text-xs text-gray-500 dark:text-zinc-400",
        },
      });
      return;
    }
    // Normalizamos el producto antes de guardarlo en el carrito:
    // - sellerId SIEMPRE plano (id) para agrupar órdenes por vendedor.
    // - seller conserva el objeto poblado (con shop.name/username) SI viene,
    //   para que el carrito pueda mostrar el nombre de la tienda.
    const sellerObj =
      product.seller && typeof product.seller === "object"
        ? product.seller
        : null;
    const normalizedProduct = {
      ...product,
      sellerId: product.seller?._id || product.seller,
      seller: sellerObj || product.seller?._id || product.seller,
    };
    addToCart(normalizedProduct);

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
      popup: 'border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg font-sans mb-10',
      title: 'text-sm font-bold text-gray-800 dark:text-zinc-100',
      htmlContainer: 'text-xs text-gray-500 dark:text-zinc-400'
    }
  });
  };

    const showFavToast = (title, text) => {
    const Toast = Swal.mixin({
      toast: true,
      position: 'bottom-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
    });

    Toast.fire({
      icon: 'success',
      title,
      text: text || product.title || product.name,
      background: document.documentElement.classList.contains('dark')
        ? '#18181b'
        : '#ffffff',
      color: document.documentElement.classList.contains('dark')
        ? '#f4f4f5'
        : '#3f3f46',
      iconColor: '#F26722',
      customClass: {
        popup:
          'border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg font-sans mb-10',
        title: 'text-sm font-bold text-gray-800 dark:text-zinc-100',
        htmlContainer: 'text-xs text-gray-500 dark:text-zinc-400',
      },
    });
  };

    const handleFavorite = async (e) => {
    e.stopPropagation();
    // Mismo motivo que en handleAddToCart: la card es un <Link>, así que hay
    // que cortar la acción nativa del <a> padre en Ctrl+Click.
    e.preventDefault();
    // Si no está logueado, lo mandamos a la página principal para iniciar sesión.
    if (!ready || !authenticated) {
      showFavToast("Iniciá sesión", "Inicia sesión para guardar tus favoritos.");
      navigate("/");
      return;
    }

    const { added } = await toggleFavorite(product);
    if (added === true) {
      showFavToast("¡Agregado a Favoritos!", product.title || product.name);
    } else if (added === false) {
      showFavToast("Eliminado de favoritos", product.title || product.name);
    }
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

  // Precio más económico disponible comprando en grupo (tier de más compradores).
  const ssTiers = product.socialSelling?.tiers || {};
  const ssBestPrice = ssTiers[5] ?? ssTiers[4] ?? ssTiers[3] ?? ssTiers[2] ?? null;
  // const isSocialSelling =
  //   product.listingType === "product" && !!product.socialSelling?.enabled;
  const isSocialSelling = false; // Desactivamos temporalmente la sección de Social Selling hasta que esté lista para producción.

    return (
    // La card es un <Link> REAL (no un <div> con onClick) para que el navegador
    // la trate como link nativo. Sin esto NO funcionan:
    //   · Ctrl/Cmd + Click (abrir en pestaña nueva)
    //   · clic con la rueda del mouse
    //   · clic derecho → "Abrir enlace en pestaña nueva"
    //   · pasar el mouse y ver la URL destino en la barra de estado
    // Abrir varios productos a la vez es un uso real de comprador.
    // ⚠️ Por ser <Link> (= <a>), NO puede contener otros <a> adentro. Los
    // controles internos son <button> (carrito/favorito) o <span> con navigate
    // (vendedor), que cortan la propagación para no disparar la navegación.
    <Link
      to={productPath(product)}
      className="poly-card poly-card--grid poly-card--xlarge bg-white dark:bg-zinc-800 rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col cursor-pointer no-underline"
            style={{ minWidth: "170px", height: "340px" }}
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

                {/* Badge de Compra en Grupo (Social Selling) */}
        {/* {product.listingType === "product" &&
          product.socialSelling?.enabled && (
            <div
              className="absolute bottom-2 right-2 flex items-center gap-1 text-white text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full shadow-sm"
              style={{ backgroundColor: "#228B22" }}
              title="Compra en grupo disponible"
            >
              <Users size={11} />
              Grupo
            </div>
          )} */}

        {/* Hover Actions */}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-end justify-center gap-2 pb-3 opacity-0 hover:opacity-100">
          {product.listingType !== "classified" && !isOwnProduct && (
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
            <Heart
              className="w-5 h-5"
              fill={isFavorite ? "#F26722" : "none"}
            />
          </button>
        </div>
      </div>

      {/* Product Content */}
      <div className="poly-card__content p-3 flex flex-col flex-grow">
        <div className="poly-component__title text-sm font-medium text-gray-900 dark:text-white line-clamp-2 h-[2.5rem] hover:text-[#F26722] transition-colors">
          {product.name}
        </div>
                <div className="flex items-center gap-2 mt-1">
          {(() => {
                        const sellerId = product.seller?._id || product.seller;
            const sellerName =
              product.seller?.shop?.name ||
              product.sellerName || // fallback para productos viejos sin populate
              product.seller?.username;
                        if (sellerName && sellerId) {
              return (
                // <span> y NO <a>: la card entera ya es un <Link> (<a>), y un
                // <a> dentro de otro <a> es HTML inválido (el navegador lo
                // rompe o duplica la navegación). Visualmente es igual, y el
                // stopPropagation evita que además navegue al producto.
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/user/${sellerId}`);
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400 capitalize line-clamp-1 hover:text-[#3483fa] hover:underline transition-colors cursor-pointer"
                >
                  {sellerName}
                </span>
              );
            }
            return sellerName ? (
              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize line-clamp-1">
                {sellerName}
              </span>
            ) : (
              <br />
            );
          })()}
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
          ) : isSocialSelling && ssBestPrice ? (
            <span className="text-xs text-[#228B22] dark:text-green-400 font-semibold block line-clamp-1">
              Hasta {formatPrice(ssBestPrice, product.currency)} en grupo
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

                {/* Envío / Condición / Cashback */}
        {product.listingType == "product" ? (
          <div className="flex items-center gap-2 h-5">
              {product.shipping?.free === true && (
            <div>
                <div className="text-xs text-green-600 dark:text-green-400 font-semibold">
                  Envío gratis
                </div>
            </div>
              )}
            {/* Condición compartiendo renglón con el envío (ahorra espacio) */}
            {product.condition && product.condition !== "Nuevo" && (
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 inline-block bg-gray-100 dark:bg-zinc-700 px-2 py-[2px] rounded">
                {product.condition === "new" && "Nuevo"}
                {product.condition === "used" && "Usado"}
                {product.condition === "refurbished" && "Reacondicionado"}
              </span>
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
                product.location &&
                `${product.location.city} - ${product.location.province}`}
            </span>
          </div>
        )}

                {/* Rating and Sold Info */}
        <div className="h-5 mt-[2px]">
          {product.rating > 0 && (
            <div className="text-[0.7rem] text-yellow-500">
              ⭐ {product.rating}{" "}
              {product.sold && `| +${product.sold} vendidos`}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

