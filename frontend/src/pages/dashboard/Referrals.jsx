import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Award,
  Share2,
  Coins,
  Lightbulb,
  Gift,
  Sparkles,
  Lock,
  PackageOpen,
  Search,
  X,
  ArrowDownWideNarrow,
  TrendingUp,
  DollarSign,
} from "lucide-react";

import { usePrivy } from "@privy-io/react-auth";
import { useUserStore } from "../../store/useUserStore";
import AuthOnboarding from "../../components/AuthOnboarding";
import ReferralProductItem from "../../components/ReferralProductItem";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  getUsdRate,
  calcReferralSplit,
  formatUsdt,
} from "../../Utils/referralUtils";

const ACCENT = "#F26722";

// Datos del EJEMPLO simulado que mostramos a los visitantes (no logueados).
// Es una demo con un producto ficticio para explicar la mecánica sin back.
const DEMO_PRODUCT = {
  name: "Auriculares Bluetooth Pro",
  price: 120000, // ARS
  percent: 10, // % que ofrecería el vendedor
};

export default function Referrals() {
  const { authenticated } = usePrivy();
  const dbUser = useUserStore((s) => s.dbUser);

  // Modal de registro/onboarding (mismo que usa el resto del sitio).
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Cotización USDT para el ejemplo simulado.
  const [usdRate, setUsdRate] = useState(null);

  // Productos habilitados para referir (solo para usuarios logueados).
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    let active = true;
    getUsdRate()
      .then((rate) => active && setUsdRate(rate))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Cargamos los productos con referido habilitado SOLO si hay sesión.
  useEffect(() => {
    if (!(authenticated && dbUser)) return;
    let active = true;
    setLoadingProducts(true);
        // Endpoint correcto: /api/product/products (el carrusel y las categorías
    // usan el mismo). NUNCA /api/product?category=... porque ese path cae en
    // getProductById (:id) y devuelve 404.
    axios
      .get(`${import.meta.env.VITE_SERVER_URL}/api/product/products`, {
        params: { category: "referral" },
      })
      .then(({ data }) => {
        if (active) setProducts(data?.products || []);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => {
      active = false;
    };
  }, [authenticated, dbUser]);

  // Reparto del ejemplo simulado (USDT que gana cada parte).
  const { eachUsd: demoEachUsd } = calcReferralSplit(
    DEMO_PRODUCT.price,
    DEMO_PRODUCT.percent,
    usdRate,
  );
  const demoPercentEach = Math.round((DEMO_PRODUCT.percent / 2) * 100) / 100;
  const demoRewardLabel = usdRate
    ? formatUsdt(demoEachUsd)
    : `${demoPercentEach}%`;

      const isLoggedIn = authenticated && dbUser;

  // ── FILTROS Y ORDEN (client-side) ──
  // Los productos de referidos suelen ser pocos, así que filtramos en el
  // front: respuesta instantánea y sin roundtrips.
  const [query, setQuery] = useState("");
  // Orden por defecto: mayor recompensa (lo que más le interesa a quien refiere).
  const [sortBy, setSortBy] = useState("reward"); // reward | price_asc | price_desc

  // Precio final efectivo (oferta si está activa) y recompensa en USDT por venta.
  const getPrice = (p) => Number(p?.sale?.active ? p.sale.price : p.price) || 0;
  const getRewardUsd = (p) => {
    const { eachUsd } = calcReferralSplit(
      getPrice(p),
      Number(p?.referral?.percent) || 0,
      usdRate,
    );
    return eachUsd;
  };

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1) Filtro por texto: nombre, marca y categoría (con guiones → espacios).
    let list = products;
    if (q) {
      list = products.filter((p) => {
        const haystack = [
          p?.name,
          p?.brand,
          p?.category?.replace(/-/g, " "),
          p?.subCategory?.replace(/-/g, " "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // 2) Orden. Hacemos una copia para no mutar el array original del render.
    const sorted = [...list];
    if (sortBy === "reward") {
      // Mayor recompensa primero. Si aún no hay cotización, cae al % ofrecido.
      sorted.sort((a, b) => {
        const ra = usdRate ? getRewardUsd(a) : Number(a?.referral?.percent) || 0;
        const rb = usdRate ? getRewardUsd(b) : Number(b?.referral?.percent) || 0;
        return rb - ra;
      });
    } else if (sortBy === "price_asc") {
      sorted.sort((a, b) => getPrice(a) - getPrice(b));
    } else if (sortBy === "price_desc") {
      sorted.sort((a, b) => getPrice(b) - getPrice(a));
    }
    return sorted;
  }, [products, query, sortBy, usdRate]);

  const isFiltering = query.trim().length > 0;

  return (
    <div className="w-full bg-white dark:bg-zinc-950 rounded-2xl border border-gray-100 dark:border-zinc-800/60 overflow-hidden shadow-sm">
      {/* ── HEADER (sin imagen de fondo, banda con color de marca) ── */}
      <div className="relative w-full bg-gradient-to-br from-[#F26722] to-orange-600 px-6 md:px-10 py-8 md:py-12">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider mb-3">
          <Coins size={13} /> Reintegros por compartir
        </span>
        <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white">
          Programa de Referidos
        </h2>
        <p className="text-xs md:text-sm text-white/90 mt-2 max-w-xl">
          Compartí productos habilitados y ganá una recompensa en tu wallet por
          cada venta que se concrete con tu enlace. Tu contacto también recibe su
          reintegro: ganan los dos.
        </p>
      </div>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="p-6 md:p-10 space-y-10">
        {/* ⚙️ MECÁNICA (se mantiene tal cual estaba) */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-[#F26722]" /> Mecánica del Sistema de
            Reintegros
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Paso 1 */}
            <div className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-3">
              <div className="flex flex-row gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-[#F26722] flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h4 className="font-bold text-gray-800 dark:text-zinc-100 text-sm md:text-base">
                Buscá productos con recompensa por referir
              </h4>
              </div>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Cada vendedor decide qué % de recompensa ofrece por
                producto. Podes ver el monto en USDT en el detalle de cada uno.
              </p>
            </div>

            {/* Paso 2 */}
            <div className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-3">
              <div className="flex flex-row gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-[#F26722] flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h4 className="font-bold text-gray-800 dark:text-zinc-100 text-sm md:text-base">
                Compartís el enlace del producto
              </h4>
              </div>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Compartí el enlace del producto con tus contactos y ellos podrán
                adquirirlo con un reintegro extra.
              </p>
            </div>

            {/* Paso 3 */}
            <div className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-3">
              <div className="flex flex-row gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-[#F26722] flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h4 className="font-bold text-gray-800 dark:text-zinc-100 text-sm md:text-base">
                Recibí recompensa por cada venta concretada
              </h4>
              </div>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Al cerrarse la orden, vas a recibir en tu wallet el porcentaje
                ofrecido por el vendedor; el comprador recibe el mismo monto como
                reintegro.
              </p>
            </div>
          </div>
        </div>

        {/* ── EJEMPLO SIMULADO (para no logueados; refuerza la mecánica) ── */}
        {!isLoggedIn && (
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#F26722]" /> Así se ve en un
              producto
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
              Ejemplo ilustrativo. En la práctica ves esto mismo en cada producto
              habilitado para referir.
            </p>

                        <div className="relative rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 p-5">
              {/* Badge de ejemplo */}
              <div className="absolute -top-3 right-4 bg-zinc-800 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest font-bold">
                Ejemplo
              </div>

              <div className="flex items-center gap-4">
                {/* Ícono del producto ficticio */}
                <div className="w-16 h-16 rounded-xl bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 flex items-center justify-center shrink-0">
                  <Gift size={26} className="text-[#F26722]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 truncate">
                    {DEMO_PRODUCT.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    ${DEMO_PRODUCT.price.toLocaleString("es-AR")} · el vendedor
                    ofrece {DEMO_PRODUCT.percent}%
                  </p>
                </div>
              </div>

              {/* Bloque de compartir simulado */}
              <div
                className="mt-4 rounded-xl border p-4"
                style={{
                  borderColor: `${ACCENT}40`,
                  backgroundColor: `${ACCENT}0d`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Gift size={16} style={{ color: ACCENT }} />
                  <p className="text-sm text-gray-800 dark:text-zinc-100 font-black">
                    Ganás{" "}
                    <span style={{ color: ACCENT }}>{demoRewardLabel}</span> por
                    venta
                  </p>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1">
                  El comprador recibe el mismo monto como reintegro. El{" "}
                  {DEMO_PRODUCT.percent}% se reparte 50/50.
                </p>
                {/* Botón de demostración (no ejecuta nada) */}
                <button
                  type="button"
                  disabled
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#F26722] text-white text-sm font-bold opacity-80 cursor-not-allowed"
                >
                  <Share2 size={16} /> Compartir y ganar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── NO LOGUEADO: aviso + CTA de registro ── */}
        {!isLoggedIn && (
          <div className="p-6 md:p-8 rounded-2xl border border-[#F26722]/30 bg-orange-50/50 dark:bg-orange-950/10 text-center">
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/40 text-[#F26722] flex items-center justify-center mx-auto mb-4">
              <Lock size={22} />
            </div>
            <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
              Debés estar registrado para usar el sistema de referidos
            </h3>
            <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
              Creá tu cuenta y completá tus datos básicos en un minuto para ver
              los productos habilitados y empezar a compartir.
            </p>
            <button
              type="button"
              onClick={() => setOnboardingOpen(true)}
              className="mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#F26722] hover:brightness-110 text-white text-sm font-black uppercase tracking-wide transition-all"
            >
              Crear mi cuenta
            </button>
          </div>
        )}

        {/* ── LOGUEADO: productos habilitados para referir ── */}
        {isLoggedIn && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-[#F26722]" /> Productos para
                referir
              </h3>
              {!loadingProducts && products.length > 0 && (
                <span className="text-xs text-gray-400">
                  {products.length} disponible{products.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 mb-5">
              Compartí el enlace de cualquiera de estos productos y ganá en cada
              venta. Elegí uno y tocá “Compartir y ganar”.
            </p>

            {/* ── BARRA DE FILTROS Y ORDEN (todas las resoluciones) ── */}
            {!loadingProducts && products.length > 0 && (
              <div className="flex flex-col gap-3 mb-5">
                {/* Buscador */}
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre, marca o categoría..."
                    className="w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-[#F26722] dark:text-white"
                  />
                  {isFiltering && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"
                      aria-label="Limpiar búsqueda"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Botones de orden + contador */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 mr-1">
                    <ArrowDownWideNarrow size={14} /> Ordenar
                  </span>
                  {[
                    { key: "reward", label: "Mayor recompensa", Icon: TrendingUp },
                    { key: "price_asc", label: "Menor precio", Icon: DollarSign },
                    { key: "price_desc", label: "Mayor precio", Icon: DollarSign },
                  ].map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortBy(key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        sortBy === key
                          ? "bg-[#F26722] text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}

                  <span className="text-xs text-gray-400 ml-auto">
                    {visibleProducts.length} resultado
                    {visibleProducts.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}

            {loadingProducts ? (
              <div className="py-16 flex justify-center">
                <LoadingSpinner size="lg" text="Cargando productos..." />
              </div>
            ) : products.length === 0 ? (
              <div className="py-14 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800 text-center">
                <PackageOpen
                  size={32}
                  className="mx-auto text-gray-300 dark:text-zinc-600"
                />
                <p className="text-sm font-semibold text-gray-600 dark:text-zinc-300 mt-3">
                  Todavía no hay productos habilitados para referir
                </p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1 max-w-sm mx-auto">
                  Cuando un vendedor active el programa de referidos en sus
                  productos, van a aparecer acá.
                </p>
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="py-14 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800 text-center">
                <PackageOpen
                  size={32}
                  className="mx-auto text-gray-300 dark:text-zinc-600"
                />
                <p className="text-sm font-semibold text-gray-600 dark:text-zinc-300 mt-3">
                  Sin resultados para “{query}”
                </p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1 max-w-sm mx-auto">
                  Probá con otra palabra o limpiá la búsqueda.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#F26722] text-white hover:brightness-110 transition-all"
                >
                  <X size={14} /> Limpiar búsqueda
                </button>
              </div>
                        ) : (
                          // Grilla de columnas de ANCHO FIJO (1 por fila en mobile angosto,
                          // más en pantallas grandes). Usamos `auto-fill` con columnas de
                          // 170px (el ancho de la ProductCard) para que el navegador meta
                          // tantas como entren: si el ancho no da para dos, cae a UNA
                          // centrada (justify-center), sin estirar las cards.
                          <div className="grid grid-cols-[repeat(auto-fill,170px)] gap-4 justify-center">
                            {visibleProducts.map((product) => (
                              <div key={product._id} className="w-[170px]">
                                <ReferralProductItem product={product} />
                              </div>
                            ))}
                          </div>
                        )}
          </div>
        )}

        {/* 💡 FOOTER EXPLICATIVO PRE-SEED (se mantiene) */}
        <div className="p-4 bg-orange-50/40 dark:bg-orange-950/10 rounded-xl border border-orange-100/40 dark:border-orange-900/20 flex flex-col sm:flex-row items-center gap-3.5 text-center sm:text-left">
          <div className="p-2 bg-orange-100 dark:bg-orange-950/40 text-[#F26722] rounded-lg flex-shrink-0">
            <Lightbulb className="w-4 h-4" />
          </div>
          <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
            <strong>Nota para inversores:</strong> Este sistema de referidos
            on-chain aprovecha la inmutabilidad de la blockchain para garantizar
            transparencia absoluta. Está diseñado para automatizar el marketing
            de afiliación de manera orgánica, acelerando el volumen de
            transacciones (GMV) sin costos hundidos fijos para la startup.
          </p>
        </div>
      </div>

      {/* ── Modal de onboarding/registro ── */}
      {onboardingOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm overflow-y-auto">
          <AuthOnboarding
            onComplete={() => setOnboardingOpen(false)}
            onClose={() => setOnboardingOpen(false)}
          />
        </div>
      )}
    </div>
  );
}