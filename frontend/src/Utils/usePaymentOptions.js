import { useEffect, useState } from "react";
import axios from "axios";

// Hook para leer la config PÚBLICA de medios de pago crypto.
// El backend (GET /api/config/payment-options) devuelve, por cada red con escrow
// desplegado: { chainId, key, fundingMode, contractAddress, tokenAddress,
// tokenSymbol, tokenDecimals, nativeSymbol, chain:{ name, shortName, ... } }.
//
// Lo usa el Checkout para: (1) ofrecerle al comprador en qué red/token pagar;
// (2) leer su saldo real en cada token; (3) mandar el chainId elegido al backend
// al crear la orden (la order queda atada a esa red para todo su ciclo de vida).
export function usePaymentOptions() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/config/payment-options`,
        );
        if (!mounted) return;
        // Sólo redes realmente utilizables (con contrato + token definido).
        const opts = (data?.options || []).filter(
          (o) => o?.contractAddress && o?.tokenAddress,
        );
        setOptions(opts);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error("Error cargando medios de pago crypto:", err);
        setError(err?.message || "No se pudieron cargar los medios de pago.");
        setOptions([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { options, loading, error };
}
