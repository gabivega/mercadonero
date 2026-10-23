/**
 * Utilidades para la construcción de URLs amigables para SEO.
 *
 * Estrategia (estándar actual para e-commerce):
 *   /producto/<slug-del-titulo>-<sufijo-corto>
 *   ej: /producto/consola-gaming-rog-ally-rc73ya-20ky5u
 *
 * - El slug del título es 100% indexable y legible por buscadores.
 * - El sufijo corto (derivado del ObjectId de Mongo) garantiza UNICIDAD
 *   sin exponer el id completo ni romper enlaces si el título cambia:
 *   aunque el vendedor edite el nombre, el sufijo sigue resolviendo el
 *   producto, y el slug del título puede actualizarse sin perder tráfico.
 *
 * Nota: los buscadores (Google) tratan el slug como "palabra clave" y los
 * guiones como separadores de palabras, por eso NO se usan acentos ni
 * caracteres especiales.
 */

// Palabras que no aportan valor SEO y que se pueden descartar si el título
// es muy largo (stopwords). Se mantienen en el slug si caben.
const MAX_SLUG_LENGTH = 70;

/**
 * Convierte un texto en un PATRÓN de regex tolerante a acentos, para búsquedas
 * que no dependen de si el usuario escribió con o sin tildes.
 *
 * Ej: "bujia" -> "b[uúü]j[ií]a"
 *     "telefono" -> "t[eé]l[eé]fono"
 *
 * Cada vocal (incluida la variante acentuada y la diéresis) se reemplaza por
 * una clase de caracteres que matchea TODAS sus formas. La "ñ" matchea "ñ" o
 * "n". El resto de los caracteres se escapan para que no rompan la regex.
 * (La "i" mayúscula con punto y los dígitos/símbolos se dejan literales.)
 */
export const accentInsensitivePattern = (text = "") => {
  const accentMap = {
    a: "[aáàäâ]",
    e: "[eéèëê]",
    i: "[iíìïî]",
    o: "[oóòöô]",
    u: "[uúùüû]",
    n: "[nñ]",
  };

  // Recorremos el texto YA en minúsculas carácter por carácter. Escapamos los
  // que sean especiales para regex y traducimos las vocales acentuables.
  return String(text)
    .toLowerCase()
    .split("")
    .map((ch) => {
      if (accentMap[ch]) return accentMap[ch];
      // El resto de caracteres especiales de regex se escapan para que un
      // término como "12.5" o "c++" no rompa ni altere la query.
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
};

/**
 * Convierte un texto libre en un slug SEO-friendly.
 * - Quita acentos y diacríticos.
 * - Minúsculas.
 * - Reemplaza cualquier cosa que no sea [a-z0-9] por guiones.
 * - Colapsa guiones repetidos y los recorta de los extremos.
 */
export const slugify = (text = "") => {
  return String(text)
    .normalize("NFD") // Descompone acentos (á -> a + combining)
    .replace(/[\u0300-\u036f]/g, "") // Elimina los diacríticos
    .replace(/ñ/gi, "n") // La ñ no se descompone en NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Quita todo salvo letras, números, espacios y guiones
    .replace(/[\s-]+/g, "-") // Espacios y guiones repetidos -> un guión
    .replace(/^-+|-+$/g, ""); // Recorta guiones de los extremos
};

/**
 * Genera un sufijo corto y estable a partir del ObjectId de Mongo.
 * Usa los últimos 6 caracteres hex del id + los 2 primeros para reducir
 * colisiones, resultando en ~8 chars legibles (usamos base36 para acortar).
 */
export const shortSuffix = (id = "") => {
  const raw = String(id);
  if (!raw) return "";
  // Tomamos 8 caracteres hex de la parte menos significativa del ObjectId
  // (los últimos son los más variables) y los pasamos a base36.
  const lastHex = raw.slice(-12);
  const n = parseInt(lastHex || "0", 16);
  return Number.isFinite(n) ? n.toString(36).padStart(6, "0") : raw.slice(-6);
};

/**
 * Construye el slug completo de un producto: "<titulo>-<sufijo>".
 * @param {string} name  Título del producto.
 * @param {string} id    ObjectId (string) del producto. Puede ser vacío al
 *                       crear (se aplica post-save).
 * @param {string} [suffix] Sufijo ya calculado (para evitar recalcular).
 */
export const buildProductSlug = (name, id, suffix) => {
  let base = slugify(name);

  // Truncamos respetando límite de palabras (no cortar a mitad de palabra).
  if (base.length > MAX_SLUG_LENGTH) {
    base = base.slice(0, MAX_SLUG_LENGTH);
    const lastDash = base.lastIndexOf("-");
    if (lastDash > 20) base = base.slice(0, lastDash);
  }
  if (!base) base = "producto";

  const sfx = suffix || shortSuffix(id);
  return sfx ? `${base}-${sfx}` : base;
};

/**
 * Extrae el sufijo de un slug dado (lo que va después del último guión).
 * Útil para consultar por slug derivando el ObjectId si fuese necesario.
 */
export const extractSuffix = (slug = "") => {
  const parts = String(slug).split("-");
  return parts.length ? parts[parts.length - 1] : "";
};

