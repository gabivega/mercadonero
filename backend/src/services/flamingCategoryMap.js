// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de categorías de Flaming (WooCommerce) → categorías de Mercado Nero.
//
// Flaming usa sus PROPIAS categorías. Vos pediste que los productos importados
// usen las categorías de NUESTRA plataforma. Este archivo define la tabla de
// equivalencia (slug Flaming → { category, subCategory } de MN).
//
// Reglas:
//   - La clave es el slug de categoría tal como lo devuelve Flaming.
//   - El valor es un objeto con:
//       category:     slug de la categoría PRINCIPAL de MN.
//       subCategory:  slug de la subcategoría de MN (opcional, puede ser "").
//
// IMPORTANTE: los slugs del lado MN deben existir en
// backend/src/categoriesWithSlugs.js (validado en bulkImport). Si un slug de
// MN no existe, la importación de ese producto fallaría la validación.
//
// El DEFAULT se usa para cualquier categoría de Flaming no listada acá.
// ─────────────────────────────────────────────────────────────────────────────

// Categoría por defecto cuando no hay match (podés cambiarla).
export const FLAMING_DEFAULT_CATEGORY = {
  category: 'alimentos-y-bebidas',
  subCategory: 'bebidas',
};

// Tabla de equivalencias. Editable sin tocar código.
export const FLAMING_CATEGORY_MAP = {
  // ── Bebidas con alcohol ──
  'cervezas': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'cervezas-industriales': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'cervezas-artesanales': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'vinos': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'espumantes': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'espumantes-dulces': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'espumantes-extra-brut': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'espumantes-rose': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'gin': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'vodka': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'whisky': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'aperitivos': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'aperitivos-aperitivos': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'bebidas-flaming': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },

  // ── Bebidas sin alcohol ──
  'bebida-sin-alcohol': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'aguas-sodas-bebida-sin-alcohol': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'energizantes-bebida-sin-alcohol': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'gaseosa-grandes': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },
  'gaseosas-chicas-latas-bebida-sin-alcohol': { category: 'alimentos-y-bebidas', subCategory: 'bebidas' },

  // ── Almacén / comestibles ──
  'almacen': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'conservas-escabeches': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'cafe-yerba-cafe-2': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'quesos-embutidos': { category: 'alimentos-y-bebidas', subCategory: 'frescos' },
  'food-market': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'flaming-foodies': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },

  // ── Dulces y snacks ──
  'dulces-tentaciones': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'arcor-dulce': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'snack': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'craket-snack': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },

  // ── Suplementos / salud ──
  'productos-saludables': { category: 'salud-y-equipamiento-medico', subCategory: 'suplementos-alimenticios' },
  'productos-saludables-varios': { category: 'salud-y-equipamiento-medico', subCategory: 'suplementos-alimenticios' },
  'suplemtos-deportivos': { category: 'deportes-y-fitness', subCategory: 'suplementos-y-shakers' },
  'flaming-move': { category: 'deportes-y-fitness', subCategory: 'suplementos-y-shakers' },
  'barras-proteicas': { category: 'salud-y-equipamiento-medico', subCategory: 'suplementos-alimenticios' },
  'creatina': { category: 'deportes-y-fitness', subCategory: 'suplementos-y-shakers' },
  'colageno': { category: 'salud-y-equipamiento-medico', subCategory: 'suplementos-alimenticios' },

  // ── Sin TACC ──
  'productos-sin-tacc': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'dulces-chocolates-sin-tacc': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },

  // ── Bazar / hogar ──
  'bazar': { category: 'hogar-muebles-y-jardin', subCategory: 'bazar-y-cocina' },
  'copas': { category: 'hogar-muebles-y-jardin', subCategory: 'bazar-y-cocina' },

  // ── Smoker / accesorios ──
  'smoker': { category: 'hogar-muebles-y-jardin', subCategory: 'jardin-y-aire-libre' },
  'accesorios-smoker': { category: 'hogar-muebles-y-jardin', subCategory: 'jardin-y-aire-libre' },

  // ── Otros ──
  'sex-shop': { category: 'otras-categorias', subCategory: 'adultos' },
  'adultos': { category: 'otras-categorias', subCategory: 'adultos' },
  'promos-flama': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'gangas-fin-de-mes': { category: 'alimentos-y-bebidas', subCategory: 'almacen' },
  'fiestas': { category: 'souvenirs-cotillon-y-fiestas', subCategory: 'cotillon' },
  'boutique': { category: 'ropa-y-accesorios', subCategory: 'otros' },
};

/**
 * Dada la lista de categorías de un producto de Flaming (array de {slug,...}),
 * devuelve el primer match contra nuestra tabla. Si ninguno matchea, devuelve
 * el default.
 *
 * @param {{slug: string, name: string}[]} flamingCategories
 * @returns {{category: string, subCategory: string}}
 */
export function mapFlamingCategories(flamingCategories = []) {
  for (const cat of flamingCategories) {
    const slug = cat?.slug;
    if (slug && FLAMING_CATEGORY_MAP[slug]) {
      return FLAMING_CATEGORY_MAP[slug];
    }
  }
  return { ...FLAMING_DEFAULT_CATEGORY };
}
