// utils/orderUtils.js
import axios from 'axios';

export const calculateOrderFinancials = async (totalArs, shippingArs = 0) => {
  try {
    // 1. Obtener cotización
    const { data } = await axios.get('https://dolarapi.com/v1/dolares/cripto');
    const usdRate = data.venta;

    // 2. Convertir totales
    const totalUsd = parseFloat((totalArs / usdRate).toFixed(2));
    const shippingUsd = parseFloat((shippingArs / usdRate).toFixed(2));

    // 3. Calcular Comisión Nero (3%)
    const platformFeeUsd = parseFloat((totalUsd * 0.03).toFixed(2));

    // 4. Calcular neto para el vendedor
    // Nota: El envío se le resta si Nero lo gestiona, o se le suma si él lo pagó. 
    // Asumimos que Nero gestiona y descuenta el costo.
    const sellerNetReleaseUsd = parseFloat((totalUsd - platformFeeUsd - shippingUsd).toFixed(2));

    return {
      usdRate,
      totalUsd,
      platformFeeUsd,
      shippingCostUsd: shippingUsd,
      sellerNetReleaseUsd
    };
  } catch (error) {
    console.error("Error calculando financieros:", error);
    throw new Error("No se pudo obtener la cotización del dólar");
  }
};