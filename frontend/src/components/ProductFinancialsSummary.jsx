import { useEffect, useState } from "react";
import { ChevronDown, Wallet, Lock, Receipt, Gift, TrendingUp } from "lucide-react";
import { getUsdRate } from "../Utils/cashbackUtils";
import { formatMoney } from "../Utils/currencyFormatter";

/**
 * ProductFinancialsSummary
 * ─────────────────────────────────────────────────────────────────────
 * Mini-resumen de "financieros" que el VENDEDOR ve antes de publicar.
 * Reutiliza EXACTAMENTE la mecánica del backend:
 *
 *   - El comprador paga en ARS por transferencia bancaria directa al seller.
 *   - Al crear la orden se CONGELA (lock) en el contrato el equivalente en
 *     USDT del total (precio × cantidad), según el TDC del momento.
 *   - Al completarse, del colateral congelado emergen:
 *       · comisión de plataforma (3%)
 *       · recompensa de referidos (si el producto la tiene activa)
 *     y el RESTO vuelve al saldo del vendedor (su neto).
 *
 * Es solo informativo/estimativo: el TDC real se toma al crear la orden.
 * Colapsado por defecto para no cargar visualmente el formulario.
 *
 * @param {object} product { price, sale, referral: { enabled, percent } }
 * @param {boolean} isClassified  Si es clasificado, no aplica (no usa escrow).
 */
const PLATFORM_FEE_PERCENT = 3; // comisión de Nero (alineada con el backend)

export default function ProductFinancialsSummary({ product, isClassified }) {
  const [open, setOpen] = useState(false);
  const [usdRate, setUsdRate] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cotización del dólar cripto (misma fuente cacheada que el cashback).
  // La traemos al montar el componente (no solo al abrir) para que el resumen
  // ya tenga el TDC si el vendedor lo despliega.
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

  // Los clasificados no usan colateral ni comisión → no mostramos el resumen.
  if (isClassified) return null;

  // Precio efectivo: si hay oferta activa, manda el de oferta.
  const saleActive =
    product?.sale?.active && Number(product?.sale?.price) > 0;
  const effectivePriceArs = Number(
    saleActive ? product.sale.price : product.price,
  ) || 0;

  // Datos derivados (solo válidos si hay precio y cotización).
  const hasPrice = effectivePriceArs > 0;
  const hasRate = Number(usdRate) > 0;

  const totalUsd = hasPrice && hasRate ? effectivePriceArs / usdRate : 0;
  const platformFeeUsd = totalUsd * (PLATFORM_FEE_PERCENT / 100);

  const referralEnabled =
    !isClassified && product?.referral?.enabled === true;
  const referralPercent = referralEnabled
    ? Number(product.referral.percent) || 0
    : 0;
  const rewardTotalUsd = totalUsd * (referralPercent / 100);

  const sellerNetUsd = Math.max(
    0,
    totalUsd - platformFeeUsd - rewardTotalUsd,
  );

  // Formato USD consistente (2 decimales).
  const usd = (n) => `US$ ${Number(n).toFixed(2)}`;
  // Equivalente en ARS según el TDC del momento (mismo rate del congelamiento).
  const ars = (usdAmount) =>
    hasRate ? `≈ $${formatMoney(Math.round(usdAmount * usdRate))}` : "";

  return (
    <div className="bg-white dark:bg-[#1A1A1A] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* Cabecera: clickeable para desplegar/colapsar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-[#202020] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <TrendingUp size={18} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-black dark:text-white uppercase tracking-wide">
              Resumen de tu liquidación
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cuánto recibís y qué se congela al venderse
            </p>
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          {!hasPrice && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Cargá un precio para ver el resumen de tu liquidación.
            </p>
          )}

          {hasPrice && (
            <>
              {/* Lo que recibe el vendedor (ARS por transferencia) */}
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-[#252525]">
                <Wallet size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Recibís del comprador
                  </p>
                  <p className="text-sm font-bold dark:text-white">
                    ${formatMoney(effectivePriceArs)} mediante transferencia
                    {saleActive && (
                      <span className="ml-2 text-[10px] font-black uppercase text-amber-500">
                        precio de oferta
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Congelamiento en USDT al crear la orden */}
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-[#252525]">
                <Lock size={18} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Si entra una orden
                  </p>
                  {loading ? (
                    <p className="text-sm font-bold dark:text-white">
                      Calculando cotización…
                    </p>
                  ) : hasRate ? (
                    <p className="text-sm font-bold dark:text-white">
                      Se bloquean {usd(totalUsd)} en garantía
                      <span className="block text-[11px] font-normal text-gray-400 mt-0.5">
                        TDC actual: ${formatMoney(usdRate)} por USDT
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      No pudimos obtener la cotización del dólar.
                    </p>
                  )}
                </div>
              </div>

              {/* Desglose de descuentos sobre el total congelado */}
              {hasRate && (
                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Comisión de plataforma */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Receipt size={16} className="text-gray-400" />
                      Comisión plataforma
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold dark:text-white">
                        {PLATFORM_FEE_PERCENT}%
                        <span className="text-gray-400 font-normal ml-2">
                          {usd(platformFeeUsd)}
                        </span>
                      </span>
                      {hasRate && (
                        <span className="block text-[11px] text-gray-400 font-normal">
                          {ars(platformFeeUsd)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Recompensa de referidos (solo si está activa) */}
                  {referralEnabled && referralPercent > 0 && (
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Gift size={16} className="text-emerald-500" />
                        Recompensa de referidos
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold dark:text-white">
                          {referralPercent}%
                          <span className="text-gray-400 font-normal ml-2">
                            {usd(rewardTotalUsd)}
                          </span>
                        </span>
                        {hasRate && (
                          <span className="block text-[11px] text-gray-400 font-normal">
                            {ars(rewardTotalUsd)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Neto final para el vendedor */}
                  <div className="flex items-center justify-between p-4 bg-emerald-500/5">
                    <div className="flex items-center gap-2 text-sm font-bold dark:text-white">
                      <Wallet size={16} className="text-emerald-500" />
                      Recibirás (neto)
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-emerald-500">
                        {usd(sellerNetUsd)}
                      </span>
                      {hasRate && (
                        <span className="block text-[11px] text-emerald-500/80 font-semibold">
                          {ars(sellerNetUsd)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Nota aclaratoria */}
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Estimativo según el TDC actual. La cotización real se toma al
                crear la orden. El total congelado incluye el envío (si lo ofreces gratis). La comisión y la recompensa se descuentan de tu
                garantía; el neto vuelve a tu saldo.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
