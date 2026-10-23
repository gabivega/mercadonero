// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de categorías de Tiendanube → categorías de Mercado Nero.
//
// Tiendanube es heterogéneo: cada tienda usa SU taxonomía (deportes, autopartes,
// bebidas, etc.). Este archivo define la tabla de equivalencia
// (palabra clave en el breadcrumb/nombre → { category, subCategory } de MN).
//
// ── Estrategia (fix acotado MVP) ──
//   1) Buscamos la primera regla cuyo keyword aparezca en el breadcrumb.
//   2) Si hay match claro → esa categoría MN.
//   3) Si NO hay match → usamos la categoría MN genérica ('otros'), editable por
//      el vendedor, y devolvemos la RAÍZ real de la tienda como referencia.
//
// Los slugs de MN deben existir en el catálogo de categorías del front.
// ─────────────────────────────────────────────────────────────────────────────

// Categoría MN de fallback cuando NO hay match: genérica, editable.
export const TIENDANUBE_DEFAULT_CATEGORY = {
  category: 'otros',
  subCategory: 'otros',
};

// Tabla de equivalencias por PALABRA CLAVE (substring en el breadcrumb ya
// normalizado a minúsculas sin acentos). El orden importa: gana el primer match.
export const TIENDANUBE_CATEGORY_RULES = [
  // ══════════════════════════ AUTOPARTES ══════════════════════════
  // Va PRIMERO: es el rubro más grande y con keywords muy específicas.
  // Estructura MN: accesorios-para-vehiculos / repuestos-autos-y-camionetas
  {
    match: [
      'suspension', 'direccion', 'amortiguador', 'espiral', 'resorte', 'bieleta',
      'parrilla', 'rotula', 'buje', 'ruleman', 'rodamiento', 'cazoleta',
      'encendido', 'bujia', 'bobina', 'alternador', 'burro', 'arranque', 'distribuidor',
      'iluminacion', 'optica', 'farol', 'faro', 'lampara', 'giro', 'led',
      'freno', 'pastilla', 'disco', 'tambor', 'cinta', 'maza',
      'bocina', 'claxon',
      'lubricante', 'aceite', 'filtro', 'aditivo',
      'transmision', 'caja', 'embrague', 'volante', 'homocinetica',
      'motor', 'piston', 'valvula', 'junta', 'radiador', 'refrigerante',
      'escape', 'catalizador', 'silenciador',
      'sensor', 'marca1', 'marcas',
    ],
    category: 'accesorios-para-vehiculos',
    subCategory: 'repuestos-autos-y-camionetas',
  },
  {
    match: ['herramienta', 'llave', 'crique', 'gato', 'compresor', 'inflador', 'hidraulico'],
    category: 'accesorios-para-vehiculos',
    subCategory: 'herramientas-para-vehiculos',
  },
  {
    match: ['audio', 'parlante', 'estereo', 'multimedia'],
    category: 'accesorios-para-vehiculos',
    subCategory: 'audio-para-vehiculos',
  },
  {
    match: ['limpieza', 'shampoo', 'abrillantador', 'lustre'],
    category: 'accesorios-para-vehiculos',
    subCategory: 'limpieza-de-vehiculos',
  },
  {
    match: ['neumatico', 'cubierta', 'llanta', 'rueda'],
    category: 'accesorios-para-vehiculos',
    subCategory: 'neumaticos',
  },

  // ══════════════════════════ DEPORTES ══════════════════════════
  // Zapatillas ANTES de tenis/pádel: "ZAPATILLAS DE TENIS" → zapatillas.
  {
    match: ['zapatilla', 'calzado', 'sneaker', 'botin', 'botas', 'bota'],
    category: 'deportes-y-fitness',
    subCategory: 'zapatillas',
  },
  {
    match: ['pala', 'paleta', 'padel', 'raqueta', 'tenis', 'squash', 'grip', 'pelota', 'tubo'],
    category: 'deportes-y-fitness',
    subCategory: 'tenis-padel-y-squash',
  },
  {
    match: ['futbol', 'camiseta'],
    category: 'deportes-y-fitness',
    subCategory: 'futbol',
  },
  {
    match: ['running', 'trekking', 'montana', 'trail'],
    category: 'deportes-y-fitness',
    subCategory: 'montanismo-y-trekking',
  },
  {
    match: ['basquet', 'basket'],
    category: 'deportes-y-fitness',
    subCategory: 'basquet',
  },
  {
    match: ['voley', 'volley'],
    category: 'deportes-y-fitness',
    subCategory: 'voley',
  },
  {
    match: ['indumentaria', 'ropa', 'remera', 'short', 'buzo', 'campera', 'medias', 'gorra'],
    category: 'deportes-y-fitness',
    subCategory: 'ropa-deportiva',
  },
  {
    match: ['fitness', 'musculacion', 'mancuerna', 'suplemento', 'proteina', 'gym', 'boxeo'],
    category: 'deportes-y-fitness',
    subCategory: 'fitness-y-musculacion',
  },
  {
    match: ['bicicleta', 'ciclismo', 'bike'],
    category: 'deportes-y-fitness',
    subCategory: 'ciclismo',
  },
  {
    match: ['natacion', 'pileta', 'malla'],
    category: 'deportes-y-fitness',
    subCategory: 'natacion',
  },
  {
    match: ['accesorio', 'bolso', 'mochila', 'raquetero', 'antivibrador', 'overgrip', 'cubre'],
    category: 'deportes-y-fitness',
    subCategory: 'otros',
  },

  // ══════════════════════════ CAMPING / AIRE LIBRE ══════════════════════════
  {
    match: ['camping', 'aire libre', 'carpa', 'parrilla', 'conservadora'],
    category: 'deportes-y-fitness',
    subCategory: 'otros',
  },
];

// Normaliza texto: minúsculas + sin acentos.
const normalize = (str = '') =>
  String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// "Inicio"/"Home"/"Productos" no aportan como categoría.
const NOISE = new Set(['inicio', 'home', 'productos', 'producto', 'tienda']);

/**
 * Dado el texto de categoría/breadcrumb de un producto de Tiendanube, devuelve
 * el mapeo a nuestras categorías.
 *
 * Fix acotado:
 *   - match claro → categoría MN específica.
 *   - sin match    → categoría MN genérica ('otros') + RAÍZ real de la tienda
 *                    como referencia (editable por el vendedor).
 *
 * @param {string|string[]} categoryText  Texto o lista de textos de categoría.
 * @returns {{category: string, subCategory: string, matched: boolean, storeCategory?: string}}
 */
export function mapTiendanubeCategory(categoryText = '') {
  const texts = Array.isArray(categoryText) ? categoryText : [categoryText];

  // Limpiamos ruido ("Inicio", "Productos").
  const cleanTexts = texts
    .map((t) => String(t || '').trim())
    .filter((t) => t && !NOISE.has(normalize(t)));

  const haystack = normalize(cleanTexts.join(' '));

  for (const rule of TIENDANUBE_CATEGORY_RULES) {
    for (const kw of rule.match) {
      if (haystack.includes(normalize(kw))) {
        return {
          category: rule.category,
          subCategory: rule.subCategory,
          matched: true,
        };
      }
    }
  }

  // Sin match: guardamos la raíz real de la tienda como referencia textual.
  const storeRoot = cleanTexts[0] || '';

  return {
    ...TIENDANUBE_DEFAULT_CATEGORY,
    matched: false,
    storeCategory: storeRoot,
  };
}
