import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { useFavoritesStore } from "../store/useFavoritesStore";

const BASE = import.meta.env.VITE_SERVER_URL;

/**
 * Hook para manejar los favoritos del usuario:
 * - loadFavorites(): trae la lista guardada del servidor.
 * - toggleFavorite(product): agrega o quita el producto del servidor y
 *   actualiza la store local de forma consistente.
 */
export const useFavorites = () => {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const setFavorites = useFavoritesStore((s) => s.setFavorites);
  const addOne = useFavoritesStore((s) => s.addOne);
  const removeOne = useFavoritesStore((s) => s.removeOne);

  const loadFavorites = useCallback(async () => {
    if (!ready || !authenticated) return;
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(`${BASE}/api/user/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFavorites(data.favorites || []);
    } catch (error) {
      console.error("Error al cargar favoritos:", error);
    }
  }, [ready, authenticated, getAccessToken, setFavorites]);

  // Devuelve { added: true } si quedó guardado, { added: false } si se quitó,
  // o { added: null } si el usuario no está autenticado o hubo un error.
  const toggleFavorite = useCallback(
    async (product) => {
      if (!ready || !authenticated || !product?._id) {
        return { added: null };
      }
      try {
        const token = await getAccessToken();
        const isFavorite = useFavoritesStore
          .getState()
          .favorites.some((f) => String(f._id) === String(product._id));

        if (isFavorite) {
          await axios.delete(`${BASE}/api/user/favorites/${product._id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          removeOne(String(product._id));
          return { added: false };
        } else {
          await axios.post(
            `${BASE}/api/user/favorites/${product._id}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } },
          );
          addOne(product);
          return { added: true };
        }
      } catch (error) {
        console.error("Error al actualizar favorito:", error);
        return { added: null };
      }
    },
    [ready, authenticated, getAccessToken, addOne, removeOne],
  );

  return { loadFavorites, toggleFavorite };
};
