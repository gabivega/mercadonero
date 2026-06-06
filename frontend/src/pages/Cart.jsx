import { useNavigate } from "react-router-dom";
import { useCartStore } from "../store/useCartStore";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  ArrowLeft,
  ShieldCheck,
  Store,
  ChevronRight,
} from "lucide-react";


export default function Cart() {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, clearCart } = useCartStore();
  // console.log(cart)

  const formatPrice = (val) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(val);

  // Agrupamos por ID de vendedor para procesar órdenes individuales
  const groupedBySeller = cart.reduce((acc, item) => {
    const sellerId = item.seller || "unknown";
    const sellerName = item.sellerName || "Vendedor de Mercado Nero";
    if (!acc[sellerId]) {
      acc[sellerId] = {
        name: sellerName,
        products: [],
      };
    }
    acc[sellerId].products.push(item);
    return acc;
  }, {});

  const handleContinueToCheckout = (sellerId) => {
    // console.log("sellerID: ", sellerId);
    // Navegamos al checkout de ese vendedor específico
    navigate(`/checkout/${sellerId}`);
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <ShoppingBag className="w-20 h-20 text-gray-200 dark:text-gray-800 mx-auto mb-6" />
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Tu carrito está vacío
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          ¿No sabés qué comprar? ¡Tenemos miles de productos para vos!
        </p>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-8 py-3 bg-[#3483fa] text-white rounded-md font-semibold hover:bg-[#2968c8]"
        >
          <ArrowLeft className="w-5 h-5" /> Descubrir productos
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f5f5] dark:bg-[#0a0a0a] min-h-screen pt-8 pb-16 transition-colors">
      <div className="max-w-[900px] mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Tu carrito
        </h1>

        <div className="space-y-6">
          {Object.entries(groupedBySeller).map(([sellerId, group]) => {
            const sellerTotal = group.products.reduce((acc, p) => {
              // Verificamos si tiene precio de oferta activo
              const currentPrice =
                p.sale && p.sale.price > 0 ? p.sale.price : p.price;

              return acc + currentPrice * p.quantity;
            }, 0);

            return (
              <div
                key={sellerId}
                className="bg-white dark:bg-[#121212] rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden"
              >
                {/* Cabecera del Vendedor */}
                <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-2 bg-zinc-50/50 dark:bg-zinc-800/30">
                  <Store className="w-4 h-4 text-gray-400" />
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Vendido por{" "}
                    <span className="text-[#3483fa]">{group.name}</span>
                  </p>
                </div>

                {/* Lista de Items */}
                <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {group.products.map((item) => (
                    <div key={item._id} className="p-5 flex flex-col sm:flex-row gap-4">
                      <div className="w-24 h-24 shrink-0 border border-gray-100 dark:border-zinc-800 rounded-md bg-white p-1 mx-auto">
                        <img
                          src={
                            item.images?.[0]?.url ||
                            item.image ||
                            "/placeholder.jpg"
                          }
                          alt={item.name}
                          className="w-full h-full object-contain mx-auto"
                        />
                      </div>

                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between">
                            <h3
                              className="text-[15px] font-medium text-gray-900 dark:text-gray-100 leading-tight hover:text-[#3483fa] cursor-pointer"
                              onClick={() => navigate(`/product/${item._id}`)}
                            >
                              {item.name}
                            </h3>
                            <button
                              onClick={() => removeFromCart(item._id)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-green-600 mt-1 font-medium">
                            Envío gratis
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-4">
                          {/* Selector Cantidad */}
                          <div className="flex items-center border border-gray-200 dark:border-zinc-700 rounded h-7">
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item._id,
                                  Math.max(1, item.quantity - 1),
                                )
                              }
                              disabled={item.quantity <= 1}
                              className="px-2 hover:bg-gray-100 dark:hover:bg-zinc-800 h-full border-r border-gray-200 dark:border-zinc-700"
                            >
                              <Minus className="w-3 h-3 text-[#3483fa]" />
                            </button>
                            <span className="px-3 text-xs font-semibold dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item._id,
                                  Math.min(item.stock, item.quantity + 1),
                                )
                              }
                              disabled={item.quantity >= item.stock}
                              className="px-2 hover:bg-gray-100 dark:hover:bg-zinc-800 h-full border-l border-gray-200 dark:border-zinc-700"
                            >
                              <Plus className="w-3 h-3 text-[#3483fa]" />
                            </button>
                          </div>
                          <div className="flex flex-col items-end">
                            {item.sale && item.sale.price > 0 ? (
                              <>
                                <div className="flex items-center gap-2">
                                  {/* Precio original tachado */}
                                  <span className="text-xs text-gray-400 line-through">
                                    $
                                    {(
                                      item.price * item.quantity
                                    ).toLocaleString()}
                                  </span>
                                  {/* Porcentaje de descuento (opcional, queda muy bien) */}
                                  <span className="text-xs text-green-500 font-medium">
                                    {Math.round(
                                      100 -
                                        (item.sale.price * 100) / item.price,
                                    )}
                                    % OFF
                                  </span>
                                </div>
                                {/* Precio con descuento resaltado */}
                                <p className="text-xl font-light dark:text-white">
                                  $
                                  {(
                                    item.sale.price * item.quantity
                                  ).toLocaleString()}
                                </p>
                              </>
                            ) : (
                              /* Precio normal si no hay oferta */
                              <p className="text-xl font-light dark:text-white">
                                $
                                {(
                                  item.price * item.quantity
                                ).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer del grupo: Confirmación por Vendedor */}
                <div className="px-5 py-5 bg-zinc-50 dark:bg-zinc-800/20 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-gray-500 uppercase tracking-tight">
                      Total con este vendedor
                    </p>
                    <p className="text-2xl font-semibold dark:text-white">
                      {formatPrice(sellerTotal)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleContinueToCheckout(sellerId)}
                    className="w-full sm:w-auto bg-[#3483fa] text-white px-8 py-3 rounded-md font-semibold hover:bg-[#2968c8] transition-all flex items-center justify-center gap-2"
                  >
                    Confirmar compra <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Informativo */}
        <div className="mt-8 flex items-center justify-center gap-6 text-gray-500 border-t border-gray-200 dark:border-zinc-800 pt-8">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span>Compra Protegida por Nero</span>
          </div>
          <div
            className="text-xs cursor-pointer hover:text-[#3483fa]"
            onClick={() => navigate("/")}
          >
            Continuar comprando
          </div>
        </div>
      </div>
    </div>
  );
}
