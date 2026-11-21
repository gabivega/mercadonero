// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de categorías de Elit → categorías de Mercado Nero.
//
// Elit es un proveedor de INSUMOS INFORMÁTICOS / HARDWARE. Sus categorías
// (`categoria` + `sub_categoria`) no coinciden con los slugs de la plataforma
// (ver backend/src/categoriesWithSlugs.js), así que este módulo centraliza la
// traducción.
//
// ¿Por qué un mapa explícito y no una heurística? Porque el import masivo
// PUBLICADO debe quedar bien categorizado: si cae todo en "otros", el catálogo
// público queda inútil para filtrar. Igual guardamos la categoría ORIGINAL del
// proveedor en `specifications` (ver elitAdapter), así nunca se pierde.
//
// Todos los `category`/`subCategory` usados acá EXISTEN en categoriesWithSlugs.js.
// Si aparece una categoría nueva de Elit, cae al DEFAULT (Computación/Otros).
// ─────────────────────────────────────────────────────────────────────────────

// Categoría por defecto: casi todo el catálogo de Elit es computación/periféricos.
export const ELIT_DEFAULT_CATEGORY = {
  category: 'computacion',
  subCategory: 'otros',
};

// Clave del mapa = `${categoria} | ${sub_categoria}` tal como las devuelve Elit,
// normalizadas a minúsculas y sin acentos (ver normalizeKey).
export const ELIT_CATEGORY_MAP = {
  // ── Hardware (componentes de PC) ──
  'hardware | motherboards': { category: 'computacion', subCategory: 'componentes-de-pc' },
  'hardware | procesadores': { category: 'computacion', subCategory: 'componentes-de-pc' },
  'hardware | coolers': { category: 'computacion', subCategory: 'componentes-de-pc' },
  'hardware | fuentes': { category: 'computacion', subCategory: 'componentes-de-pc' },
  'hardware | gabinetes': { category: 'computacion', subCategory: 'componentes-de-pc' },
  'hardware | placas de video': { category: 'computacion', subCategory: 'componentes-de-pc' },

  // ── Memorias ──
  'memorias | memorias pc': { category: 'computacion', subCategory: 'componentes-de-pc' },
  'memorias | memorias notebook': { category: 'computacion', subCategory: 'componentes-de-pc' },

  // ── Almacenamiento ──
  'almacenamiento | discos internos': { category: 'computacion', subCategory: 'almacenamiento' },
  'almacenamiento | discos internos ssd': { category: 'computacion', subCategory: 'almacenamiento' },
  'almacenamiento | discos externos': { category: 'computacion', subCategory: 'almacenamiento' },
  'almacenamiento | discos externos ssd': { category: 'computacion', subCategory: 'almacenamiento' },
  'almacenamiento | pen drives': { category: 'computacion', subCategory: 'almacenamiento' },
  'almacenamiento | memorias flash': { category: 'computacion', subCategory: 'almacenamiento' },
  'almacenamiento | nas': { category: 'computacion', subCategory: 'almacenamiento' },

  // ── Periféricos ──
  'perifericos | mouses': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | teclados': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | mouse pads': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | bases notebook': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | camaras web': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | adaptadores': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | kit': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  'perifericos | punteros': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  // Variante con acento roto ("Perifëricos"): el normalizeKey no la deshace,
  // así que la dejamos listada explícitamente.
  'perifëricos | joysticks': { category: 'computacion', subCategory: 'perifericos-de-pc' },
  // Joysticks/volantes: los mandamos a Consolas (gaming) para no perderlos en componentes.
  'perifericos | joysticks': { category: 'consolas-y-videojuegos', subCategory: 'accesorios-para-pc-gaming' },
  'simuladores | volantes': { category: 'consolas-y-videojuegos', subCategory: 'accesorios-para-pc-gaming' },

  // ── Audio ──
  'audio | auriculares': { category: 'electronica-audio-y-video', subCategory: 'audio' },
  'audio | parlantes': { category: 'electronica-audio-y-video', subCategory: 'audio' },
  'audio | microfonos': { category: 'electronica-audio-y-video', subCategory: 'audio' },

  // ── Imagen / Monitores / Proyectores ──
  'imagen | monitores': { category: 'computacion', subCategory: 'monitores-y-accesorios' },
  'imagen | pantallas': { category: 'computacion', subCategory: 'monitores-y-accesorios' },
  'imagen | proyectores': { category: 'electronica-audio-y-video', subCategory: 'proyectores-y-pantallas' },
  'imagen | escaner': { category: 'computacion', subCategory: 'lectores-y-scanners' },
  'imagen | soportes': { category: 'computacion', subCategory: 'monitores-y-accesorios' },

  // ── Computadoras ──
  'computadoras | notebooks corporativo': { category: 'computacion', subCategory: 'notebooks-y-accesorios' },
  'computadoras | notebooks consumo': { category: 'computacion', subCategory: 'notebooks-y-accesorios' },
  'computadoras | mini pc': { category: 'computacion', subCategory: 'pc-de-escritorio' },
  'computadoras | desktop corporativo': { category: 'computacion', subCategory: 'pc-de-escritorio' },
  'computadoras | all in one': { category: 'computacion', subCategory: 'pc-de-escritorio' },
  'computadoras | all in one corporativo': { category: 'computacion', subCategory: 'pc-de-escritorio' },
  'computadoras | tablets': { category: 'computacion', subCategory: 'tablets-y-accesorios' },

  // ── Conectividad / Redes ──
  'conectividad | routers': { category: 'computacion', subCategory: 'conectividad-y-redes' },
  'conectividad | switches': { category: 'computacion', subCategory: 'conectividad-y-redes' },
  'conectividad | extensores': { category: 'computacion', subCategory: 'conectividad-y-redes' },

  // ── Cables ──
  'cables | cables': { category: 'computacion', subCategory: 'cables-y-hubs-usb' },

  // ── Energía ──
  'unidad de energia | ups': { category: 'computacion', subCategory: 'estabilizadores-y-ups' },
  'unidad de energia | estabilizadores': { category: 'computacion', subCategory: 'estabilizadores-y-ups' },
  'unidad de energia | protectores': { category: 'computacion', subCategory: 'estabilizadores-y-ups' },
  'unidad de energia | cargadores portatiles': { category: 'electronica-audio-y-video', subCategory: 'pilas-y-cargadores' },

  // ── Impresoras e insumos ──
  'impresoras | impresoras laser': { category: 'computacion', subCategory: 'impresion' },
  'impresoras | impresoras inkjet': { category: 'computacion', subCategory: 'impresion' },
  'impresoras | impresoras de sistema continuo': { category: 'computacion', subCategory: 'impresion' },
  'impresoras | impresoras de tickets': { category: 'computacion', subCategory: 'impresion' },
  'impresoras | plotters': { category: 'computacion', subCategory: 'impresion' },
  'insumos | toners': { category: 'computacion', subCategory: 'impresion' },
  'insumos | cartuchos de tinta': { category: 'computacion', subCategory: 'impresion' },
  'insumos | cartuchos de plotters': { category: 'computacion', subCategory: 'impresion' },
  'insumos | botellas de tinta': { category: 'computacion', subCategory: 'impresion' },
  'insumos | cilindros': { category: 'computacion', subCategory: 'impresion' },

  // ── Seguridad ──
  'seguridad | camaras wifi': { category: 'hogar-muebles-y-jardin', subCategory: 'seguridad-para-el-hogar' },
  'seguridad | camaras ip': { category: 'hogar-muebles-y-jardin', subCategory: 'seguridad-para-el-hogar' },
  // Un panel solar es energía renovable PARA EL HOGAR, no agricultura. Antes
  // apuntaba a agro/energia-renovable (que existe, pero es semánticamente
  // incorrecto: el origen en Elit es "Seguridad", junto a las cámaras IP).
  'seguridad | panel solar': { category: 'hogar-muebles-y-jardin', subCategory: 'seguridad-para-el-hogar' },

  // ── Estuches / Bolsos ──
  'estuches | mochilas': { category: 'computacion', subCategory: 'notebooks-y-accesorios' },
  'estuches | fundas': { category: 'computacion', subCategory: 'notebooks-y-accesorios' },

  // ── Video Juegos ──
  'video juegos | consolas': { category: 'consolas-y-videojuegos', subCategory: 'consolas' },

  // ── Subcategorías sueltas (categoría vacía en Elit) ──
  ' | varios': ELIT_DEFAULT_CATEGORY,
  ' | lampara': { category: 'hogar-muebles-y-jardin', subCategory: 'iluminacion-para-el-hogar' },
  ' | software': { category: 'computacion', subCategory: 'software' },
  ' | pc de escritorio': { category: 'computacion', subCategory: 'pc-de-escritorio' },
};

/**
 * Normaliza un texto para usarlo como clave: minúsculas, sin acentos, espacios
 * colapsados. Ej: "Periféricos" → "perifericos".
 */
const normalizeKey = (value) =>
  String(value || '')
    .normalize('NFD')
    // Quitamos diacríticos (tildes). No toca la "ë" rota porque no es
    // combinable, pero igual la listamos aparte en el mapa.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Traduce la categoría/subcategoría de un producto de Elit a slugs de MN.
 *
 * @param {string} categoria      Campo `categoria` de Elit (ej: "Hardware").
 * @param {string} subCategoria   Campo `sub_categoria` de Elit (ej: "Motherboards").
 * @returns {{category: string, subCategory: string}}
 */
export function mapElitCategories(categoria = '', subCategoria = '') {
  const key = `${normalizeKey(categoria)} | ${normalizeKey(subCategoria)}`;
  return ELIT_CATEGORY_MAP[key] || { ...ELIT_DEFAULT_CATEGORY };
}
