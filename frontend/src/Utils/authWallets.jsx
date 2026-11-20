/**
 * Utils/authWallets.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Hook de lectura de la wallet del usuario autenticado.
 *
 * HISTORIA: este archivo era la capa de compatibilidad con `useWallets()` y
 * `useCreateWallet()` de Privy. Privy fue ELIMINADO del proyecto, así que:
 *   - `useCreateWallet()` se borró: era un no-op que nadie llamaba (la creación
 *     de wallet se hace con Crossmint, ver `Utils/crossmintWallet.js`).
 *   - `useWallets()` SE CONSERVA porque 5 componentes lo usan y solo leen
 *     `.address`. Cambiar sus imports no aportaría nada.
 *
 * ⚠️ Este hook NO firma nada: la firma on-chain va por Crossmint. Acá solo
 * exponemos la dirección ya vinculada al usuario.
 */
import { usePrivy } from "./authClient";
import { useUserStore } from "../store/useUserStore";
/**
 * Devuelve la wallet del usuario con la MISMA forma que tenía Privy
 * (`{ wallets: [{ address, connected, ... }], ready }`), para no tocar a los
 * consumidores que leen `wallets?.[0]?.address`.
 */
export function useWallets() {
  const { user } = usePrivy();
  // Fuente de verdad de la wallet: Mongo (dbUser.walletAddress). Fallback al
  // user mapeado (que ya la incluye) por si el store aún no hidrató.
  const dbWalletAddress = useUserStore((s) => s.dbUser?.walletAddress || null);
  const address = user?.wallet?.address || dbWalletAddress || null;

  const wallets = address
    ? [
        {
          address,
          connected: true,
          walletClientType: "embedded",
          // Compat: algunos componentes usan wallet.getEthereumProvider().
          getEthereumProvider: async () => null,
        },
      ]
    : [];

  return { wallets, ready: true };
}

