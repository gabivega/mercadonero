import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useFavoritesStore } from "../../store/useFavoritesStore";
import { useFavorites } from "../../Utils/useFavorites";
import ProductCard from "../../components/ProductCard";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function Favorites() {
  const favorites = useFavoritesStore((state) => state.favorites);
  const loaded = useFavoritesStore((state) => state.loaded);
  const { loadFavorites } = useFavorites();

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900 dark:text-white">
          Mis Favoritos
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Los productos que guardaste para comprar más tarde.
        </p>
      </div>

      {!loaded ? (
        <div className="p-8 text-center">
          <LoadingSpinner size="lg" text="Cargando favoritos..." />
        </div>
      ) : favorites.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
          <Heart
            className="mx-auto text-zinc-300 dark:text-zinc-600 mb-4"
            size={48}
          />
          <p className="text-zinc-500 font-medium">
            Todavía no tenés productos en favoritos.
          </p>
          <p className="text-sm text-zinc-400 mt-1">
            Tocá el corazón en cualquier producto para guardarlo acá.
          </p>
          <Link
            to="/"
            className="inline-block mt-6 px-6 py-3 text-sm font-semibold rounded-xl bg-[#F26722] text-white hover:bg-[#d9531e] transition-colors"
          >
            Explorar productos
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Tenés {favorites.length} producto{favorites.length !== 1 && "s"} en
            favoritos. Tocá el corazón en una tarjeta para quitarlo.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {favorites.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
