import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Lista blanca de emails admin (bootstrap).
// Si el email del usuario está en VITE_ADMIN_EMAILS, se lo trata como admin
// aunque su documento en la BD todavía no tenga `role: "admin"`. Espeja la
// variable ADMIN_EMAILS del backend (que es la que finalmente autoriza las
// acciones sensibles). Comparación case-insensitive.
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_EMAILS = new Set(
  (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const emailIsAdmin = (userData) => {
  const email = (userData?.email || "").toLowerCase().trim();
  return !!email && ADMIN_EMAILS.has(email);
};

export const useUserStore = create(
  persist(
    (set) => ({
            dbUser: null,
      isAdmin: false,

      // El rol ahora viene del backend (User.role en Mongo), no de un id de Privy.
      // Además, si el email está en VITE_ADMIN_EMAILS lo consideramos admin
      // aunque la BD aún no tenga el rol (acceso bootstrap al panel).
      // `_legacyId` se mantiene por compatibilidad de firma (ya no se usa).
      setDbUser: (userData, _legacyId) => {
        set({
          dbUser: userData || null,
          isAdmin: userData?.role === "admin" || emailIsAdmin(userData),
        });
      },

      // 💡 NUEVA ACCIÓN: Actualiza solo las direcciones dentro de dbUser
      setAddresses: (newAddresses) =>
        set((state) => ({
          dbUser: state.dbUser ? { ...state.dbUser, addresses: newAddresses } : null,
        })),

      clearUser: () => set({ dbUser: null, isAdmin: false }),
    }),
    {
      name: 'user-storage',
      // Al rehidratar desde localStorage recomputamos `isAdmin` contra el
      // dbUser persistido, para que refleje VITE_ADMIN_EMAILS aunque el estado
      // guardado haya quedado desactualizado (p.ej. cambiaste la lista blanca
      // sin volver a loguearte). El backend igual valida cada acción sensible.
      onRehydrateStorage: () => (state) => {
        if (state?.dbUser) {
          state.isAdmin =
            state.dbUser?.role === "admin" || emailIsAdmin(state.dbUser);
        }
      },
    }
  )
);

