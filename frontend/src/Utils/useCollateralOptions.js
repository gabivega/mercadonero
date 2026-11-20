import { useEffect, useState } from "react";
import axios from "axios";

// Hook para leer la config PÚBLICA de COLATERAL (redes donde un vendedor puede
// depositar su garantía).
//
// POR QUÉ EXISTE (importante):
//   Antes cada componente (CollateralManager.jsx, WalletPage.jsx y
//   DepositCollateral.jsx) tenía HARDCODEADAS las direcciones de contrato y de
//   token de cada red, con `import.meta.env.VITE_*` como "override" que ni
//   siquiera estaba definido en el .env. Resultado real medido: había VARIAS
//   direcciones distintas del mismo contrato dando vueltas, y el .env era
//   decorativo. Eso produce "depósitos fantasma" (la tx se envía contra un
//   contrato que no es el que el backend consulta).
//
//   Ahora el backend es la ÚNICA fuente de verdad
//   (`GET /api/config/collateral-options`). Este hook la trae.
//
// Forma de cada opción (la define `getCollateralOptions()` en backend/src/config/chains.js):
//   {
//     chainId, key,
//     chainName,              // nombre que usa el SDK de Crossmint ("base-sepolia")
//     label, shortLabel,
//     isTestnet, explorerUrl, nativeCurrency,
//     contractAddress,        // NeroCollateral de esa red
//     token: { symbol, address, decimals },
//     sendable,               // false → solo lectura (Crossmint no firma ahí)
//   }
export function useCollateralOptions() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/config/collateral-options`,
        );
        if (!mounted) return;
        // Defensa: solo redes realmente operables (contrato + token).
        const opts = (data?.options || []).filter(
          (o) => o?.contractAddress && o?.token?.address,
        );
        setOptions(opts);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        // ⚠️ Si esto falla NO caemos a direcciones hardcodeadas: preferimos
        // mostrar el error. Un fallback acá es exactamente el bug que estamos
        // corrigiendo (depositar en el contrato equivocado "sin que se note").
        console.error("Error cargando config de colateral:", err);
        setError(
          err?.response?.data?.message ||
            "No pudimos cargar la configuración de garantías. Reintentá en unos segundos.",
        );
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
