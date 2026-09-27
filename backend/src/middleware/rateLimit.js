// backend/src/middleware/rateLimit.js
//
// RATE LIMITER EN MEMORIA (sin dependencias externas).
//
// Protege endpoints que consumen APIs pagas / con cuota (ej. Zipnova quote).
// Estrategia: ventana deslizante simple por clave (userId o IP) guardada en un
// Map en memoria.
//
// LIMITACIONES (aceptadas conscientemente):
//   - Al ser en memoria, NO se comparte entre instancias (si algún día se
//     escala horizontalmente, habrá que migrar a Redis). Hoy alcanza.
//   - Se limpia de forma perezosa al consultar (evita timers que impidan el
//     cierre del proceso).
//
// USO:
//   import { rateLimit } from "../middleware/rateLimit.js";
//   router.post("/quote", verifyPrivyToken, rateLimit({ windowMs, max }), handler);

/**
 * Crea un middleware Express de rate limiting en memoria.
 * @param {object} opts
 * @param {number} opts.windowMs - Tamaño de la ventana en ms.
 * @param {number} opts.max - Máximo de requests permitidos por ventana.
 * @param {string} [opts.message] - Mensaje a devolver al superar el límite.
 * @param {(req)=>string} [opts.keyGenerator] - Cómo identificar al cliente.
 * @param {boolean} [opts.skipFailed] - Si true, sólo cuentan requests exitosos (2xx).
 * @returns {import('express').RequestHandler}
 */
export function rateLimit({
  windowMs,
  max,
  message = "Demasiadas solicitudes. Intentá de nuevo en unos minutos.",
  keyGenerator,
  skipFailed = false,
} = {}) {
  // Map<clave, number[]> con los timestamps de cada request dentro de la ventana.
  const hits = new Map();

  const defaultKey = (req) =>
    // Preferimos el DID de Privy (ya inyectado por verifyPrivyToken).
    req.user?.did || req.ip || req.headers["x-forwarded-for"] || "unknown";

  const genKey = keyGenerator || defaultKey;

  // Limpieza perezosa: recorre y descarta entradas sin timestamps vigentes.
  const cleanup = (now) => {
    if (hits.size < 500) return; // umbral: no romper con volúmenes chicos
    for (const [k, arr] of hits.entries()) {
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(k);
      else hits.set(k, fresh);
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    const key = genKey(req);

    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);

    if (arr.length >= max) {
      const oldest = arr[0];
      const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, message });
    }

    // Registramos el intento ya; si skipFailed, lo quitamos en caso de error.
    const idx = arr.length;
    arr.push(now);
    hits.set(key, arr);
    cleanup(now);

    if (skipFailed) {
      res.on("finish", () => {
        // Si la respuesta NO fue 2xx, no lo contamos.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const cur = hits.get(key);
          if (cur && cur.length === idx + 1) {
            cur.pop();
            hits.set(key, cur);
          }
        }
      });
    }

    next();
  };
}
