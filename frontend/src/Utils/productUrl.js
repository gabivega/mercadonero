/**
 * Construcción de URLs SEO-friendly para productos.
 *
 * Formato (estándar e-commerce):
 *   /producto/<slug>
 *   ej: /producto/consola-gaming-rog-ally-rc73ya-20ky5u
 *
 * El `slug` lo genera el backend (nombre + sufijo derivado del ObjectId) y
 * viaja en cada producto. Si por algún motivo el producto todavía no tiene
 * slug (registros previos a la migración), caemos al `_id` para no romper
 * ningún enlace.
 */

/**
 * Devuelve el segmento de URL de un producto: su slug si existe, o su _id.
 */
export const productSlugSegment = (product) => {
  if (!product) return "";
  return product.slug || product._id || "";
};

/**
 * Devuelve la ruta relativa para navegar (react-router): "/producto/<slug>".
 */
export const productPath = (product) => {
  const seg = productSlugSegment(product);
  return seg ? `/producto/${seg}` : "/";
};

/**
 * Devuelve la URL absoluta (para <a href>, compartir, canonical, etc).
 * @param {object} product
 * @param {string} [origin] Dominio base. Por defecto usa window.location.origin.
 */
export const productUrl = (product, origin) => {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "https://mercadonero.com");
  const seg = productSlugSegment(product);
  return seg ? `${base}/producto/${seg}` : base;
};
