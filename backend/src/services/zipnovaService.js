// backend/src/services/zipnovaService.js
//
// SERVICIO DE LOGÍSTICA — ZIPNOVA (antiguo Zippin) ENVÍOS.
//
// Integración mínima para COTIZAR envíos.
//   POST /v2/shipments/quote
//
// AUTENTICACIÓN (Basic):
//   Header  Authorization: Basic base64(API_TOKEN:API_SECRET)
//   Las credenciales viven SOLO en el backend (por seguridad).
//
// DOCS:
//   https://docs.zipnova.com/envios/recursos-api/envios/cotizar-envios
//   https://docs.zipnova.com/envios/principios/urls-y-autenticacion
//
// CONVENCIONES DE UNIDADES:
//   - Peso: gramos.
//   - Dimensiones (alto/ancho/largo): centímetros.
//   - declared_value y precios: ARS.
//
// VARIABLES DE ENTORNO REQUERIDAS (.env del backend):
//   ZIPNOVA_API_BASE   -> default: https://api.zipnova.com.ar/v2
//                        (Chile: https://api.zipnova.cl/v2 | México: https://api.zipnova.com.mx/v2)
//   ZIPNOVA_API_TOKEN  -> API Token de la cuenta
//   ZIPNOVA_API_SECRET -> API Secret de la cuenta
//   ZIPNOVA_ACCOUNT_ID -> ID de la cuenta Zipnova (ej. 1234)
//   ZIPNOVA_ORIGIN_ID  -> (opcional) ID del address book de origen por defecto
//   ZIPNOVA_SOURCE     -> (opcional) identificador de tu integración (ej. "mercadonero")
//

const DEFAULT_BASE = "https://api.zipnova.com.ar/v2";

/** @returns {string} base URL de la API de Zipnova (sin slash final). */
function apiBase() {
  return (process.env.ZIPNOVA_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Construye el header Authorization Basic a partir de token/secret.
 * @param {string} token
 * @param {string} secret
 * @returns {string}
 */
function basicAuthHeader(token, secret) {
  const raw = `${token}:${secret}`;
  const b64 = Buffer.from(raw, "utf-8").toString("base64");
  return `Basic ${b64}`;
}

/**
 * Indica si las credenciales mínimas están configuradas en el entorno.
 * @returns {{ok:boolean, missing:string[]}}
 */
export function zipnovaConfigStatus() {
  const missing = [];
  if (!process.env.ZIPNOVA_API_TOKEN) missing.push("ZIPNOVA_API_TOKEN");
  if (!process.env.ZIPNOVA_API_SECRET) missing.push("ZIPNOVA_API_SECRET");
  if (!process.env.ZIPNOVA_ACCOUNT_ID) missing.push("ZIPNOVA_ACCOUNT_ID");
  return { ok: missing.length === 0, missing, base: apiBase() };
}

/**
 * Convierte un valor a entero redondeando HACIA ARRIBA.
 * Zipnova exige enteros en peso y dimensiones (ej. width/length must be an
 * integer). Redondeamos para arriba para no subestimar el bulto: es preferible
 * un centímetro/gramo de más que una tarifa mal calculada.
 * Devuelve `null` si el valor no es un número finito (así lo omitimos).
 * @param {*} v
 * @returns {number|null}
 */
function ceilInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.ceil(n);
}

/**
 * Limpia/normaliza un item o package asegurando tipos numéricos.
 * Deja pasar solo las keys permitidas para no enviar basura a la API.
 * Peso y dimensiones se redondean hacia arriba y deben ser enteros ≥ 0.
 */
function sanitizeItem(it = {}) {
  const out = {};
  if (it.sku != null && it.sku !== "") out.sku = String(it.sku);

  const weight = ceilInt(it.weight);
  if (weight != null) out.weight = weight;

  const height = ceilInt(it.height);
  if (height != null) out.height = height;

  const width = ceilInt(it.width);
  if (width != null) out.width = width;

  const length = ceilInt(it.length);
  if (length != null) out.length = length;

  // classification_id: Zipnova lo usa para agrupar/tarifar. Default "general".
  out.classification_id = it.classification_id != null ? it.classification_id : "general";
  if (it.description != null) out.description = String(it.description);
  if (it.must_keep_vertical != null) out.must_keep_vertical = Boolean(it.must_keep_vertical);
  return out;
}

/**
 * Construye el body de la cotización a partir de un payload "crudo" del front,
 * aplicando defaults y limpieza. Solo incluye lo que venga definido.
 * @param {object} input
 * @returns {object} body listo para POST /shipments/quote
 */
function buildQuoteBody(input = {}) {
  const {
    account_id,
    origin_id,
    source,
    declared_value,
    destination = {},
    items,
    packages,
    type_packaging,
    logistic_type,
    service_type,
    sort_by,
    avoid_rules,
    include_dropoff_points,
  } = input;

  const body = {};

  body.account_id = Number(account_id ?? process.env.ZIPNOVA_ACCOUNT_ID);

  // origin_id es OPCIONAL: si se omite, Zipnova usa el origen por defecto de
  // la cuenta. Sólo lo enviamos si es un número válido > 0; así evitamos el
  // error "the selected origin id is invalid" cuando el .env trae un valor
  // vacío / no numérico / placeholder.
  const rawOrigin = origin_id ?? process.env.ZIPNOVA_ORIGIN_ID;
  const originNum = Number(rawOrigin);
  if (rawOrigin != null && rawOrigin !== "" && Number.isFinite(originNum) && originNum > 0) {
    body.origin_id = originNum;
  }

  body.source = source || process.env.ZIPNOVA_SOURCE || "mercadonero";

  body.declared_value = Number(declared_value ?? 0);

  // destination: solo keys válidas y no vacías.
  const dest = {};
  for (const k of ["city", "state", "zipcode", "street", "street_number", "id"]) {
    if (destination[k] != null && destination[k] !== "") dest[k] = destination[k];
  }
  if (Object.keys(dest).length) body.destination = dest;

  // items vs packages: usar UNO u OTRO, nunca ambos.
  if (Array.isArray(items) && items.length) {
    body.items = items.map(sanitizeItem);
  } else if (Array.isArray(packages) && packages.length) {
    body.packages = packages.map(sanitizeItem);
  }

  if (type_packaging) body.type_packaging = type_packaging;
  if (logistic_type) body.logistic_type = logistic_type;
  if (service_type) body.service_type = service_type;
  if (sort_by) body.sort_by = sort_by;
  if (avoid_rules != null) body.avoid_rules = Boolean(avoid_rules);
  if (include_dropoff_points != null) body.include_dropoff_points = Number(include_dropoff_points);

  return body;
}

/**
 * Cotiza un envío contra la API de Zipnova.
 * @param {object} input - payload crudo (ver buildQuoteBody).
 * @returns {Promise<{success:boolean, data?:object, status?:number, error?:string}>}
 */
export async function quoteShipment(input) {
  const cfg = zipnovaConfigStatus();
  if (!cfg.ok) {
    return {
      success: false,
      error: `Faltan credenciales de Zipnova: ${cfg.missing.join(", ")}`,
    };
  }

  const body = buildQuoteBody(input);

  // Validaciones mínimas locales para dar buenos mensajes antes de ir a la API.
  if (!body.destination) {
    return { success: false, error: "Falta 'destination' (ciudad y provincia mínimo)." };
  }
  if (!body.items && !body.packages) {
    return { success: false, error: "Debes enviar 'items' o 'packages' (no ambos)." };
  }

  const url = `${apiBase()}/shipments/quote`;
  const auth = basicAuthHeader(
    process.env.ZIPNOVA_API_TOKEN,
    process.env.ZIPNOVA_API_SECRET,
  );

  // 🐞 DEBUG: log del request que enviamos a Zipnova (sin credenciales).
  if (process.env.ZIPNOVA_DEBUG === "true") {
    console.log("[Zipnova] → REQUEST", url);
    console.log("[Zipnova] → BODY", JSON.stringify(body, null, 2));
    console.log(
      "[Zipnova] → ENV origin_id:",
      process.env.ZIPNOVA_ORIGIN_ID,
      "| account_id:",
      process.env.ZIPNOVA_ACCOUNT_ID,
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    // 🐞 DEBUG: log de la respuesta cruda de Zipnova.
    if (process.env.ZIPNOVA_DEBUG === "true") {
      console.log("[Zipnova] ← STATUS", res.status);
      console.log("[Zipnova] ← BODY", JSON.stringify(data, null, 2));
    }

    if (!res.ok) {
      // 400 datos inválidos / cuenta inactiva · 403 sin permiso · 422 validación
      return {
        success: false,
        status: res.status,
        error:
          data?.message ||
          data?.error ||
          `Zipnova respondió ${res.status}`,
        // Propagamos el detalle de validación de Laravel/Zipnova si viene.
        details: data?.details || data?.errors || null,
        data,
      };
    }

    return { success: true, status: res.status, data, request: body };
  } catch (error) {
    console.error("[Zipnova] Error cotizando envío:", error.message);
    return { success: false, error: error.message };
  }
}

export { buildQuoteBody, apiBase };
