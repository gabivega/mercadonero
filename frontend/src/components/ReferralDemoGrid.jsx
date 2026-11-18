import { useMemo } from "react";
import { usePrivy } from "../Utils/authClient";
import { Share2 } from "lucide-react";
import ProductCard from "./ProductCard";
import { calcReferralSplit, formatUsdt } from "../Utils/referralUtils";
import { showCopiedToast } from "../Utils/copiedToast";

const ACCENT = "#F26722";

// ─────────────────────────────────────────────────────────────────────────────
// Imágenes de las cards de ejemplo.
// Viven en `frontend/public/assets/img/` → se sirven tal cual desde la raíz
// (Vite NO las procesa). Por eso se referencian con ruta ABSOLUTA desde "/",
// no con `import ... from "../assets/..."` (eso sólo funciona con `src/`).
// Para agregar una imagen nueva: copiarla a `public/assets/img/` y poner acá
// su nombre de archivo.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_IMG = "/assets/img";
const NO_IMAGE = `${DEMO_IMG}/no-image.png`;

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTOS DE EJEMPLO (hardcodeados a propósito).
// Son los mismos datos que ve un referidor aprobado, pero acá son ficticios:
// sirven para mostrarle al visitante (sin login) cómo se ve la grilla y cuánto
// ganaría. NO tienen `_id` real, por eso ProductCard no los puede abrir ni
// agregar al carrito (ver `handleClick` más abajo).
//
// `referralPercent` es el % TOTAL que ofrece el vendedor; el reparto 75/25 se
// aplica con `calcReferralSplit` para que los montos del ejemplo sean EXACTOS.
//
// `image`: nombre del archivo dentro de `public/assets/img/`. Si se deja vacío
// la card cae a `no-image.png`. Recomendado: ~400x400 px, fondo blanco, webp.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_PRODUCTS = [
  {
    name: "Auriculares Bluetooth Pro con cancelación de ruido",
    sellerName: "TechStore",
    price: 120000,
    referralPercent: 12,
    freeShipping: true,
    rating: 4.8,
    sold: 132,
    image: "headphones.webp",
  },
  {
    name: "Smartwatch deportivo con GPS y monitor cardíaco",
    sellerName: "GadgetHub",
    price: 185000,
    referralPercent: 10,
    freeShipping: true,
    rating: 4.6,
    sold: 78,
    image: "smartwatch.webp", // ← copiá el archivo a public/assets/img/
  },
  {
    name: "Celular Samsung a17 128gb",
    sellerName: "Techstore",
    price: 375000,
    referralPercent: 10,
    freeShipping: true,
    rating: 4.9,
    sold: 120,
    image: "samsunga17.webp", // ← copiá el archivo a public/assets/img/
  },
  {
    name: "Monitor ViewSonic VA270A-H 27'' Plano",
    sellerName: "PC Insumos",
    price: 220000,
    referralPercent: 15,
    freeShipping: false,
    rating: 4.7,
    sold: 214,
    image: "monitor.webp"
  },
  {
    name: "Parlante portátil resistente al agua 20W",
    sellerName: "AudioVibe",
    price: 95000,
    referralPercent: 15,
    freeShipping: false,
    rating: 4.7,
    sold: 214,
    image: "speaker.webp",
  },
  {
    name: "Teclado mecánico RGB inalámbrico 75%",
    sellerName: "TechStore",
    price: 65000,
    referralPercent: 20,
    freeShipping: true,
    rating: 4.9,
    sold: 56,
    image: "keyboard.webp",
  },
  {
    name: "Cámara de seguridad WiFi 2K con visión nocturna",
    sellerName: "SafeHome",
    price: 78000,
    referralPercent: 14,
    freeShipping: false,
    rating: 4.5,
    sold: 91,
    image: "camera.webp",
  },
];

/**
 * Grilla de cards de EJEMPLO para visitantes sin sesión en /referidos.
 *
 * Reutiliza la `ProductCard` del sitio (idéntica a la que ve el referidor
 * aprobado) y le agrega DEBAJO la misma franja de ganancia con el split
 * desglosado: "X para ti" (referidor) + "Y para el comprador".
 *
 * @param {number} usdRate            cotización ARS por 1 USDT
 * @param {number} sharePercent       % del reparto que se lleva el REFERIDOR (default 75)
 * @param {function} [onShare]        qué hacer al tocar "Compartir y ganar"
 *                                    (en visitante: abrir el registro)
 */
export default function ReferralDemoGrid({ usdRate, sharePercent = 75, onShare }) {
  const { login } = usePrivy();

  // Precalculamos el reparto de cada ejemplo una sola vez por render de datos.
  const items = useMemo(
    () =>
      DEMO_PRODUCTS.map((p) => {
        const split = calcReferralSplit(
          p.price,
          p.referralPercent,
          usdRate,
          sharePercent,
        );
        return { ...p, split };
      }),
    [usdRate, sharePercent],
  );

  // Al no tener `_id`, ProductCard navegaría a "/" y el carrito no haría nada
  // útil. Lo interceptamos en captura para que el click NUNCA lleve a un
  // producto inexistente: abrimos el registro (igual que "Compartir y ganar").
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onShare === "function") onShare();
    else login();
  };

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCopiedToast(
      "Iniciá sesión para generar tu enlace y cobrar por cada venta",
    );
    if (typeof onShare === "function") onShare();
    else login();
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,170px)] gap-4 justify-center">
      {items.map((item, idx) => {
        // Shape mínimo que espera ProductCard (evita destructuring undefined).
        const productForCard = {
          name: item.name,
          price: item.price,
          currency: "ARS",
          listingType: "product",
          // Si el producto demo tiene `image`, se arma la ruta absoluta dentro
          // de public/; si no, cae al placeholder no-image.png.
          images: [{ url: item.image ? `${DEMO_IMG}/${item.image}` : NO_IMAGE }],
          sellerName: item.sellerName,
          sellerIsVerified: true,
          shipping: { free: item.freeShipping },
          condition: "new",
          rating: item.rating,
          sold: item.sold,
        };

        const { referrerUsd, buyerUsd } = item.split;
        const hasRate = referrerUsd > 0;

        return (
          <div key={`demo-${idx}`} className="w-[170px] flex flex-col gap-2">
            {/* Card estándar (misma que ve el referidor), con click interceptado. */}
            <div onClickCapture={handleClick} className="cursor-pointer">
              <ProductCard product={productForCard} />
            </div>

            {/* Franja de referidos: MISMA estructura que ReferralProductItem,
                pero con el split desglosado y badge "Ejemplo". */}
            <div
              className="relative rounded-lg border p-3 flex flex-col gap-2"
              style={{
                borderColor: `${ACCENT}40`,
                backgroundColor: `${ACCENT}0d`,
              }}
            >
              <span className="absolute -top-2 right-2 bg-zinc-800 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest font-bold">
                Ejemplo
              </span>

              <p className="text-xs leading-tight" style={{ color: ACCENT }}>
                <b>{hasRate ? formatUsdt(referrerUsd) : `${item.referralPercent}%`}</b>{" "}
                por venta
              </p>
              <p className="text-xs leading-tight" style={{ color: ACCENT }}>
                Porcentaje de recompensa: {item.referralPercent}% total (75/25)
              </p>

              {/* Desglose del reparto, para que se entienda "ganan los dos". */}
              <div className="flex flex-col gap-0.5 text-[10px] text-gray-600 dark:text-zinc-400 leading-tight">
                <span>
                  <b style={{ color: ACCENT }}>
                    {hasRate ? formatUsdt(referrerUsd) : `${item.referralPercent}%`}
                  </b>{" "}
                  para ti
                </span>
                <span>
                  <b className="text-gray-800 dark:text-zinc-200">
                    {hasRate
                      ? formatUsdt(buyerUsd)
                      : `${Math.round(item.referralPercent * (1 - sharePercent / 100) * 100) / 100}%`}
                  </b>{" "}
                  para el comprador
                </span>
              </div>

              <button
                type="button"
                onClick={handleShare}
                className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-white text-xs font-bold transition-all hover:brightness-110"
                style={{ backgroundColor: ACCENT }}
              >
                <Share2 size={15} /> Compartir y ganar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
