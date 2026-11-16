import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { getUsdRate } from "../Utils/cashbackUtils";
import { buyerReferralReward, formatUsdt } from "../Utils/referralUtils";
import { getReferral } from "../Utils/referralTracker";

/**
 * Línea de REINTEGRO EXTRA por referido, que va DEBAJO del CashbackBadge.
 *
 * Solo aparece cuando el comprador llegó por un enlace compartido (`?ref=`)
 * y el producto ofrece referido. Muestra cuánto le acreditan a ÉL al
 * concretarse la compra (su parte del reparto, no la del referidor).
 *
 * Props:
 *   - product: el producto (necesita `referral: { enabled, percent,
 *     referrerSharePercent? }` y `sale`).
 *
 * Se auto-oculta si: no hay `?ref=`, el producto no ofrece referido, o el
 * reparto deja 0% al comprador.
 */
export default function ReferralRewardBadge({ product }) {
  const [usdRate, setUsdRate] = useState(null);

  useEffect(() => {
    let active = true;
    getUsdRate()
      .then((rate) => active && setUsdRate(rate))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // El reintegro extra solo aplica si VINIMOS por un enlace de referido.
  // (Mismo criterio que ReferralShareBox: getReferral() con TTL de 30 días.)
  const cameFromReferral = Boolean(getReferral());

  const referralEnabled =
    product?.listingType === "product" &&
    product?.referral?.enabled &&
    product?.referral?.percent > 0;

  if (!cameFromReferral || !referralEnabled) return null;

  const price = product?.sale?.active ? product.sale.price : product.price;

  // Reparto vigente (lo expone el backend en el producto; fallback 75/25).
  const share = Number(product?.referral?.referrerSharePercent);
  const referrerSharePercent = Number.isFinite(share) ? share : 75;

  const { applies, buyerUsd, buyerPercent } = buyerReferralReward(
    price,
    product.referral.percent,
    usdRate,
    referrerSharePercent,
  );

  if (!applies) return null;

  // Mismo criterio que el cashback: si el monto es chico (< 0.5 USDT) o no hay
  // cotización todavía, mostramos el %. Así nunca aparece un "$0.00".
  const showAmount = usdRate && buyerUsd >= 0.5;
  const label = showAmount ? formatUsdt(buyerUsd) : `${buyerPercent}%`;

  return (
    <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 text-xs leading-none">
      <Gift size={14} strokeWidth={2.5} />
      <span>
        Ganás <strong>{label}</strong> extra por referido
      </span>
    </div>
  );
}
