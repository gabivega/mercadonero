import { useState } from "react";

/**
 * TokenIcon
 * ──────────────────────────────────────────────────────────────────────────
 * Muestra el logo real de un token/red usando el CDN de íconos cripto
 * (jsDelivr sobre `spothq/cryptocurrency-icons`, SVGs estables por símbolo).
 *
 * Si el logo no existe o falla la carga (offline, bloqueo de CDN, símbolo de
 * testnet sin asset), cae automáticamente a un círculo con la inicial del
 * símbolo, con el color de marca. Así la UI nunca queda con una imagen rota.
 *
 * Los símbolos de TESTNET (USDXM, tBNB, USDC de prueba) no tienen logo propio:
 * reutilizamos el logo de su token "real" (USDC, BNB, POL) para mantener la
 * coherencia visual. Si querés íconos locales, colocá archivos en
 * /public/assets/tokens/<slug>.svg y pasá `src` explícito.
 */

// Símbolo (en minúsculas) → slug del archivo en el CDN de spothq.
const CDN_SLUG = {
  usdt: "usdt",
  usdc: "usdc",
  usdxm: "usdc", // token de colateral respaldado por USDC
  eth: "eth",
  pol: "matic", // polygon = matic en los íconos clásicos
  matic: "matic",
  bnb: "bnb",
  tbnb: "bnb", // BNB de testnet
  btc: "btc",
};

// Color de respaldo por token (para el círculo con inicial).
const FALLBACK_COLOR = {
  usdt: "#26A17B",
  usdc: "#2775CA",
  usdxm: "#2775CA",
  eth: "#627EEA",
  pol: "#8247E5",
  matic: "#8247E5",
  bnb: "#F3BA2F",
  tbnb: "#F3BA2F",
  btc: "#F7931A",
};

const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color";

export default function TokenIcon({
  symbol = "",
  size = 40,
  className = "",
  src,
}) {
  const key = String(symbol).toLowerCase();
  const slug = CDN_SLUG[key];
  const [failed, setFailed] = useState(!slug);

  const dimension = { width: size, height: size };

  // Fallback: círculo con la inicial del símbolo.
  if (failed || !slug) {
    return (
      <div
        className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${className}`}
        style={{
          ...dimension,
          backgroundColor: FALLBACK_COLOR[key] || "#64748b",
          fontSize: size * 0.42,
        }}
      >
        {(symbol || "?").charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src || `${CDN_BASE}/${slug}.svg`}
      alt={symbol}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded-full shrink-0 ${className}`}
      style={dimension}
    />
  );
}
