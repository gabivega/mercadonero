import { useEffect, useState } from "react";
import { usePrivy } from "../Utils/authClient";
import { Share2, Check, Loader2 } from "lucide-react";
import ProductCard from "./ProductCard";
import {
  getUsdRate,
  calcReferralSplit,
  formatUsdt,
  fetchReferralShortUrl,
} from "../Utils/referralUtils";
import { showCopiedToast } from "../Utils/copiedToast";
import { useUserStore } from "../store/useUserStore";

const ACCENT = "#F26722";

/**
 * Item del grilla de /referidos: REUTILIZA la ProductCard estándar y le agrega
 * DEBAJO una franja con la ganancia en USDT por compartir + botón compartir.
 *
 * Comparte el MISMO enlace corto (/r/<code>) que ProductDetail, vía
 * `fetchReferralShortUrl` (única fuente de verdad para "compartir").
 *
 * @param {object} product  producto con referral.enabled y referral.percent > 0
 */
export default function ReferralProductItem({ product }) {
  const dbUser = useUserStore((s) => s.dbUser);
  const { login, authenticated, getAccessToken } = usePrivy();
  const myId = dbUser?._id;

  const [usdRate, setUsdRate] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

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

  // Copia al portapapeles con fallbacks: Clipboard API → execCommand.
  // Devuelve true SOLO si realmente se copió. Esto evita el "primer click no
  // hace nada" cuando la Clipboard API rechaza por foco/permisos.
  const copyToClipboard = async (text) => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* seguimos al fallback */
      }
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleShare = async () => {
    // Sin sesión: abrimos el login (necesitamos el id para el ?ref=).
    if (!authenticated || !myId) {
      login();
      return;
    }

    // Pedimos el enlace CORTO al backend (mismo que ProductDetail). Ante fallo,
    // el helper cae al enlace largo automáticamente.
    setSharing(true);
    let shareUrl = "";
    try {
      shareUrl = await fetchReferralShortUrl(product, getAccessToken, myId);
    } finally {
      setSharing(false);
    }
    if (!shareUrl) return;

    // 1) Share nativo SOLO en móvil/táctil. En desktop muchos navegadores
    //    exponen navigator.share pero al cancelar no copian nada; lo evitamos
    //    para que el primer click siempre tenga resultado (copiar).
    const canUseNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (navigator.maxTouchPoints > 0 ||
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    if (canUseNativeShare) {
      try {
        await navigator.share({
          title: product?.name || "Mirá este producto",
          text: "¡Comprá con mi enlace y los dos ganamos 🤑",
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return; // canceló: no hacemos nada
        /* otro error: caemos al copiado */
      }
    }

    // 2) Fallback: copiar con fallbacks y feedback solo si se copió.
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showCopiedToast("Con tu enlace ganás en cada compra");
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
          <p className="text-xs leading-tight" style={{ color: ACCENT }}>
            <b>{rewardLabel}</b> por venta
          </p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-white text-xs font-bold transition-all hover:brightness-110 disabled:opacity-60"
          style={{ backgroundColor: ACCENT }}
        >
          {sharing ? (
            <Loader2 size={15} className="animate-spin" />
          ) : copied ? (
            <Check size={15} />
          ) : (
            <Share2 size={15} />
          )}
          {sharing
            ? "Generando…"
            : copied
              ? "¡Enlace copiado!"
              : "Compartir y ganar"}
        </button>
      </div>
    </div>
  );
}
