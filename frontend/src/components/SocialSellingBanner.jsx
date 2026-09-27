import { useEffect, useState } from "react";
import { Users, ChevronRight } from "lucide-react";
import { formatMoney } from "../Utils/currencyFormatter";
import { usePools } from "../Utils/usePools";

const ACCENT = "#228B22";

/**
 * SocialSellingBanner
 * CTA compacto para la columna de compra del ProductDetail.
 * Hace scroll hasta la sección de Compra en Grupo (#social-selling).
 *
 * @param {object}  product
 * @param {number}  [activePoolsCount]  (opcional; si no viene, lo calcula)
 */
export default function SocialSellingBanner({ product, activePoolsCount }) {
  const ss = product?.socialSelling;
  const { fetchPoolsByProduct } = usePools();
  const [count, setCount] = useState(activePoolsCount ?? 0);

  useEffect(() => {
    if (activePoolsCount != null || !product?._id || !ss?.enabled) return;
    let alive = true;
    fetchPoolsByProduct(product._id, { silent: true }).then((list) => {
      if (alive) setCount(list.length);
    });
    return () => {
      alive = false;
    };
  }, [product?._id, ss?.enabled, activePoolsCount, fetchPoolsByProduct]);

  if (!ss?.enabled) return null;

  const poolsCount = activePoolsCount ?? count;

  const tiers = ss.tiers || {};
  const bestPrice = tiers[5] ?? tiers[4] ?? tiers[3] ?? tiers[2] ?? null;
  const basePrice = Number(product?.price || 0);
  const saving =
    basePrice > 0 && bestPrice
      ? Math.round((1 - bestPrice / basePrice) * 100)
      : 0;

  const scrollToSection = () => {
    const el = document.getElementById("social-selling");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <button
      type="button"
      onClick={scrollToSection}
      className="w-full text-left rounded-2xl p-4 transition-all hover:brightness-105 shadow-lg"
      style={{
        // background: `linear-gradient(135deg, ${ACCENT} 0%, #ff8a4c 100%)`,
        background: ` ${ACCENT} `,
        boxShadow: `${ACCENT}55 0 10px 24px`,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="p-2.5 rounded-xl shrink-0 bg-white/25">
          <Users size={18} className="text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white leading-tight">
            Comprá en grupo y pagá menos
          </p>
          <p className="text-[11px] text-white/90 mt-0.5">
            {poolsCount > 0
              ? `${poolsCount} grupo${poolsCount > 1 ? "s" : ""} activo${poolsCount > 1 ? "s" : ""} · hasta `
              : "Hasta "}
            <span className="font-black text-white">
              {bestPrice ? formatMoney(bestPrice) : "—"}
            </span>
            {saving > 0 && (
              <span className="font-black text-yellow-200"> ({saving}% OFF)</span>
            )}
          </p>
        </div>
        <ChevronRight size={18} className="text-white shrink-0" />
      </div>
    </button>
  );
}
