// hooks/useSyncUser.js
import { useState } from 'react';
import { useAuth } from './authClient';
import { useUserStore } from '../store/useUserStore';
import axios from 'axios';

export const useSyncUser = (setDbUser) => {
  const { ready, authenticated, user, getAccessToken } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);

  /**
   * ¿El `dbUser` del store pertenece a la sesión de Supabase ACTIVA?
   *
   * El store está persistido en localStorage y puede sobrevivir a un cambio de
   * sesión sin logout. Si no coincide, NO debemos usar su wallet: es la del
   * usuario anterior. Ver fix en authClient.jsx (misma regla).
   */
  const storeBelongsToSession = () => {
    const dbUser = useUserStore.getState().dbUser;
    if (!dbUser || !user?.id) return false;
    return !!dbUser.supabaseId && String(dbUser.supabaseId) === String(user.id);
  };

    /**
   * Resuelve la dirección de la billetera embebida/Vinculada del user.
   * Prioriza user.wallet.address; si no está (p. ej. justo tras `createWallet`,
   * cuando el objeto `user` aún no se actualizó), busca en linkedAccounts.
   *
   * ⚠️ Solo se considera si el store pertenece a la sesión activa: si no, lo
   * que `authClient` expuso como `user.wallet` es de OTRO usuario logueado
   * antes y su envío al backend provocaría que se vincule la wallet ajena.
   */
  const resolveWalletAddress = () => {
    if (!storeBelongsToSession()) return undefined;
    if (user?.wallet?.address) return user.wallet.address;
    const walletAccount = (user?.linkedAccounts || []).find(
      (acc) => acc.type === "wallet" && acc.address,
    );
    return walletAccount?.address || undefined;
  };

  const syncUser = async () => {
    if (ready && authenticated && user && !isSyncing) {
      setIsSyncing(true);
      try {
        const token = await getAccessToken();
        const { data } = await axios.post(
          `${import.meta.env.VITE_SERVER_URL}/api/auth/sync-user`,
          {
            email: user.email?.address,
            walletAddress: resolveWalletAddress(),
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (data) setDbUser(data, user.id);
      } catch (error) {
        console.error("❌ Error en la sincronización:", error);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  return { syncUser, isSyncing };
};
