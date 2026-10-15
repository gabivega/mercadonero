/**
 * Utils/authWallets.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Compatibilidad con `useWallets()` / `useCreateWallet()` de Privy.
 *
 * En Privy, la wallet venía embebida en el user. Acá NO hay wallet embebida de
 * Supabase: la dirección (cuando exista) la tomamos de los metadatos del usuario
 * o del dbUser en Mongo. Mantenemos el shape `{ address, connected, walletClientType }`
 * para no romper a los consumidores de `wallets[0].address`.
 *
 * ⚠️ NOTA: la firma on-chain (escrow/colateral/pools) actualmente depende de la
 * wallet de Privy. Con Supabase la firma se resolverá con el proveedor de wallets
 * que definamos (p. ej. Crossmint). Mientras tanto:
 *   - `useWallets()` devuelve la dirección vinculada (read-only), si existe.
 *   - `useCreateWallet()` queda como no-op informativo (no crea wallets).
 */
import { useCallback } from "react";
import { usePrivy } from "./authClient";
import { useUserStore } from "../store/useUserStore";

/** Devuelve las wallets del usuario con la forma de Privy. */
export function useWallets() {
  const { user } = usePrivy();
  // Fuente de verdad de la wallet: Mongo (dbUser.walletAddress). Fallback al
  // user mapeado (que ya la incluye) por si el store aún no hidrató.
  const dbWalletAddress = useUserStore((s) => s.dbUser?.walletAddress || null);
  const address = user?.wallet?.address || dbWalletAddress || null;

  // Shape compatible con Privy: array de wallet objects.
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

/**
 * En Privy creaba una wallet embebida. Acá no aplica todavía (se resolverá con
 * el proveedor de wallets elegido). Se mantiene la firma para no romper imports.
 */
export function useCreateWallet() {
  const createWallet = useCallback(async () => {
    console.warn(
      "[authWallets] useCreateWallet: creación de wallet no soportada aún con Supabase.",
    );
    return null;
  }, []);
  return { createWallet };
}
