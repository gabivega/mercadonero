import { useEffect, useState } from "react";
import axios from "axios";
import { usePrivy } from "../Utils/authClient";
import { Share2, Check, Sparkles, Zap, Loader2 } from "lucide-react";
import {
  getUsdRate,
  calcReferralSplit,
  formatUsdt,
  fetchReferralShortUrl,
} from "../Utils/referralUtils";
import { getReferral } from "../Utils/referralTracker";
import { showCopiedToast } from "../Utils/copiedToast";
import { useUserStore } from "../store/useUserStore";

// Copy de ventas: gancho directo + refuerzo de reciprocidad.
const SHARE_TITLE = "CompartÃ­ este producto y ganÃ¡";
const SHARE_SUBTITLE =
  "Cada persona que compre con tu enlace te deja plata en tu wallet. Sin lÃ­mites.";
const BUYER_BADGE = "Reintegro asegurado";

export default function ReferralShareBox({ product }) {
  const dbUser = useUserStore((s) => s.dbUser);
  const { authenticated, getAccessToken } = usePrivy();
  const myId = dbUser?._id;
  // Solo los referidores APROBADOS pueden ver la caja de compartir.
  const isApprovedReferrer = dbUser?.referralStatus === "approved";

    const [usdRate, setUsdRate] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  // % que se lleva el REFERIDOR (reparto configurable, default 75). Lo trae el
  // backend desde ReferralConfig.referrerSharePercent para que la previsualizaciÃ³n
  // coincida EXACTA con lo que se acredita al completar la orden.
  const [referrerSharePercent, setReferrerSharePercent] = useState(75);
  // Referidor que nos trajo (si vinimos por un ?ref=). Mostramos al comprador
  // su beneficio SOLO si el producto tiene referidos activos.
  const [incomingRef, setIncomingRef] = useState(false);

  useEffect(() => {
    let active = true;
    getUsdRate()
      .then((rate) => active && setUsdRate(rate))
      .catch(() => {});
    setIncomingRef(Boolean(getReferral()));

    // Traemos el reparto vigente (endpoint autenticado). Si falla, queda 75.
    (async () => {
      try {
        const token = await getAccessToken?.();
        if (!token) return;
        const { data } = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/referral`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const share = Number(data?.referral?.referrerSharePercent);
        if (active && Number.isFinite(share)) setReferrerSharePercent(share);
      } catch {
        /* usamos el default 75 */
      }
    })();

    return () => {
      active = false;
    };
  }, [getAccessToken]);

  // Solo productos de pago que ofrecen referido con % > 0.
  const referralEnabled =
    product?.listingType === "product" &&
    product?.referral?.enabled &&
    product?.referral?.percent > 0;

  if (!referralEnabled) return null;

  const price = product?.sale?.active ? product.sale.price : product.price;
    const { referrerUsd, buyerUsd } = calcReferralSplit(
    price,
    product.referral.percent,
    usdRate,
    referrerSharePercent,
  );
  // % que representa cada parte del reward total (para el fallback sin cotizaciÃ³n).
  const totalPercent = Number(product.referral.percent) || 0;
  const referrerPercent = Math.round(totalPercent * (referrerSharePercent / 100) * 100) / 100;
  const buyerPercent = Math.round((totalPercent - referrerPercent) * 100) / 100;

  // Monto si ya tenemos cotizaciÃ³n; si no, el % (nunca un $0).
  const gananciaLabel = usdRate ? formatUsdt(referrerUsd) : `${referrerPercent}%`;
  const compradorLabel = usdRate ? formatUsdt(buyerUsd) : `${buyerPercent}%`;

  // Copia el enlace al portapapeles con varios fallbacks (clipboard API â†’
  // execCommand). Devuelve true sÃ³lo si realmente se copiÃ³.
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

  // Pide el enlace corto (/r/<code>) al backend vÃ­a helper compartido.
  // Ãšnica fuente de verdad para "compartir" (mismo enlace que la grilla de
  // /referidos). Ante fallo, cae al enlace largo automÃ¡ticamente.
  const fetchShortLink = async () => {
    return fetchReferralShortUrl(product, getAccessToken, myId);
  };

  const handleShare = async () => {
    if (!authenticated || !myId) return;

    setLoadingLink(true);
    let shareUrl = "";
    try {
      shareUrl = await fetchShortLink();
    } finally {
      setLoadingLink(false);
    }
    if (!shareUrl) return;

    // 1) API nativa de compartir (mÃ³vil). En desktop caemos a copiar.
    const canUseNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (navigator.maxTouchPoints > 0 ||
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    if (canUseNativeShare) {
      try {
        await navigator.share({
          title: product?.name || "MirÃ¡ este producto",
          text: "Â¡MirÃ¡ esto! ComprÃ¡ con mi enlace y los dos ganamos ðŸ¤‘",
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
        /* otro error: seguimos al copiado */
      }
    }

    // 2) Fallback: copiar al portapapeles.
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showCopiedToast("Con tu enlace ganÃ¡s en cada compra");
    }
  };

  return (
    <div className="space-y-3">
      {/* â”€â”€ BANDA PARA EL COMPRADOR â”€â”€
          Si el visitante llegÃ³ por un enlace ?ref=, le mostramos el reintegro
          que tiene esperando. Se muestra a cualquiera (no requiere ser referidor). */}
      {incomingRef && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border border-emerald-500/40">
          <div className="p-2 bg-emerald-500 text-white rounded-lg shrink-0 mt-0.5">
            <Zap size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 leading-tight">
              Â¡TenÃ©s un reintegro extra esperando!
            </p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/90 mt-0.5">
              Por comprar con tu enlace de referidos, al concretar esta compra te acreditamos{" "}
              <b className="text-emerald-600 dark:text-emerald-300">
                {compradorLabel}
              </b>{" "}
              en tu wallet.
            </p>
            {/* <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
              <Sparkles size={11} /> {BUYER_BADGE}
            </span> */}
          </div>
        </div>
      )}

      {/* â”€â”€ CAJA PARA COMPARTIR (solo REFERIDORES APROBADOS) â”€â”€ */}
      {isApprovedReferrer && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                {SHARE_TITLE}{" "}
                <span className="text-[#F26722]">{gananciaLabel}</span> por venta
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {SHARE_SUBTITLE}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={loadingLink}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#F26722] hover:brightness-110 text-white text-sm font-bold transition-all disabled:opacity-60"
          >
            {loadingLink ? (
              <Loader2 size={16} className="animate-spin" />
            ) : copied ? (
              <Check size={16} />
            ) : (
              <Share2 size={16} />
            )}
            {loadingLink
              ? "Generando enlaceâ€¦"
              : copied
                ? "Â¡Enlace copiado!"
                : "Compartir y ganar"}
          </button>

          {/* Micro-incentivo de reciprocidad: refuerza que el otro tambiÃ©n gana. */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
            <Sparkles size={12} className="text-[#F26722]" />
            Tu contacto tambiÃ©n recibe su reintegro. Los dos ganan: por eso
            compran.
          </p>
        </div>
      )}
    </div>
  );
}
