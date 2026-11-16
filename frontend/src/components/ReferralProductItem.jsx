import { useEffect, useState } from "react";
import axios from "axios";
import { usePrivy } from "../Utils/authClient";
import { Share2, Check, Loader2, ImageDown, Sparkles } from "lucide-react";
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
 * Item del grilla de /referidos.
 *
 * REUTILIZA la ProductCard estándar (misma tarjeta que el resto del sitio) y
 * le agrega DEBAJO un panel de afiliado con:
 *   - cuánto gana por venta,
 *   - el botón "Compartir y ganar",
 *   - el botón "Descargar kit para redes" (imagen 1080x1080 con QR),
 *   - el reintegro que recibe el COMPRADOR (reciprocidad).
 *
 * Es deliberadamente el MISMO bloque que `ReferralShareBox` en la ficha del
 * producto: el afiliado ve la misma info y los mismos botones en los dos
 * lugares. Comparte también el enlace corto (/r/<code>) vía
 * `fetchReferralShortUrl` (única fuente de verdad para "compartir").
 *
 * @param {object} product  producto con referral.enabled y referral.percent > 0
 */
export default function ReferralProductItem({ product, sharePercent = 75 }) {
  const dbUser = useUserStore((s) => s.dbUser);
  const { login, authenticated, getAccessToken } = usePrivy();
  const myId = dbUser?._id;

  const [usdRate, setUsdRate] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Estado del botón "Descargar kit": generación de la imagen en el backend.
  const [loadingKit, setLoadingKit] = useState(false);

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

  // Reparto: el producto puede traer el share PÚBLICO del backend (fuente
  // preferida); el prop y el default 75 quedan como respaldo. Así el monto
  // mostrado coincide con lo que realmente se acredita.
  const productShare = Number(product?.referral?.referrerSharePercent);
  const effectiveShare = Number.isFinite(productShare)
    ? productShare
    : Number(sharePercent) || 75;

  const { referrerUsd, buyerUsd } = calcReferralSplit(
    price,
    percent,
    usdRate,
    effectiveShare,
  );

  // % de cada parte (fallback cuando todavía no hay cotización: mostramos el
  // porcentaje en vez de un "$0" que desalienta).
  const percentReferrer =
    Math.round(percent * (effectiveShare / 100) * 100) / 100;
  const percentBuyer = Math.round((percent - percentReferrer) * 100) / 100;

  const rewardLabel = usdRate ? formatUsdt(referrerUsd) : `${percentReferrer}%`;
  const buyerLabel = usdRate ? formatUsdt(buyerUsd) : `${percentBuyer}%`;

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

    // Pedimos el enlace CORTO al backend (mismo que la ficha del producto).
    // Ante fallo, el helper cae al enlace largo automáticamente.
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

  /**
   * Descarga el kit promocional 1080x1080 (GET /api/referral/kit/:productId).
   *
   * ⚠️ Se baja como `blob` y no con un `<a href>` directo: el endpoint exige
   * el header Authorization, y un <a> no puede mandar headers (el browser
   * mostraría la imagen en vez de descargarla).
   *
   * Misma lógica que `ReferralShareBox.handleDownloadKit` para que el afiliado
   * tenga la MISMA experiencia en los dos lugares.
   */
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
      showCopiedToast(mensaje);
    } finally {
      setLoadingKit(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* ProductCard estándar — misma tarjeta que en el resto del sitio. */}
      <ProductCard product={product} />

      {/* ── PANEL DE AFILIADO ──
          Mismo bloque que en la ficha del producto (ReferralShareBox):
          ganancia, compartir, descargar kit y reintegro del comprador. */}
      <div
        className="rounded-lg border p-3 flex flex-col gap-2.5"
        style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}0d` }}
      >
        {/* Ganancia por venta */}
        <div className="min-w-0">
          <p className="text-xs leading-tight text-gray-700 dark:text-gray-300">
            Compartí este producto y ganá{" "}
            <b style={{ color: ACCENT }}>{rewardLabel}</b> por venta
          </p>
          {/* <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
            Cada persona que compre con tu enlace te deja plata en tu wallet.
            Sin límites.
          </p> */}
        </div>

        {/* Compartir */}
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
          {sharing ? "Generando…" : copied ? "¡Enlace copiado!" : "Compartir y ganar"}
        </button>

        {/* Descargar kit 1080x1080. Estilo secundario (borde) para que no
            compita con el CTA principal de compartir. */}
        <button
          type="button"
          onClick={handleDownloadKit}
          disabled={loadingKit}
          className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg border-2 bg-transparent text-xs font-bold transition-all hover:brightness-110 disabled:opacity-60"
          style={{ borderColor: `${ACCENT}66`, color: ACCENT }}
        >
          {loadingKit ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ImageDown size={15} />
          )}
          {loadingKit ? "Generando imagen…" : "Descargar kit para redes"}
        </button>

        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center -mt-1">
          Imagen 1080×1080 con tu QR listo para Instagram y X.
        </p>

        {/* Reciprocidad: el comprador también gana. Mostramos el monto REAL
            (25% del reward, la parte del comprador) para que el afiliado sepa
            qué ofrecer al compartir. */}
        <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5 leading-snug">
          <Sparkles
            size={11}
            className="shrink-0 mt-0.5"
            style={{ color: ACCENT }}
          />
          <span>
            El comprador recibe{" "}
            <b className="text-gray-700 dark:text-gray-200">{buyerLabel}</b>{" "}
            adicional de reintegro.
          </span>
        </p>
      </div>
    </div>
  );
}
