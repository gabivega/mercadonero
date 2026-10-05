// Utils/referralTracker.js
//
// Captura y persistencia del referidor en el front.
//
// Cuando alguien entra a un enlace compartido con `?ref=<userId>` (o `?ref=<código>`),
// guardamos ese valor para atribuir la PRÓXIMA compra a quien compartió. El código
// NO se pierde al navegar (se guarda en localStorage con una ventana de tiempo),
// así el comprador puede recorrer el sitio y comprar más tarde sin perder la
// atribución.
//
// Seguridad/atribución: acá solo guardamos el id/código. La validación real
// (que sea un usuario existente, que no sea auto-referido, etc.) la hace el
// backend al crear la orden.

const STORAGE_KEY = "nero_referral";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

/**
 * Guarda el código de referidor capturado de la URL.
 * @param {string} value  id de usuario o código de referido
 */
export function saveReferral(value) {
  if (!value || typeof value !== "string") return;
  const clean = value.trim();
  if (!clean) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ value: clean, savedAt: Date.now() }),
    );
  } catch (e) {
    // localStorage podría estar bloqueado (modo privado estricto). No rompemos.
    console.warn("No se pudo guardar el referido:", e);
  }
}

/**
 * Devuelve el referidor guardado (si no expiró). null si no hay.
 */
export function getReferral() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.value || !parsed?.savedAt) return null;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

/**
 * Limpia el referidor guardado (tras atribuirlo a una orden, para no
 * arrastrarlo a compras futuras).
 */
export function clearReferral() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Lee el `?ref=` de una query string (o de window.location) y lo persiste.
 * Se llama al montar la app o la página de producto.
 * @param {string} [search]  query string, ej: "?ref=abc123"
 * @returns {string|null} el valor capturado, o null
 */
export function captureReferralFromUrl(search) {
  const query =
    typeof search === "string"
      ? search
      : typeof window !== "undefined"
        ? window.location.search
        : "";
  if (!query) return null;
  const params = new URLSearchParams(query);
  const ref = params.get("ref");
  if (ref) {
    saveReferral(ref);
    return ref.trim();
  }
  return null;
}
