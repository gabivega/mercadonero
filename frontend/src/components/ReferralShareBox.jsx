import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Share2, Check, Sparkles, Zap } from "lucide-react";
import {
  getUsdRate,
  calcReferralSplit,
  formatUsdt,
  buildReferralUrl,
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
  const { authenticated, login } = usePrivy();
  const myId = dbUser?._id;

  const [usdRate, setUsdRate] = useState(null);
  const [copied, setCopied] = useState(false);
  // Referidor que nos trajo (si vinimos por un ?ref=). Mostramos al comprador
  // su beneficio SOLO si el producto tiene referidos activos.
  const [incomingRef, setIncomingRef] = useState(false);

  useEffect(() => {
    let active = true;
    getUsdRate()
      .then((rate) => active && setUsdRate(rate))
      .catch(() => {});
    setIncomingRef(Boolean(getReferral()));
    return () => {
      active = false;
    };
  }, []);

  // Solo productos de pago que ofrecen referido con % > 0.
  const referralEnabled =
    product?.listingType === "product" &&
    product?.referral?.enabled &&
    product?.referral?.percent > 0;

  if (!referralEnabled) return null;

  const price = product?.sale?.active ? product.sale.price : product.price;
  const { eachUsd } = calcReferralSplit(
    price,
    product.referral.percent,
    usdRate,
  );
  const percentEach = Math.round((product.referral.percent / 2) * 100) / 100;

  // Mostramos el monto si ya tenemos cotización; si no, el % (nunca un $0).
  const gananciaLabel = usdRate ? formatUsdt(eachUsd) : `${percentEach}%`;
  const compradorLabel = usdRate ? formatUsdt(eachUsd) : `${percentEach}%`;

  // Copia el enlace al portapapeles con varios fallbacks (clipboard API →
  // execCommand). Devuelve true sólo si realmente se copió.
  const copyToClipboard = async (text) => {
    // 1) API moderna. Puede rechazar si el documento pierde el foco o por
    //    permisos; lo tratamos como fallo y probamos el fallback.
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* seguimos al fallback */
      }
    }
    // 2) Fallback clásico con un textarea temporal (funciona aunque la
    //    Clipboard API no esté disponible, p. ej. contexto no seguro).
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      // Fuera de pantalla para no hacer scroll ni parpadear.
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
    // Sin sesión: abrimos el login de Privy (necesitamos el id para atribuir).
    if (!authenticated || !myId) {
      login();
      return;
    }

    const shareUrl = buildReferralUrl(product, myId);

    // 1) API nativa de compartir: sólo en móvil / donde esté soportada.
    //    En desktop esta API suele no existir, así que casi siempre caemos al
    //    copiado directo (evita el "primer click no hace nada").
    const canUseNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      // Heurística: dispositivos táctiles/móviles. Evita que en desktop se
      // abra el share del sistema y, si se cancela, no quede feedback.
      (navigator.maxTouchPoints > 0 ||
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    if (canUseNativeShare) {
      try {
        await navigator.share({
          title: product?.name || "Mirá este producto",
          text: "¡Mirá esto! Comprá con mi enlace y los dos ganamos 🤑",
          url: shareUrl,
        });
        return;
      } catch (err) {
        // Cancelación explícita del usuario: no copiamos ni mostramos toast.
        if (err?.name === "AbortError") return;
        // Otro error: seguimos al fallback de copiar.
      }
    }

    // 2) Fallback: copiar al portapapeles (con reintentos de API).
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showCopiedToast("Con tu enlace ganás en cada compra");
    }
  };

  return (
    <div className="space-y-3">
      {/* ── BANDA PARA EL COMPRADOR ──
          Si el visitante llegó por un enlace ?ref=, le mostramos el reintegro
          que tiene esperando. Anclaje de pérdida: "no lo pierdas". */}
      {incomingRef && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border border-emerald-500/40">
          <div className="p-2 bg-emerald-500 text-white rounded-lg shrink-0 mt-0.5">
            <Zap size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 leading-tight">
              ¡Tenés un reintegro esperando!
            </p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/90 mt-0.5">
              Concretá esta compra y te acreditamos{" "}
              <b className="text-emerald-600 dark:text-emerald-300">
                {compradorLabel}
              </b>{" "}
              en tu wallet. Vas a poder retirarlo cuando quieras.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
              <Sparkles size={11} /> {BUYER_BADGE}
            </span>
          </div>
        </div>
      )}

      {/* ── CAJA PARA COMPARTIR (REFERIDOR) ──
          Visible para cualquiera. Si no hay sesión, el botón abre el login
          (necesitamos el id para armar el ?ref=). Un único botón. */}
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
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#F26722] hover:brightness-110 text-white text-sm font-bold transition-all"
        >
          {copied ? <Check size={16} /> : <Share2 size={16} />}
          {copied ? "¡Enlace copiado!" : "Compartir y ganar"}
        </button>

        {/* Micro-incentivo de reciprocidad: refuerza que el otro también gana. */}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
          <Sparkles size={12} className="text-[#F26722]" />
          Tu contacto también recibe su reintegro. Los dos ganan: por eso compran.
        </p>
      </div>
    </div>
  );
}
