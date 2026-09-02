// Utils/CashbackUtils.js
//
// Utilidades para calcular y mostrar el cashback (reintegro en USDT) que genera
// cada producto. Reproduce EXACTAMENTE la mecánica del backend:
//
//   totalUsd       = precioARS / usdRate
//   platformFeeUsd = totalUsd * 0.03      // comisión de la plataforma (3%)
//   cashbackUsd    = platformFeeUsd * 0.3 // feePercent default (30% de la comisión)
//
// Dónde usdRate es la cotización del dólar cripto (dolarapi.com).
// El resultado neto equivale al 0.9% del precio del producto en USD.
import axios from "axios";

// ── Configuración sincronizada con el backend ──
export const CASHBACK_FEE_PERCENT = 0.3;   // % de la comisión que se reintegra (feePercent default)
export const CASHBACK_PLATFORM_FEE = 0.03; // Comisión de la plataforma (3%)
export const CASHBACK_LOW_DISPLAY = 2.5;   // % que se muestra cuando el monto es chico (< umbral)
export const CASHBACK_MONTO_UMBRAL = 0.5;  // USDT: por debajo de este valor mostramos el %

// ── Caché en memoria de la cotización del dólar cripto ──
// Evita disparar un request por cada producto; se refetchea cada TTL.
// Además deduplica las llamadas concurrentes (varias tarjetas montándose a
// la vez en una grilla comparten la MISMA promesa y no saturan la API).
const CASHBACK_TTL_MS = 5 * 60 * 1000; // 5 minutos
let cachedUsdRate = null;
let cachedUsdAt = 0;
let inflightUsdRate = null;

// Devuelve la cotización del dólar cripto (ARS por 1 USDT).
// Reutiliza el resultado en memoria si es reciente.
export async function getUsdRate() {
  const now = Date.now();
  if (cachedUsdRate && now - cachedUsdAt < CASHBACK_TTL_MS) {
    return cachedUsdRate;
  }
  // Si ya hay un request en vuelo, devolvemos la misma promesa (deduplicación).
  if (inflightUsdRate) {
    return inflightUsdRate;
  }
  inflightUsdRate = (async () => {
    try {
    const { data } = await axios.get("https://dolarapi.com/v1/dolares/cripto");
    const rate = Number(data?.venta);
    if (rate > 0) {
      cachedUsdRate = rate;
        cachedUsdAt = Date.now();
    }
    return rate || cachedUsdRate || 0;
  } catch (error) {
    // Si falla, devolvemos lo que tengamos en caché (o 0).
    console.error("Error obteniendo cotización para cashback:", error);
    return cachedUsdRate || 0;
    } finally {
      inflightUsdRate = null;
  }
  })();
  return inflightUsdRate;
}

// Calcula el cashback en USDT para un valor en ARS (precio final de venta).
export function calcCashbackUsd(priceArs, usdRate) {
  const num = Number(priceArs) || 0;
  const rate = Number(usdRate) || 0;
  if (num <= 0 || rate <= 0) return 0;
  const totalUsd = num / rate;
  const platformFeeUsd = totalUsd * CASHBACK_PLATFORM_FEE;
  const cashback = platformFeeUsd * CASHBACK_FEE_PERCENT;
  // Redondeo igual que el backend.
  return Math.round(cashback * 100) / 100;
}

// Devuelve la cadena a mostrar según el monto:
//   - Si es menor al umbral (producto barato) → muestra el % fijo (ej: "2.5%").
//   - Si es mayor o igual → muestra el monto exacto (ej: "$3.50 USDT").
export function formatCashback(cashbackUsd) {
  const amount = Number(cashbackUsd) || 0;
  if (amount < CASHBACK_MONTO_UMBRAL) {
    return `${CASHBACK_LOW_DISPLAY}%`;
  }
  return `$${amount.toFixed(2)} USDT`;
}

