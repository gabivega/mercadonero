import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set) => ({
      dbUser: null, // Aquí guardaremos la respuesta de tu backend (Mongo)
      
      // Acción para guardar el usuario al loguearse/sincronizar
      setDbUser: (userData, privyId) => {
        if (!privyId) return;
        set({ dbUser: userData, isAdmin: privyId === import.meta.env.VITE_ADMIN_PRIVY_ID });
      },
      
      // Limpiar al hacer logout
      clearUser: () => set({ dbUser: null, isAdmin: false }),
    }),
    { name: 'user-storage',
      onRehydrateStorage: () => (state) => {
        console.log('🌀 Store hidratado');
      }
     }, // Se guarda en LocalStorage automáticamente
    
  )
);