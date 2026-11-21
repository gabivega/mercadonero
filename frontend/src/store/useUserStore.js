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

// ─────────────────────────────────────────────────────────────────────────────
// ACCESO AL CATÁLOGO DE PROVEEDORES (Elit, etc.) sin ser admin total.
// Espeja ELIT_ALLOWED_EMAILS del backend: una cuenta puntual (p.ej. la tienda
// de hardware) puede usar el panel de proveedores sin heredar los permisos de
// administrador (aprobar tiendas, liberar escrow, etc.).
// Solo se usa para MOSTRAR/ocultar el link y la ruta; el backend valida igual.
// ─────────────────────────────────────────────────────────────────────────────
const ELIT_ALLOWED_EMAILS = new Set(
  (import.meta.env.VITE_ELIT_ALLOWED_EMAILS || "")
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const emailCanUseElit = (userData) => {
  const email = (userData?.email || "").toLowerCase().trim();
  return !!email && ELIT_ALLOWED_EMAILS.has(email);
};

export const useUserStore = create(
  persist(
        (set) => ({
      dbUser: null,
      isAdmin: false,
      canUseElitCatalog: false,

      // El rol ahora viene del backend (User.role en Mongo), no de un id de Privy.
      // Además, si el email está en VITE_ADMIN_EMAILS lo consideramos admin
      // aunque la BD aún no tenga el rol (acceso bootstrap al panel).
      // `canUseElitCatalog` habilita el panel de proveedores a cuentas puntuales
      // (VITE_ELIT_ALLOWED_EMAILS) sin darles admin total.
            // `_legacyId` se mantiene por compatibilidad de firma (ya no se usa).
      //
      // ⚠️ AISLAMIENTO DE SESIONES (bug 2026-11): el dueño del store es
      // `supabaseId`. Un `dbUser` SIN `supabaseId` no se puede atar a ninguna
      // sesión y, persistido en localStorage, sobrevive al cambio de usuario
      // exponiendo datos (incluida la wallet) del anterior. No lo guardamos.
      setDbUser: (userData, _legacyId) => {
        if (userData && !userData.supabaseId) {
          console.warn(
            "[useUserStore] dbUser sin supabaseId: no se persiste (evita mezclar identidades).",
          );
          set({ dbUser: null, isAdmin: false, canUseElitCatalog: false });
          return;
        }
        const admin = userData?.role === "admin" || emailIsAdmin(userData);
        set({
          dbUser: userData || null,
          isAdmin: admin,
          canUseElitCatalog: admin || emailCanUseElit(userData),
        });
      },

      // 💡 NUEVA ACCIÓN: Actualiza solo las direcciones dentro de dbUser
      setAddresses: (newAddresses) =>
        set((state) => ({
          dbUser: state.dbUser ? { ...state.dbUser, addresses: newAddresses } : null,
        })),

      clearUser: () => set({ dbUser: null, isAdmin: false, canUseElitCatalog: false }),
    }),
    {
      name: 'user-storage',
      // Al rehidratar desde localStorage recomputamos `isAdmin` contra el
      // dbUser persistido, para que refleje VITE_ADMIN_EMAILS aunque el estado
      // guardado haya quedado desactualizado (p.ej. cambiaste la lista blanca
      // sin volver a loguearte). El backend igual valida cada acción sensible.
      onRehydrateStorage: () => (state) => {
        if (state?.dbUser) {
          const admin =
            state.dbUser?.role === "admin" || emailIsAdmin(state.dbUser);
          state.isAdmin = admin;
          state.canUseElitCatalog = admin || emailCanUseElit(state.dbUser);
        }
      },
    }
  )
);

