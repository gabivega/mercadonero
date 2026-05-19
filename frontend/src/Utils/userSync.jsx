// hooks/useSyncUser.js
import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';

export const useSyncUser = (setDbUser) => {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncUser = async () => {
    if (ready && authenticated && user && !isSyncing) {
      setIsSyncing(true);
      try {
        const token = await getAccessToken();
        const { data } = await axios.post(
          `${import.meta.env.VITE_SERVER_URL}/api/auth/sync-user`,
          {
            email: user.email?.address,
            walletAddress: user.wallet?.address,
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