import axios from "axios";
import * as cheerio from "cheerio";

// User-Agent de navegador moderno para evitar bloqueos básicos
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const http = axios.create({
  timeout: 25000,
  headers: {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ar,es;q=0.9,en;q=0.8",
  },
});

const textOf = ($el) => ($el ? $el.text().trim() : "");

/** Convierte un string de precio "1.259,99" o "125999" a Number (125999.99) */
const parsePrice = (raw) => {
  if (raw == null) return null;
  let str = String(raw).trim();
  if (!str) return null;
  // Quitamos todo lo que no sea número, coma o punto
  str = str.replace(/[^\d.,]/g, "");
  if (!str) return null;

  // Detectamos el formato latino (1.259,99) vs inglés (1,259.99)
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  let clean = str.replace(/\./g, "").replace(",", ".");
  // Si había coma y punto, el punto era de miles -> sin procesar
  if (hasComma && hasDot) {
    clean = str.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // Sólo coma => separador decimal
    clean = str.replace(",", ".");
  }
  // Si sólo punto => podría ser miles (1.259) o decimal (1.25). Asumimos miles en ML.
  else if (hasDot && !hasComma) {
    clean = str.replace(/\./g, "");
  }

  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
};

/** Obtener el JSON de window.__PRELOADED_STATE__ desde los scripts */
const extractPreloadedState = (html) => {
  const match = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*<\/script>/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

/** Recursivamente busca en el JSON preloaded la data de un item de producto */
const findItemInPreloaded = (obj, depth = 0) => {
  if (!obj || typeof obj !== "object" || depth > 8) return null;

  if (typeof obj === "string") return null;

  // Un nodo candidato suele tener title + price + pictures juntos
  if (
    obj.title &&
    (obj.price || obj.price_per_line || obj.pictures || obj.attributes)
  ) {
    return obj;
  }

  for (const key of Object.keys(obj)) {
    const found = findItemInPreloaded(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
};

/**
 * Scrapea la página pública de un producto de Mercado Libre.
 * @returns {Promise<{
 *   title:string, description:string, price:number, condition:string,
 *   category:string, brand:?string, attributes:Array<{key,value}>,
 *   images:string[], currency:string
 * }>}
 */
export async function scrapeMercadoLibreProduct(url) {
  if (!url || typeof url !== "string") {
    throw createError(400, "Debés enviar una URL válida de Mercado Libre.");
  }

  const { data: html } = await http.get(url);
  const $ = cheerio.load(html);
  let titleFallback = "";

  // ---- Extracción principal desde el DOM ----
  const title =
    textOf($(".ui-pdp-title")) || $('meta[property="og:title"]').attr("content") || "";

  let price =
    parsePrice(textOf($(".ui-pdp-price__second-line .andes-money-amount__fraction"))) ??
    parsePrice(textOf($('[data-testid="price-part"] .andes-money-amount__fraction')));

  const description = textOf($(".ui-pdp-description__content"));
  const condition = textOf($(".ui-pdp-subtitle"));

  // Categoría: primer link del breadcrumb
  const category =
    $(".andes-breadcrumb__item .andes-breadcrumb__link").first().text().trim() || "";

  // Moneda
  const currency =
    $(".ui-pdp-price__second-line .andes-money-amount__currency").attr("data-currency") ||
    $('[data-testid="price-part"] .andes-money-amount__currency').attr("data-currency") ||
    "ARS";

  // Imágenes: carrusel de la galería
  const images = [];
  $(".ui-pdp-gallery__wrapper img").each((_, el) => {
    const src =
      $(el).attr("data-zoom") || $(el).attr("data-src-set") || $(el).attr("src");
    if (src && !images.includes(src)) images.push(src);
  });

  // Atributos / ficha técnica
  const attributes = [];
  $(".ui-vpp-striped-specs__row").each((_, el) => {
    const key = textOf($(el).find(".ui-vpp-striped-specs__label"));
    const value = textOf($(el).find(".ui-vpp-striped-specs__value"));
    if (key && value) attributes.push({ key, value });
  });
  if (attributes.length === 0) {
    // Fallback tabla alternativa
    $(".ui-pdp-specs__table__column").each((_, el) => {
      const key = textOf($(el).find(".ui-pdp-specs__table__label"));
      const value = textOf($(el).find(".ui-pdp-specs__table__value"));
      if (key && value) attributes.push({ key, value });
    });
  }

  // ---- Fallback de seguridad con __PRELOADED_STATE__ ----
  let fromPreloaded = null;
  if (!title || price == null) {
    const preloaded = extractPreloadedState(html);
    if (preloaded) {
      fromPreloaded = findItemInPreloaded(preloaded);
      if (fromPreloaded) {
        const t = textOf($(fromPreloaded.title_html || ""));
        if (!title) {
          const fallbackTitle =
            (fromPreloaded.title_html &&
              cheerio.load(fromPreloaded.title_html).root().text().trim()) ||
            fromPreloaded.title ||
            "";
          if (fallbackTitle) titleFallback = fallbackTitle;
        }
        if (price == null) {
          const maybePrice =
            fromPreloaded.price ||
            fromPreloaded.price_per_line?.fraction ||
            fromPreloaded.non_mercado_pago_price;
          price = parsePrice(maybePrice);
        }
        if (images.length === 0 && Array.isArray(fromPreloaded.pictures)) {
          for (const pic of fromPreloaded.pictures) {
            if (pic.url && !images.includes(pic.url)) images.push(pic.url);
          }
        }
      }
    }
  }

  let titleFinal = title || titleFallback || "";

  // ---- Procesar imágenes a máxima resolución ----
  const highResImages = images
    .map((src) => {
      const clean = src.replace(/\?.*$/, "");
      // Reemplazar sufijos de miniatura por alta resolución
      if (/-\w\.jpg$/i.test(clean)) {
        return clean.replace(/-\w\.jpg$/i, "-F.jpg");
      }
      return clean.endsWith(".jpg") ? clean : `${clean}-F.jpg`;
    })
    .filter(Boolean);

  // Limits de seguridad
  if (!titleFinal || price == null) {
    throw createError(
      422,
      "No pudimos extraer el título o el precio desde esa página. Verificá que sea un link de producto válido de Mercado Libre."
    );
  }

  const brand =
    attributes.find((a) => a.key.toLowerCase() === "marca")?.value || "Genérico";

  return {
    title: titleFinal,
    description,
    price,
    currency: currency || "ARS",
    condition,
    category,
    brand,
    attributes,
    images: highResImages.filter(Boolean),
  };
}

function createError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function httpErrorStatus(err) {
  return err?.status || 500;
}
