import { create } from 'zustand';

/**
 * Estado global de favoritos.
 * Guarda la lista de productos guardados (objetos poblados con el vendedor)
 * para que cualquier ProductCard / página pueda consultar si un producto ya
 * está en favoritos y re-renderizar de forma consistente.
 */
export const useFavoritesStore = create((set) => ({
  favorites: [], // array de productos (objeto poblado con vendedor)
  loaded: false, // si ya se cargó del servidor (evita refetch innecesario)

  // Reemplaza toda la lista (se usa al cargar desde /api/user/favorites)
  setFavorites: (products) =>
    set({ favorites: Array.isArray(products) ? products : [], loaded: true }),

  // Agrega un único producto (si no está ya) — para el toggle desde una card
  addOne: (product) =>
    set((state) => {
      if (!product?._id) return state;
      const exists = state.favorites.some(
        (f) => String(f._id) === String(product._id),
      );
      if (exists) return state;
      return { favorites: [product, ...state.favorites] };
    }),

  // Quita un producto por su id — para el toggle desde una card
  removeOne: (productId) =>
    set((state) => ({
      favorites: state.favorites.filter(
        (f) => String(f._id) !== String(productId),
      ),
    })),

  // Limpia el estado (logout / cambio de usuario)
  clearFavorites: () => set({ favorites: [], loaded: false }),
}));
