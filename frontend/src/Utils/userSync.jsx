// hooks/useSyncUser.js
import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';

export const useSyncUser = (setDbUser) => {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [isSyncing, setIsSyncing] = useState(false);

    /**
   * Resuelve la dirección de la billetera embebida/Vinculada del user.
   * Prioriza user.wallet.address; si no está (p. ej. justo tras `createWallet`,
   * cuando el objeto `user` aún no se actualizó), busca en linkedAccounts.
   */
  const resolveWalletAddress = () => {
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