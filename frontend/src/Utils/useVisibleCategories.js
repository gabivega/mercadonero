import { useEffect, useState } from "react";
import axios from "axios";
import { allCategories } from "../data/allCategories";

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORÍAS VISIBLES PARA EL MENÚ
// ═══════════════════════════════════════════════════════════════════════════
// REGLA DEL PRODUCTO: si no hay productos de la categoría X, X no aparece en el
// menú. No tiene sentido dejar navegar a una página que dice "todavía no hay
// productos". Por eso NO usamos una lista fija en el front (la vieja
// `data/categories.js` tenía slugs inexistentes y llevaba a páginas vacías):
// preguntamos al backend qué categorías tienen hoy al menos un producto visible.
//
// El backend devuelve SOLO slugs. Acá los traducimos a nombre legible y los
// ordenamos según el catálogo oficial (`allCategories`), para que el menú tenga
// un orden estable y no cambie de posición en cada carga.
//
// Cache en módulo: el menú se usa en Header (desktop + mobile) y potencialmente
// en otras vistas. Una sola request por sesión alcanza; sin esto cada remount
// del Header dispara el cálculo de facetas del backend de nuevo.

// `null` = todavía no pedimos. `[]` = pedimos y no hay nada (resultado válido).
let cache = null;
let inFlight = null;
// Suscriptores para que cualquier componente montado después se entere del resultado.
const listeners = new Set();

const prettify = (slug) =>
  (slug || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

// Orden canónico del catálogo: así "Computación" no salta de lugar según en qué
// orden Mongo devolvió los slugs.
const ORDER = new Map(allCategories.map((c, i) => [c.slug, i]));
const NAME = new Map(allCategories.map((c) => [c.slug, c.name]));

const sortByCatalogOrder = (slugs) =>
  [...slugs].sort((a, b) => {
    const ai = ORDER.has(a) ? ORDER.get(a) : Number.MAX_SAFE_INTEGER;
    const bi = ORDER.has(b) ? ORDER.get(b) : Number.MAX_SAFE_INTEGER;
    // Los slugs desconocidos (no están en allCategories) van al final, alfabético.
    return ai === bi ? String(a).localeCompare(String(b)) : ai - bi;
  });

/**
 * Dispara (una sola vez) la carga de categorías con productos visibles.
 * Devuelve la promesa del resultado ya mapeado a `{ slug, name }`.
 * Si falla, devuelve [] (fail-quiet: el menú NO debe romper la app entera).
 */
const loadCategories = () => {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = axios
    .get(`${import.meta.env.VITE_SERVER_URL}/api/product/categories`)
    .then(({ data }) => {
      if (!data?.success) return [];
      return sortByCatalogOrder(data.categories || []).map((slug) => ({
        slug,
        name: NAME.get(slug) || prettify(slug),
      }));
    })
    .catch((error) => {
      // Un fallo de red no debe tumbar el header. Devolvemos [] y permitimos
      // reintentar en el próximo mount (por eso NO seteamos `cache`).
      console.error("Error al cargar categorías del menú:", error?.message);
      return [];
    })
    .then((result) => {
      inFlight = null;
      // Solo cacheamos si hubo éxito real (array). Si falló, queda para reintentar.
      if (result && result.length >= 0 && !cache) cache = result;
      listeners.forEach((fn) => fn(result));
      return result;
    });

  return inFlight;
};

/**
 * Hook: categorías del menú con al menos un producto visible.
 * Devuelve `{ categories, loading }`.
 */
export function useVisibleCategories() {
  const [categories, setCategories] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let mounted = true;

    // Si ya hay cache, hidratamos sin pedir nada.
    if (cache) {
      setCategories(cache);
      setLoading(false);
      return;
    }

    const handler = (result) => {
      if (!mounted) return;
      setCategories(result);
      setLoading(false);
    };
    listeners.add(handler);

    loadCategories().then((result) => {
      if (!mounted) return;
      // Si `loadCategories` falló devuelve [], pero un `cache` pudo tener razón.
      setCategories(cache || result);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listeners.delete(handler);
    };
  }, []);

  return { categories, loading };
}

/**
 * Invalida la cache. Útil cuando se aprueba/publica un producto y queremos que
 * el menú refleje la nueva categoría sin recargar la página.
 */
export function invalidateVisibleCategories() {
  cache = null;
}
