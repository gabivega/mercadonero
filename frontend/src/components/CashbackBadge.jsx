import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import {
  getUsdRate,
  calcCashbackUsd,
  formatCashback,
} from "../Utils/cashbackUtils";

// Indicador visual de cashback (reintegro en USDT) para cada producto.
//
// Recibe el precio final en ARS (ya considerando oferta si la hay, y la
// cantidad si estás en el checkout/carrito). La cotización del dólar se
// obtiene una sola vez (con caché en memoria compartida) y se reutiliza en
// todos los productos, evitando un request por tarjeta.
export default function CashbackBadge({ priceArs }) {
  const [usdRate, setUsdRate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getUsdRate()
      .then((rate) => {
        if (active) setUsdRate(rate);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const num = Number(priceArs) || 0;

  // Sin precio o sin cotización → no mostramos nada.
  if (loading || !usdRate || num <= 0) {
    return null;
  }

  const cashbackUsd = calcCashbackUsd(num, usdRate);
  if (cashbackUsd <= 0) return null;

  return (
    <div className="flex items-center gap-1.5 font-medium text-emerald-500 dark:text-emerald-400 text-xs leading-none">
      <Zap size={14} strokeWidth={2.5} />
      <span>
        Ganás <strong>{formatCashback(cashbackUsd)}</strong> de reintegro
      </span>
    </div>
  );
}
