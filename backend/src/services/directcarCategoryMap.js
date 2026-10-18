// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de categorías de DirectCar (WooCommerce) → categorías de Mercado Nero.
//
// DirectCar es un proveedor de AUTOPARTES. Todas sus categorías caen dentro de
// "Accesorios para Vehículos" de MN y, en su gran mayoría, en la subcategoría
// "Repuestos Autos y Camionetas" (slug: repuestos-autos-y-camionetas).
//
// Tabla: slug de categoría de DirectCar → { category, subCategory } de MN.
// La clave coincide con el slug tal como lo devuelve la Store API de DirectCar
// (ver src/productsScrape/directcar_productos.json → categories[]).
//
// IMPORTANTE: los slugs del lado MN hay que validarlos contra
// backend/src/categoriesWithSlugs.js. Todos los usados acá existen.
//
// El DEFAULT se aplica a cualquier categoría de DirectCar no listada.
// ─────────────────────────────────────────────────────────────────────────────

// Categoría por defecto para autopartes.
export const DIRECTCAR_DEFAULT_CATEGORY = {
  category: 'accesorios-para-vehiculos',
  subCategory: 'repuestos-autos-y-camionetas',
};

export const DIRECTCAR_CATEGORY_MAP = {
  // ── Partes de motor ──
  'partes-de-motor': DIRECTCAR_DEFAULT_CATEGORY,
  'tapa-de-valvulas': DIRECTCAR_DEFAULT_CATEGORY,
  'arbol-de-levas': DIRECTCAR_DEFAULT_CATEGORY,
  'engranaje-para-arbol-de-levas': DIRECTCAR_DEFAULT_CATEGORY,
  'correa-de-distribucion': DIRECTCAR_DEFAULT_CATEGORY,
  'kit-de-distribucion': DIRECTCAR_DEFAULT_CATEGORY,
  'kit-de-distribucion-bomba': DIRECTCAR_DEFAULT_CATEGORY,
  'tensores-de-correa': DIRECTCAR_DEFAULT_CATEGORY,
  'bomba-de-agua': DIRECTCAR_DEFAULT_CATEGORY,
  'bomba-de-aceite': DIRECTCAR_DEFAULT_CATEGORY,

  // ── Encendido / eléctrico ──
  'encendido': DIRECTCAR_DEFAULT_CATEGORY,
  'bobina-de-ignicion': DIRECTCAR_DEFAULT_CATEGORY,
  'cables-de-bujia': DIRECTCAR_DEFAULT_CATEGORY,

  // ── Tren delantero / suspensión / dirección ──
  'tren-delantero': DIRECTCAR_DEFAULT_CATEGORY,
  'suspension': DIRECTCAR_DEFAULT_CATEGORY,
  'amortiguador': DIRECTCAR_DEFAULT_CATEGORY,
  'cazoleta': DIRECTCAR_DEFAULT_CATEGORY,
  'parrilla': DIRECTCAR_DEFAULT_CATEGORY,
  'extremo': DIRECTCAR_DEFAULT_CATEGORY,
  'rotula': DIRECTCAR_DEFAULT_CATEGORY,
  'axial': DIRECTCAR_DEFAULT_CATEGORY,
  'direccion': DIRECTCAR_DEFAULT_CATEGORY,
  'bomba-de-direccion': DIRECTCAR_DEFAULT_CATEGORY,
  'soporte-de-motor': DIRECTCAR_DEFAULT_CATEGORY,

  // ── Embragues / transmisión ──
  'embragues': DIRECTCAR_DEFAULT_CATEGORY,
  'kit-de-embrague': DIRECTCAR_DEFAULT_CATEGORY,
  'actuador-de-embrague-hidraulico': DIRECTCAR_DEFAULT_CATEGORY,
  'cilindro-maestro': DIRECTCAR_DEFAULT_CATEGORY,
  'transmision': DIRECTCAR_DEFAULT_CATEGORY,
  'homocinetica-lado-rueda': DIRECTCAR_DEFAULT_CATEGORY,
  'rodamientos': DIRECTCAR_DEFAULT_CATEGORY,

  // ── Resto de categorías reales de DirectCar (todas autopartes) ──
  // Se mapean explícitamente al default para dejar la tabla completa y evitar
  // que queden como "sin match" al auditar.
  'barra': DIRECTCAR_DEFAULT_CATEGORY,
  'bomba-de-nafta': DIRECTCAR_DEFAULT_CATEGORY,
  'brazo': DIRECTCAR_DEFAULT_CATEGORY,
  'brazo-auxiliar': DIRECTCAR_DEFAULT_CATEGORY,
  'brazo-pitman': DIRECTCAR_DEFAULT_CATEGORY,
  'caballete-arbol-de-levas': DIRECTCAR_DEFAULT_CATEGORY,
  'caja-de-direccion-asistida-electricamente': DIRECTCAR_DEFAULT_CATEGORY,
  'caja-de-direccion-hidraulica': DIRECTCAR_DEFAULT_CATEGORY,
  'caja-de-direccion-mecanica': DIRECTCAR_DEFAULT_CATEGORY,
  'cilindro-esclavo': DIRECTCAR_DEFAULT_CATEGORY,
  'corona-de-arranque': DIRECTCAR_DEFAULT_CATEGORY,
  'cruceta': DIRECTCAR_DEFAULT_CATEGORY,
  'eje-de-balancin': DIRECTCAR_DEFAULT_CATEGORY,
  'homocinetica-lado-caja': DIRECTCAR_DEFAULT_CATEGORY,
  'horquilla-de-embrague': DIRECTCAR_DEFAULT_CATEGORY,
  'juego-juntas-motor': DIRECTCAR_DEFAULT_CATEGORY,
  'junta-tapa-de-cilindros': DIRECTCAR_DEFAULT_CATEGORY,
  'junta-tapas-de-valvulas': DIRECTCAR_DEFAULT_CATEGORY,
  'kit-de-embrague-volante-rigido': DIRECTCAR_DEFAULT_CATEGORY,
  'manguera-de-conexion': DIRECTCAR_DEFAULT_CATEGORY,
  'maza-de-ruedas': DIRECTCAR_DEFAULT_CATEGORY,
  'rodamiento-de-rueda': DIRECTCAR_DEFAULT_CATEGORY,
  'soporte-centro-cardan': DIRECTCAR_DEFAULT_CATEGORY,
  'soporte-tensor': DIRECTCAR_DEFAULT_CATEGORY,
  'tapas-de-cilindro': DIRECTCAR_DEFAULT_CATEGORY,
  'tensor-de-distribucion': DIRECTCAR_DEFAULT_CATEGORY,
  'tirante-trasero': DIRECTCAR_DEFAULT_CATEGORY,
  'tren-delantero6': DIRECTCAR_DEFAULT_CATEGORY,
  'triceta': DIRECTCAR_DEFAULT_CATEGORY,
  'valvula-control-de-aceite': DIRECTCAR_DEFAULT_CATEGORY,
  'valvulas-de-motor': DIRECTCAR_DEFAULT_CATEGORY,
  'volante-bimasa': DIRECTCAR_DEFAULT_CATEGORY,
};

/**
 * Dadas las categorías de un producto de DirectCar (array de {slug,...}),
 * devuelve el primer match contra nuestra tabla. Si ninguno matchea, devuelve
 * el default (repuestos de autos y camionetas).
 *
 * @param {{slug: string, name: string}[]} directcarCategories
 * @returns {{category: string, subCategory: string}}
 */
export function mapDirectcarCategories(directcarCategories = []) {
  for (const cat of directcarCategories) {
    const slug = cat?.slug;
    if (slug && DIRECTCAR_CATEGORY_MAP[slug]) {
      return DIRECTCAR_CATEGORY_MAP[slug];
    }
  }
  return { ...DIRECTCAR_DEFAULT_CATEGORY };
}
