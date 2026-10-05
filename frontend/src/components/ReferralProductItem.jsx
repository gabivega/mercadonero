import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Share2, Check, Gift } from "lucide-react";
import ProductCard from "./ProductCard";
import {
  getUsdRate,
  calcReferralSplit,
  formatUsdt,
  buildReferralUrl,
} from "../Utils/referralUtils";
import { showCopiedToast } from "../Utils/copiedToast";
import { useUserStore } from "../store/useUserStore";

const ACCENT = "#F26722";

/**
 * Item del grilla de /referidos: REUTILIZA la ProductCard estándar y le agrega
 * DEBAJO una franja con la ganancia en USDT por compartir + botón compartir.
 *
 * Así no duplicamos la tarjeta de producto (una sola fuente de verdad para el
 * diseño de cards) y solo aportamos la capa específica de referidos.
 *
 * @param {object} product  producto con referral.enabled y referral.percent > 0
 */
export default function ReferralProductItem({ product }) {
  const dbUser = useUserStore((s) => s.dbUser);
  const { login } = usePrivy();
  const myId = dbUser?._id;

  const [usdRate, setUsdRate] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getUsdRate()
      .then((rate) => active && setUsdRate(rate))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const price = product?.sale?.active ? product.sale.price : product.price;
  const percent = Number(product?.referral?.percent) || 0;
  const { eachUsd } = calcReferralSplit(price, percent, usdRate);
  const percentEach = Math.round((percent / 2) * 100) / 100;

  // Monto si ya tenemos cotización; si no, el % (nunca un $0).
  const rewardLabel = usdRate ? formatUsdt(eachUsd) : `${percentEach}%`;

  const handleShare = async () => {
    // Sin sesión: abrimos el login de Privy (necesitamos el id para el ?ref=).
    if (!myId) {
      login();
      return;
    }
    const shareUrl = buildReferralUrl(product, myId);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: product?.name || "Mirá este producto",
          text: "¡Comprá con mi enlace y los dos ganamos 🤑",
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showCopiedToast("Con tu enlace ganás en cada compra");
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* ProductCard estándar — misma tarjeta que en el resto del sitio. */}
      <ProductCard product={product} />

      {/* Franja de referidos (específica de esta vista) */}
      <div
        className="rounded-lg border p-3 flex flex-col gap-2"
        style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}0d` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* <Gift size={16} style={{ color: ACCENT }} className="shrink-0" /> */}
          <p className="text-xs leading-tight" style={{ color: ACCENT }}>
            <b>{rewardLabel}</b> por venta
            {/* <span className="block text-[10px] text-gray-500 dark:text-zinc-400">
              Reintegro {percent}% repartido 50/50
            </span> */}
          </p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-white text-xs font-bold transition-all hover:brightness-110"
          style={{ backgroundColor: ACCENT }}
        >
          {copied ? <Check size={15} /> : <Share2 size={15} />}
          {copied ? "¡Enlace copiado!" : "Compartir y ganar"}
        </button>
      </div>
    </div>
  );
}
