import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set) => ({
      dbUser: null,
      
      setDbUser: (userData, privyId) => {
        if (!privyId) return;
        set({ dbUser: userData, isAdmin: privyId === import.meta.env.VITE_ADMIN_PRIVY_ID });
      },

      // 💡 NUEVA ACCIÓN: Actualiza solo las direcciones dentro de dbUser
      setAddresses: (newAddresses) =>
        set((state) => ({
          dbUser: state.dbUser ? { ...state.dbUser, addresses: newAddresses } : null,
        })),

      clearUser: () => set({ dbUser: null, isAdmin: false }),
    }),
    { name: 'user-storage' }
  )
);