/**
 * Utilidades de códigos postales de Argentina.
 *
 * Fuente de datos: `src/data/codigosPostales.json` (generado por
 * `npm run build:cp` a partir de codigos-postales-argentina.xls).
 *
 * API principal:
 *   - existeCP(cp)                    -> bool
 *   - getProvinciasLocalidades(cp)    -> Array<{ provincia, localidad }>
 *   - getProvincia(cp)                -> string | "" (provincia dominante)
 *   - getLocalidades(cp)              -> string[]
 *   - buscarLocalidad(texto, limit)   -> Array<{ cp, provincia, localidad }>  (autocomplete inverso)
 *   - PROVINCIAS_AR                   -> lista canónica de provincias
 *   - normalizarProvincia(prov)       -> término canónico
 *   - toZipnovaState(prov)            -> nombre que espera Zipnova
 *
 * Notas:
 *   - Todos los CP son de 4 dígitos (sistema viejo de Argentina).
 *   - La fuente trae provincias sin tildes y con mayúsculas mixtas
 *     ("Entre Rios", "Cordoba"). `normalizarProvincia` las mapea al
 *     término canónico (con tilde) para mostrar al usuario.
 */

import data from "../data/codigosPostales.json";

const CP_MAP = data?.cp || {};

// ─────────────────────────────────────────────────────────────
// Provincias
// ─────────────────────────────────────────────────────────────

/** Lista canónica de provincias (nombres de display, con tildes). */
export const PROVINCIAS_AR = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

/** Quita tildes y pasa a minúsculas para comparar provincias. */
const slugProvincia = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Mapa de la fuente (.xls) -> término canónico de display.
 * La fuente escribe "Capital Federal" para CABA y omite tildes.
 */
const FUENTE_A_CANONICA = {
  "capital federal": "CABA",
  caba: "CABA",
  "ciudad autonoma de buenos aires": "CABA",
  "buenos aires": "Buenos Aires",
  "entre rios": "Entre Ríos",
  cordoba: "Córdoba",
  "santiago del estero": "Santiago del Estero",
  "rio negro": "Río Negro",
  neuquen: "Neuquén",
  tucuman: "Tucumán",
  "tierra del fuego": "Tierra del Fuego",
};

/**
 * Normaliza una provincia al término canónico de display.
 * Acepta variantes ("Capital Federal", "caba", "Cordoba", "CÓRDOBA"...).
 * Si no la reconoce, devuelve el string original con trim.
 */
export function normalizarProvincia(prov) {
  const slug = slugProvincia(prov);
  if (!slug) return "";
  if (FUENTE_A_CANONICA[slug]) return FUENTE_A_CANONICA[slug];
  // Match contra la lista canónica (sin tildes).
  const found = PROVINCIAS_AR.find((p) => slugProvincia(p) === slug);
  return found || String(prov).trim();
}

/**
 * Nombre de provincia que espera Zipnova en `destination.state`.
 * Zipnova usa "CABA" para Ciudad de Buenos Aires (no "Capital Federal").
 */
export function toZipnovaState(prov) {
  return normalizarProvincia(prov);
}

// ─────────────────────────────────────────────────────────────
// Consultas por CP
// ─────────────────────────────────────────────────────────────

/** Normaliza un CP a 4 dígitos (o ""). */
export function normalizarCP(cp) {
  const digits = String(cp ?? "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

/** ¿Existe el CP en la base? (exige 4 dígitos válidos). */
export function existeCP(cp) {
  const key = normalizarCP(cp);
  return key !== "" && Object.prototype.hasOwnProperty.call(CP_MAP, key);
}

/**
 * Devuelve todas las entradas [provincia, localidad] de un CP,
 * normalizando la provincia al término canónico.
 * @returns {Array<{ provincia: string, localidad: string }>}
 */
export function getProvinciasLocalidades(cp) {
  const key = normalizarCP(cp);
  const raw = CP_MAP[key];
  if (!raw) return [];
  return raw.map(([provincia, localidad]) => ({
    provincia: normalizarProvincia(provincia),
    localidad,
  }));
}

/**
 * Provincia dominante de un CP. Como un CP puede cubrir varias
 * localidades de una misma provincia, tomamos la más frecuente;
 * en empate, la primera. Devuelve "" si el CP no existe.
 */
export function getProvincia(cp) {
  const list = getProvinciasLocalidades(cp);
  if (list.length === 0) return "";
  const count = new Map();
  for (const { provincia } of list) {
    count.set(provincia, (count.get(provincia) || 0) + 1);
  }
  let best = "";
  let bestN = -1;
  for (const [prov, n] of count) {
    if (n > bestN) {
      best = prov;
      bestN = n;
    }
  }
  return best;
}

/**
 * Provincias (únicas) en las que aparece un CP, ordenadas por cantidad de
 * localidades (desc) y luego alfabéticamente. La primera es la "dominante".
 * Un CP puede repetirse entre provincias (ej: 6300 → La Pampa y San Luis),
 * por eso exponemos todas para que el usuario elija.
 * @returns {string[]}
 */
export function getProvincias(cp) {
  const list = getProvinciasLocalidades(cp);
  if (list.length === 0) return [];
  const count = new Map();
  for (const { provincia } of list) {
    count.set(provincia, (count.get(provincia) || 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([prov]) => prov);
}

/**
 * Localidades (únicas) de un CP, ordenadas. Opcionalmente filtra por provincia.
 * @returns {string[]}
 */
export function getLocalidades(cp, provinciaFiltro) {
  const filtro = provinciaFiltro ? normalizarProvincia(provinciaFiltro) : null;
  const seen = new Set();
  const out = [];
  for (const { provincia, localidad } of getProvinciasLocalidades(cp)) {
    if (filtro && provincia !== filtro) continue;
    if (!seen.has(localidad)) {
      seen.add(localidad);
      out.push(localidad);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────────────────────
// Búsqueda inversa (por nombre de localidad) — autocomplete
// ─────────────────────────────────────────────────────────────

// Índice localidad -> entradas, construido lazy la primera vez que se usa.
let _inverseIndex = null;
function buildInverseIndex() {
  if (_inverseIndex) return _inverseIndex;
  const idx = [];
  for (const cp of Object.keys(CP_MAP)) {
    for (const [provincia, localidad] of CP_MAP[cp]) {
      idx.push({
        cp,
        provincia: normalizarProvincia(provincia),
        localidad,
        // clave normalizada para comparar (sin tildes, minúsculas).
        _key: slugProvincia(localidad),
      });
    }
  }
  _inverseIndex = idx;
  return idx;
}

/**
 * Busca localidades cuyo nombre empiece con / contenga `texto`.
 * @param {string} texto
 * @param {{ limit?: number, prefijo?: boolean }} [opts]
 * @returns {Array<{ cp: string, provincia: string, localidad: string }>}
 */
export function buscarLocalidad(texto, opts = {}) {
  const { limit = 10, prefijo = true } = opts;
  const q = slugProvincia(texto);
  if (q.length < 2) return [];

  const idx = buildInverseIndex();
  const exactas = [];
  const incluye = [];

  for (const entry of idx) {
    if (entry._key.startsWith(q)) exactas.push(entry);
    else if (!prefijo && entry._key.includes(q)) incluye.push(entry);
    if (exactas.length >= limit) break;
  }

  const out = [...exactas, ...incluye].slice(0, limit);
  // Limpiamos la clave interna antes de devolver.
  return out.map(({ cp, provincia, localidad }) => ({
    cp,
    provincia,
    localidad,
  }));
}

export default {
  PROVINCIAS_AR,
  normalizarProvincia,
  toZipnovaState,
  normalizarCP,
  existeCP,
  getProvinciasLocalidades,
  getProvincia,
  getProvincias,
  getLocalidades,
  buscarLocalidad,
};
