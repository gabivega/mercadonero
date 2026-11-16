import { useEffect, useState } from "react";
import axios from "axios";
import { usePrivy } from "../Utils/authClient";
import { Share2, Check, Sparkles, Zap, Loader2, ImageDown } from "lucide-react";
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
const SHARE_TITLE = "Compartí este producto y ganá";
const SHARE_SUBTITLE =
  "Cada persona que compre con tu enlace te deja plata en tu wallet. Sin límites.";
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
  // Estado del botón "Descargar kit": generación de la imagen 1080x1080.
  const [loadingKit, setLoadingKit] = useState(false);
  // % que se lleva el REFERIDOR (reparto configurable, default 75). Lo trae el
  // backend desde ReferralConfig.referrerSharePercent para que la previsualización
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
  // Reparto que viene PÚBLICO en el producto (lo expone el backend). Es la
  // fuente preferida; el valor traído del endpoint autenticado y el default 75
  // quedan solo como respaldo. Sin esto, el box mostraba el 100% del reward
  // como si fuera la ganancia del referidor (sobreestimando).
  const productShare = Number(product?.referral?.referrerSharePercent);
  const effectiveShare = Number.isFinite(productShare)
    ? productShare
    : referrerSharePercent;
  const { referrerUsd, buyerUsd } = calcReferralSplit(
    price,
    product.referral.percent,
    usdRate,
    effectiveShare,
  );
  // % que representa cada parte del reward total (para el fallback sin cotización).
  const totalPercent = Number(product.referral.percent) || 0;
  const referrerPercent = Math.round(totalPercent * (effectiveShare / 100) * 100) / 100;
  const buyerPercent = Math.round((totalPercent - referrerPercent) * 100) / 100;

  // Monto si ya tenemos cotización; si no, el % (nunca un $0).
  const gananciaLabel = usdRate ? formatUsdt(referrerUsd) : `${referrerPercent}%`;
  const compradorLabel = usdRate ? formatUsdt(buyerUsd) : `${buyerPercent}%`;

  // Copia el enlace al portapapeles con varios fallbacks (clipboard API â†’
  // execCommand). Devuelve true sólo si realmente se copió.
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

  // Pide el enlace corto (/r/<code>) al backend vía helper compartido.
  // única fuente de verdad para "compartir" (mismo enlace que la grilla de
  // /referidos). Ante fallo, cae al enlace largo automáticamente.
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

    // 1) API nativa de compartir (móvil). En desktop caemos a copiar.
    const canUseNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (navigator.maxTouchPoints > 0 ||
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    if (canUseNativeShare) {
      try {
        await navigator.share({
          title: product?.name || "Mirá este producto",
          text: "¡Mirá esto! Comprá con mi enlace y los dos ganamos ðŸ¤‘",
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
      showCopiedToast("Con tu enlace ganás en cada compra");
    }
  };

  // ── DESCARGA DEL KIT PROMOCIONAL ────────────────────────────────────────
  // Pide el JPG 1080x1080 al backend (GET /api/referral/kit/:productId) y
  // fuerza la descarga en el navegador.
  //
  // ¿Por qué con `blob` en vez de un simple <a href>? Porque el endpoint
  // requiere el header Authorization: un <a> no puede mandar headers, y el
  // browser mostraría la imagen en vez de bajarla. Bajamos el binario con
  // axios y lo entregamos como blob descargable.
  const handleDownloadKit = async () => {
    if (!authenticated || !myId || loadingKit) return;

    setLoadingKit(true);
    try {
      const token = await getAccessToken?.();
      if (!token) throw new Error("sin-sesion");

      const res = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/referral/kit/${product._id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );

      // El nombre viene en Content-Disposition; si no, lo armamos con el slug.
      const disposition = res.headers?.["content-disposition"] || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName =
        match?.[1] ||
        `mercadonero-${product?.slug || product?._id || "kit"}.jpg`;

      const blobUrl = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Liberamos el blob un instante después: si lo revocamos en el acto,
      // algunos navegadores cancelan la descarga.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch (err) {
      // 429 = rate limit del backend (6 kits/min). 403 = no es referidor.
      const status = err?.response?.status;
      const mensaje =
        status === 429
          ? "Generaste muchos kits seguidos. Esperá un minuto."
          : status === 403
            ? "Necesitás ser referidor aprobado."
            : err?.response?.data?.message ||
              "No pudimos generar la imagen. Probá de nuevo.";
      // Si el error vino como Blob (responseType blob), hay que leerlo aparte.
      // Lo resolvemos mostrando el mensaje genérico, que ya es claro.
      showCopiedToast(mensaje);
    } finally {
      setLoadingKit(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* â”€â”€ BANDA PARA EL COMPRADOR â”€â”€
          Si el visitante llegó por un enlace ?ref=, le mostramos el reintegro
          que tiene esperando. Se muestra a cualquiera (no requiere ser referidor). */}
      {incomingRef && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border border-emerald-500/40">
          <div className="p-2 bg-emerald-500 text-white rounded-lg shrink-0 mt-0.5">
            <Zap size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 leading-tight">
              ¡Tenés un reintegro extra esperando!
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
              {/* <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {SHARE_SUBTITLE}
              </p> */}
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
              ? "Generando enlace…"
              : copied
                ? "¡Enlace copiado!"
                : "Compartir y ganar"}
          </button>

          {/* Descarga del kit 1080x1080 listo para X/Twitter: la imagen ya
              trae el QR con el enlace de este afiliado, así que no hay que
              pegarlo a mano. Estilo secundario (borde) para que no compita
              con el CTA principal de compartir. */}
          <button
            type="button"
            onClick={handleDownloadKit}
            disabled={loadingKit}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-[#F26722]/40 hover:border-[#F26722] bg-transparent hover:bg-[#F26722]/10 text-[#F26722] dark:text-orange-400 text-sm font-bold transition-all disabled:opacity-60"
          >
            {loadingKit ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ImageDown size={16} />
            )}
            {loadingKit ? "Generando imagen…" : "Descargar kit para redes"}
          </button>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center -mt-1">
            Imagen 1080×1080 con tu QR listo para Instagram y X.
          </p>

          {/* Micro-incentivo de reciprocidad: refuerza que el otro también gana. */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-start gap-1.5 leading-snug">
            <Sparkles size={12} className="text-[#F26722] shrink-0" />
            <span>
              El comprador recibe{" "}
              <b className="text-gray-600 dark:text-gray-300">{compradorLabel}</b>{" "}
              adicional de reintegro.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
