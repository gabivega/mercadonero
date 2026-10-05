// utils/orderUtils.js
import axios from 'axios';

// Comisión base de la plataforma (alineada con el contrato: 300 bps = 3%).
export const PLATFORM_FEE_PERCENT = 3;

/**
 * Calcula los financieros de una orden y devuelve TODOS los montos que se
 * descuentan del colateral del vendedor en un solo saque on-chain:
 *
 *   platformFeeUsd (total) = baseFeeUsd + referralFeeUsd
 *     - baseFeeUsd     = totalUsd * 3%            (comisión fija de Nero)
 *     - referralFeeUsd = totalUsd * referralPercent% (reward de referidos)
 *
 * `sellerNetReleaseUsd` = totalUsd - platformFeeUsd (lo que recibe el vendedor).
 *
 * @param {number} totalArs        Subtotal de productos en ARS (sin envío).
 * @param {number} shippingArs     Costo de envío en ARS (0 si no aplica).
 * @param {number} referralPercent % del producto destinado a referidos (0 = sin).
 */
export const calculateOrderFinancials = async (
  totalArs,
  shippingArs = 0,
  referralPercent = 0,
) => {
  try {
    // 1. Obtener cotización
    const { data } = await axios.get('https://dolarapi.com/v1/dolares/cripto');
    const usdRate = data.venta;

    // 2. Convertir totales
    const totalUsd = parseFloat((totalArs / usdRate).toFixed(2));
    const shippingUsd = parseFloat((shippingArs / usdRate).toFixed(2));

    // 3. Comisión base de Nero (3%)
    const baseFeeUsd = parseFloat((totalUsd * (PLATFORM_FEE_PERCENT / 100)).toFixed(2));

    // 4. Reward de referidos (% del producto). 0 si no hay referido.
    const refPercent = Number(referralPercent) > 0 ? Number(referralPercent) : 0;
    const referralFeeUsd = parseFloat((totalUsd * (refPercent / 100)).toFixed(2));

    // 5. Comisión TOTAL que se descuenta del colateral (un solo saque on-chain).
    const platformFeeUsd = parseFloat((baseFeeUsd + referralFeeUsd).toFixed(2));

    // 6. Neto para el vendedor.
    // Nota: El envío se le resta si Nero lo gestiona, o se le suma si él lo pagó.
    // Asumimos que Nero gestiona y descuenta el costo.
    const sellerNetReleaseUsd = parseFloat((totalUsd - platformFeeUsd).toFixed(2));

    return {
      usdRate,
      totalUsd,
      platformFeeUsd,   // fee TOTAL (base + referidos) — esto se descuenta on-chain
      baseFeeUsd,       // desglose: comisión fija (3%)
      referralFeeUsd,   // desglose: reward de referidos
      referralPercent: refPercent,
      shippingCostUsd: shippingUsd,
      sellerNetReleaseUsd
    };
  } catch (error) {
    console.error("Error calculando financieros:", error);
    throw new Error("No se pudo obtener la cotización del dólar");
  }
};