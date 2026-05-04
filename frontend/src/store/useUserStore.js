import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set) => ({
      dbUser: null, // Aquí guardaremos la respuesta de tu backend (Mongo)
      
      // Acción para guardar el usuario al loguearse/sincronizar
      setDbUser: (userData) => set({ dbUser: userData }),
      
      // Limpiar al hacer logout
      clearUser: () => set({ dbUser: null }),
    }),
    { name: 'user-storage',
      onRehydrateStorage: () => (state) => {
        console.log('🌀 Store hidratado');
      }
     }, // Se guarda en LocalStorage automáticamente
    
  )
);