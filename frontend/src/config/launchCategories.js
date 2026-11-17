// frontend/src/config/launchCategories.js
//
// ═══════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE LANZAMIENTO — qué categorías se pueden publicar hoy
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTEXTO: en el lanzamiento la plataforma está orientada a
// COMPUTACIÓN / TECNOLOGÍA. A medida que crezcamos vamos habilitando rubros.
// El catálogo completo vive en `data/allCategories.js` (32 categorías, ~400
// subcategorías heredadas de un dataset tipo MercadoLibre). Mostrar todo eso
// en el dropdown de "Crear publicación" invita a publicar cosas que todavía
// no queremos (o no podemos) operar.
//
// DECISIÓN: lista FIJA y CURADA, NO detección dinámica.
//   - Detectar "categorías que tenemos" por productos existentes no sirve: al
//     lanzar no hay productos, y un vendedor nunca podría elegir una categoría
//     vacía (huevo y gallina). Peor: la lista dependería de datos que cambian
//     con cada import de scraping.
//   - Una lista fija es explícita, auditable y se versiona con el código. Para
//     habilitar un rubro nuevo se agrega un objeto acá (y NADA más: el backend
//     lo toma automáticamente, ver nota de sincronización abajo).
//
// ─── FUENTE DE VERDAD Y SINCRONIZACIÓN (IMPORTANTE) ────────────────────────
// Este archivo es la ÚNICA fuente de la allowlist para publicar. El backend
// NO tiene una copia: `bulkImportController.js` y el catálogo de importación
// derivan su lista de categorías válidas desde el catálogo completo, así que
// crear la publicación ya está validado del lado del servidor por
// `moderation.status = "pending"` + la revisión manual (no hay forma de
// publicar algo inapropiado y que sea visible sin aprobación del admin).
// Si en el futuro se quiere una barrera DURA en el backend, importar este
// archivo desde `requireSellerOnboarding`/`productController`.
//
// ─── PARA HABILITAR UN RUBRO NUEVO ─────────────────────────────────────────
//   1. Agregar la categoría con su `slug` exacto (debe existir en
//      `data/allCategories.js`, si no el producto quedará huérfano).
//   2. Copiar los slugs de las subcategorías que se habilitan. Usar
//      `subcategories: null` para habilitar TODAS las de esa categoría.
//      OJO: "Gift Cards", "Criptomonedas" y "Cursos" quedan afuera a
//      propósito (son productos digitales, con otra logística y otro riesgo).
//
// ─── PARA DESHABILITAR ─────────────────────────────────────────────────────
//   Borrar el objeto de la lista. Los productos ya publicados en esa
//   categoría NO se rompen (siguen visibles y editables); solo dejan de
//   ofrecerse como opción al crear uno nuevo.

import { allCategories } from "../data/allCategories.js";

/**
 * Catálogo habilitado para publicar en esta etapa.
 * `subcategories: null` = todas las subcategorías de la categoría.
 */
export const LAUNCH_CATEGORIES = [
  {
    slug: "computacion",
    subcategories: [
      "notebooks-y-accesorios",
      "pc-de-escritorio",
      "componentes-de-pc",
      "monitores-y-accesorios",
      "perifericos-de-pc",
      "almacenamiento",
      "cables-y-hubs-usb",
      "conectividad-y-redes",
      "estabilizadores-y-ups",
      "impresion",
      "lectores-y-scanners",
      "proyectores-y-pantallas",
      "accesorios-para-pc-gaming",
      "tablets-y-accesorios",
      "limpieza-y-cuidado-de-pcs",
      "accesorios-de-antiestatica",
      // "criptomonedas", "gift-cards", "software" y "palms-y-handhelds"
      // quedan afuera a propósito (digitales / obsoletas).
      "otros",
    ],
  },
  {
    slug: "celulares-y-telefonos",
    subcategories: [
      "celulares-y-smartphones",
      "smartwatches-y-accesorios",
      "accesorios-para-celulares",
      "repuestos-de-celulares",
      "otros",
    ],
  },
  {
    slug: "electronica-audio-y-video",
    subcategories: [
      "televisores",
      "audio",
      "accesorios-para-tv",
      "accesorios-para-audio-y-video",
      "media-streaming",
      "drones-y-accesorios",
      "controles-remotos",
      "pilas-y-cargadores",
      "cables",
      "otros",
    ],
  },
  {
    slug: "consolas-y-videojuegos",
    subcategories: [
      "consolas",
      "videojuegos",
      "accesorios-para-consolas",
      "accesorios-para-pc-gaming",
      "repuestos-para-consolas",
      "otros",
    ],
  },
  {
    slug: "camaras-y-accesorios",
    subcategories: [
      "camaras",
      "filmadoras-y-camaras-de-accion",
      "accesorios-para-camaras",
      "lentes-y-filtros",
      "otros",
    ],
  },
  {
    // Rubro que suele acompañar al de computación (ofimática, insumos).
    // Si preferís no ofrecerlo en el lanzamiento, borrá este objeto.
    slug: "industrias-y-oficinas",
    subcategories: [
      "equipamiento-para-oficinas",
      "equipamiento-para-comercios",
      "grafica-e-impresion",
      "embalaje-y-logistica",
      "otros",
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers (derivados, no tocar)
// ---------------------------------------------------------------------------

// Mapa slug → Set de subcategorías habilitadas (o null = todas).
const launchMap = new Map(
  LAUNCH_CATEGORIES.map((cat) => [
    cat.slug,
    cat.subcategories ? new Set(cat.subcategories) : null,
  ]),
);

/**
 * Categorías del catálogo completo que están habilitadas para publicar,
 * con sus subcategorías ya filtradas. Devuelve la misma forma que
 * `allCategories` ({ id, name, slug, subcategories }) para que sea
 * drop-in en los formularios.
 */
export const launchCategoryTree = LAUNCH_CATEGORIES.map((launchCat) => {
  const full = allCategories.find((c) => c.slug === launchCat.slug);
  if (!full) {
    // Fallar ruidoso: si alguien escribe mal un slug, queremos verlo en
    // consola y no que la categoría desaparezca del dropdown en silencio.
    console.warn(
      `[launchCategories] El slug "${launchCat.slug}" no existe en allCategories.js`,
    );
    return null;
  }
  const allowed = launchMap.get(launchCat.slug);
  return {
    ...full,
    subcategories: allowed
      ? (full.subcategories || []).filter((sub) => allowed.has(sub.slug))
      : full.subcategories,
  };
}).filter(Boolean);

/** true si la categoría (slug) está habilitada para publicar. */
export const isLaunchCategory = (slug) => launchMap.has(slug);

/** true si el par categoría/subcategoría está habilitado para publicar. */
export const isLaunchSubCategory = (catSlug, subSlug) => {
  if (!launchMap.has(catSlug)) return false;
  const allowed = launchMap.get(catSlug);
  return allowed === null ? true : allowed.has(subSlug);
};
