// services/referralKitService.js
//
// GENERADOR DE KITS PROMOCIONALES para compartir productos.
//
// ¿Qué hace? Toma un producto + su enlace corto de referido y devuelve un
// Buffer de imagen (JPEG) listo para redes sociales (cuadrado 1080x1080, que
// no se recorta en el timeline de X).
//
// ⚠️ IMPORTANTE — ¿A QUIÉN LE HABLA LA IMAGEN?
// La imagen la ve el POTENCIAL COMPRADOR, no el afiliado. Aunque quien la
// descarga sea el referidor, el mensaje tiene que venderle a la persona que
// la ve en el feed. Por eso NUNCA mostramos "ganás X por venta": mostramos
// precio, compra protegida, pago cripto, envío nacional y el REINTEGRO EN USD
// que se lleva el comprador.
//
// ¿Cómo? 100% local, sin IA generativa ni servicios externos de render:
//   1. Armamos un SVG con TODO el diseño (fondo, gradientes, tipografía,
//      frame de la foto, badges, textos). SVG = vector, nítido y determinístico.
//   2. Lo rasterizamos con `sharp` (librsvg embebido).
//   3. Superponemos con `composite()` la FOTO del producto y el QR del enlace.
//
// ⚠️ SEGURIDAD: la foto del producto SIEMPRE se toma de `product.images`
// (MongoDB), NUNCA de una URL que mande el cliente. Eso corta el vector de
// SSRF: un afiliado no puede hacer que lancemos un fetch a una URL arbitraria.
import sharp from "sharp";
import QRCode from "qrcode";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

// ── Configuración de la plantilla ────────────────────────────────────────
// Cuadrada (1080x1080): el cuadrado es el formato que mejor se ve tanto en
// timeline como en cards, sin recortes.
export const KIT_SIZE = 1080;

// Máximo de bytes que aceptamos bajar para la foto (techo anti-abuso).
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 10000;

// Colores de marca (mismos que usa el front: #F26722 es el naranja de Nero).
const BRAND = "#F26722";
const BRAND_SOFT = "#ff8a3d";
const BG_DARK = "#0b0b0f";
const BG_DARK_2 = "#1a0f16";

// ── TIPOGRAFÍA ───────────────────────────────────────────────────────────
// librsvg/pango embebe webfonts (@font-face con data URI) y eso nos deja usar
// Poppins verdadera, idéntica a la del front, sin depender de que el sistema
// tenga la fuente instalada (en el VPS Linux casi seguro no la tiene y el
// render caería a DejaVu Sans -> el kit se vería "barato").
//
// La fuente se cachea EN DISCO para que sobreviva a un restart del server.
const FONT_CACHE_DIR = path.join(process.cwd(), "storage", "fonts");
const FONT_CDN = "https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest";
const FONT_WEIGHTS = {
  500: "latin-500-normal",
  700: "latin-700-normal",
  800: "latin-800-normal",
};

// Cache en memoria de la data URI ya armada. Evita leer el disco en cada
// request; el disco es solo la persistencia entre reinicios.
const fontDataUriCache = new Map(); // weight -> string | null

/**
 * Devuelve la data URI `data:font/ttf;base64,...` de Poppins para un peso.
 * - Baja el TTF del CDN (una sola vez, y lo cachea en disco).
 * - Si CUALQUIER paso falla, devuelve null y el template cae a las fuentes
 *   del sistema: nunca rompemos el kit por una fuente.
 *
 * @param {500|700|800} weight
 * @returns {Promise<string|null>}
 */
async function getFontDataUri(weight) {
  if (fontDataUriCache.has(weight)) return fontDataUriCache.get(weight);

  const filePath = path.join(FONT_CACHE_DIR, `poppins-${weight}.ttf`);

  try {
    let ttf = null;

    // 1) Cache en disco (persiste entre reinicios).
    //    `readFile` lanza ENOENT si no existe: eso es NORMAL, no un error.
    try {
      ttf = await fs.readFile(filePath);
    } catch {
      ttf = null;
    }

    // 2) CDN.
    if (!ttf) {
      const url = `${FONT_CDN}/${FONT_WEIGHTS[weight]}.ttf`;
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: { "User-Agent": "MercadoNero-Kit/1.0" },
      });
      ttf = Buffer.from(res.data);

      // Persistimos para no volver a bajarla. Si el FS es de solo lectura
      // (contenedor efímero), seguimos igual: la tenemos en memoria.
      try {
        await fs.mkdir(FONT_CACHE_DIR, { recursive: true });
        await fs.writeFile(filePath, ttf);
      } catch (e) {
        console.warn(
          "[ReferralKit] No pude cachear la fuente en disco (sigo con memoria):",
          e.message,
        );
      }
    }

    const dataUri = `data:font/ttf;base64,${ttf.toString("base64")}`;
    fontDataUriCache.set(weight, dataUri);
    return dataUri;
  } catch (e) {
    console.warn(
      `[ReferralKit] No pude preparar la fuente Poppins ${weight} (uso la del sistema):`,
      e.message,
    );
    // Cacheamos el fallo para no reintentar en cada request.
    fontDataUriCache.set(weight, null);
    return null;
  }
}

/**
 * Devuelve el bloque <style> con los @font-face de la familia "KitFont".
 * Si ninguna fuente se pudo preparar, devuelve "" y el SVG usa la familia
 * de fallback.
 */
async function getFontStyleBlock() {
  const uris = await Promise.all(
    Object.keys(FONT_WEIGHTS).map(async (w) => [
      w,
      await getFontDataUri(Number(w)),
    ]),
  );
  const faces = uris
    .filter(([, uri]) => Boolean(uri))
    .map(
      ([w, uri]) =>
        `@font-face{font-family:'KitFont';font-weight:${w};font-style:normal;src:url('${uri}') format('truetype');}`,
    );
  if (!faces.length) return "";
  return `<style>${faces.join("")}</style>`;
}

// ── LOGO DE LA MARCA ─────────────────────────────────────────────────────
// Lo leemos del repo del frontend (es el asset oficial) y lo cacheamos como
// data URI. Si falla, el template cae al wordmark vectorial.
//
// ⚠️ Usamos la versión "NARANJA & N" (1695x355, con alpha): es la pensada
// para FONDOS OSCUROS, que es justo el del kit. La "full-white" se perdía
// contra el fondo y además el logo quedaba chico.
const LOGO_CANDIDATES = [
  path.join(
    process.cwd(),
    "..",
    "frontend",
    "public",
    "assets",
    "img",
    "MERCADO NERO NARANJA&N 1.png",
  ),
  path.join(
    process.cwd(),
    "..",
    "frontend",
    "public",
    "assets",
    "img",
    "mercado-nero-logo-full-white.png",
  ),
  path.join(process.cwd(), "assets", "mercado-nero-logo-full-white.png"),
];
let logoDataUriCache; // undefined = no intentado, null = falló, string = ok
let logoAspect; // ancho/alto real del logo cargado (para no deformarlo)

async function getLogoDataUri() {
  if (logoDataUriCache !== undefined) return logoDataUriCache;

  for (const candidate of LOGO_CANDIDATES) {
    try {
      const buf = await fs.readFile(candidate);
      // Validamos que sharp pueda leerlo antes de confiar en el archivo y
      // guardamos el aspect ratio real: los assets vienen en proporciones
      // distintas (1695x355 vs 500x80) y no queremos estirar ninguno.
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) continue;
      logoAspect = meta.width / meta.height;
      logoDataUriCache = `data:image/png;base64,${buf.toString("base64")}`;
      return logoDataUriCache;
    } catch {
      // Siguiente candidato.
    }
  }

  console.warn(
    "[ReferralKit] No encontre el logo de la marca; uso el wordmark vectorial.",
  );
  logoDataUriCache = null;
  return null;
}

/**
 * Descarga la foto del producto desde su URL de Cloudinary.
 * Aplica el `c_fill` de Cloudinary para recortar cuadrado ANTES de descargar
 * (así baja pocos KB y no deformamos aspect ratios raros con sharp).
 * Nunca lanza: si falla, el kit se genera igual con un placeholder.
 *
 * @param {string} url  URL de la imagen (product.images[i].url)
 * @returns {Promise<Buffer|null>}
 */
async function fetchProductPhoto(url) {
  if (!url || typeof url !== "string") return null;

  let finalUrl = url;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    finalUrl = url.replace(
      /\/upload\/(?:[^/]+\/)?v/,
      "/upload/c_fill,w_900,h_900,q_85,f_jpg/v",
    );
    if (finalUrl === url) {
      finalUrl = url.replace(
        "/upload/",
        "/upload/c_fill,w_900,h_900,q_85,f_jpg/",
      );
    }
  }

  try {
    const res = await axios.get(finalUrl, {
      responseType: "arraybuffer",
      timeout: PHOTO_TIMEOUT_MS,
      maxContentLength: MAX_PHOTO_BYTES,
      headers: { "User-Agent": "MercadoNero-Kit/1.0" },
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.warn(
      "[ReferralKit] No se pudo descargar la foto del producto:",
      e.message,
    );
    return null;
  }
}

/**
 * Escapa texto para meterlo dentro de un <text> de SVG.
 * Evita que un nombre de producto con `&` o `<` rompa el XML (y con eso,
 * el render completo). No es un sanitizador de seguridad (el producto ya
 * está en Mongo), es solo para que el XML sea válido.
 */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Corta un texto en N líneas como máximo, agregando "…" al final si sobró.
 * SVG no hace wrapping nativo (no hay layout engine en <text>), así que lo
 * hacemos a mano.
 *
 * ⚠️ Una palabra MÁS LARGA que el límite (ej. "Republic" o un SKU) no puede
 * quedar entera: la partimos, porque si no se sale del margen derecho y se
 * ve mal (era el bug reportado).
 *
 * @param {string} text
 * @param {number} maxCharsPerLine
 * @param {number} maxLines
 * @returns {string[]}
 */
function wrapText(text, maxCharsPerLine, maxLines) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [""];

  // 1) Partimos las palabras que por sí solas ya exceden el ancho.
  const words = [];
  for (const word of clean.split(" ")) {
    if (word.length <= maxCharsPerLine) {
      words.push(word);
    } else {
      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        words.push(word.slice(i, i + maxCharsPerLine));
      }
    }
  }

  // 2) Empaquetamos en líneas.
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  // 3) Si quedó contenido afuera, avisamos con "…" en la última línea.
  const usedChars = lines.join(" ").length;
  if (usedChars < clean.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      last.length > maxCharsPerLine - 1
        ? `${last.slice(0, maxCharsPerLine - 1)}…`
        : `${last}…`;
  }
  return lines.slice(0, maxLines);
}

/**
 * Formatea un monto en ARS con separadores de miles: 1299000 -> "1.299.000".
 */
function formatArs(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/**
 * Formatea un monto en USD con 2 decimales: 7.5 -> "7.50".
 */
function formatUsd(amount) {
  return (Number(amount) || 0).toFixed(2);
}

/**
 * Arma el SVG de la plantilla (todo lo que NO es la foto ni el QR).
 *
 * ENFOQUE: la imagen la ve el COMPRADOR (va en el feed), no el afiliado.
 *   1. Header: logo de la marca + claim ("El marketplace del futuro").
 *   2. Foto del producto + título (con margen derecho) + precio.
 *   3. Beneficios: compra protegida, pago cripto, envío a todo el país.
 *   4. Caja destacada con el REINTEGRO EN USD que se lleva el comprador.
 *   5. QR que lleva a la ficha del producto.
 *
 * @param {object} data
 * @returns {string} markup SVG
 */
function buildTemplateSvg(data) {
  const {
    titleLines = [""],
    priceNow = "",
    priceBefore = "",
    discountLabel = "",
    // REINTEGRO DEL COMPRADOR en USD (NO la ganancia del afiliado).
    buyerRewardUsd = 0,
    sellerName = "",
    category = "",
    isProduct = true,
    // Bloque <style> con los @font-face (puede venir vacío).
    fontStyle = "",
    // ⚠️ Debe ser "KitFont" a secas. Si pasamos una lista con fallback
    // ("KitFont, Arial"), pango descarta la webfont embebida y usa Arial.
    fontFamily = "Poppins, Inter, Arial",
    // Logo de la marca en data URI (o null si no se pudo cargar).
    logoDataUri = null,
    // aspect ratio del logo cargado (ancho/alto), para no deformarlo.
    logoAspect = null,
  } = data;

  // ── Geometría ──────────────────────────────────────────────────────────
  // MARGIN a ambos lados: el título antes quedaba pegado al borde derecho
  // porque el bloque de texto no tenía ancho útil definido.
  const MARGIN = 72;
  const TEXT_RIGHT = KIT_SIZE - MARGIN;

  const PHOTO = { x: MARGIN, y: 250, size: 380 };
  const TX = PHOTO.x + PHOTO.size + 44;
  const TEXT_W = TEXT_RIGHT - TX;

  const QR = { x: 700, y: 828, size: 168 };

  // ── Título (respeta el margen derecho) ─────────────────────────────────
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="${TX}" y="${352 + i * 56}" font-family="${fontFamily}" font-weight="800" font-size="46" fill="#ffffff">${esc(line)}</text>`,
    )
    .join("");

  // ── Precio ─────────────────────────────────────────────────────────────
  const priceBeforeSvg = priceBefore
    ? `<text x="${TX}" y="560" font-family="${fontFamily}" font-weight="500" font-size="30" fill="#9ca3af">${esc(priceBefore)}</text>
       <rect x="${TX}" y="550" width="${Math.min(priceBefore.length * 13, TEXT_W - 20)}" height="2.5" fill="#9ca3af" opacity="0.75"/>`
    : "";

  const priceY = priceBefore ? 630 : 592;

  const discountSvg = discountLabel
    ? `<rect x="${TX}" y="${priceY + 18}" width="${discountLabel.length * 17 + 32}" height="44" rx="22" fill="${BRAND}"/>
       <text x="${TX + 16}" y="${priceY + 48}" font-family="${fontFamily}" font-weight="800" font-size="24" fill="#ffffff">${esc(discountLabel)}</text>`
    : "";

  // ── Beneficios ─────────────────────────────────────────────────────────
  // Íconos vectoriales (no emoji: los emoji dependen de fuentes del sistema
  // que en el VPS pueden no estar instaladas).
  const ICON_SHIELD = `<path d="M12 2l8 3.5v6c0 5-3.4 9.2-8 10.5-4.6-1.3-8-5.5-8-10.5v-6L12 2z" fill="none" stroke="${BRAND_SOFT}" stroke-width="2.2" stroke-linejoin="round"/><path d="M8.8 12l2.2 2.2 4.2-4.4" fill="none" stroke="${BRAND_SOFT}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Medios de pago: tarjeta (transferencia/cripto se resuelven igual para el
  // comprador: elige cómo pagar en el checkout).
  const ICON_CARD = `<rect x="1.5" y="4.5" width="21" height="15" rx="2.5" fill="none" stroke="${BRAND_SOFT}" stroke-width="2"/><path d="M1.5 9.5h21" stroke="${BRAND_SOFT}" stroke-width="2"/><path d="M5 15h4" stroke="${BRAND_SOFT}" stroke-width="2" stroke-linecap="round"/>`;

  // Productos nuevos con garantía: sello con cinta (medalla).
  const ICON_AWARD = `<circle cx="12" cy="9" r="6" fill="none" stroke="${BRAND_SOFT}" stroke-width="2.2"/><path d="M8.5 14.2L7 22l5-2.6 5 2.6-1.5-7.8" fill="none" stroke="${BRAND_SOFT}" stroke-width="2.2" stroke-linejoin="round"/>`;

  const ICON_TRUCK = `<path d="M1.5 5.5h11v10h-11z" fill="none" stroke="${BRAND_SOFT}" stroke-width="2" stroke-linejoin="round"/><path d="M12.5 8.5h4l3 3.2v3.8h-7z" fill="none" stroke="${BRAND_SOFT}" stroke-width="2" stroke-linejoin="round"/><circle cx="6" cy="18" r="2" fill="none" stroke="${BRAND_SOFT}" stroke-width="2"/><circle cx="17.5" cy="18" r="2" fill="none" stroke="${BRAND_SOFT}" stroke-width="2"/>`;

  // Orden pensado para leer en Z: confianza → envío arriba; pago → garantía
  // abajo. Son 4 (había lugar para uno más y cierra mejor el bloque).
  const beneficios = [
    { icon: ICON_SHIELD, label: "Compra 100% protegida" },
    { icon: ICON_TRUCK, label: "Envío a todo el país" },
    { icon: ICON_CARD, label: "Cripto o transferencia" },
    { icon: ICON_AWARD, label: "Nuevos y con garantía" },
  ];

  // Grilla de 2 columnas x 2 filas (4 items). Arranca en y=700 y cada fila
  // baja 50px: la ultima linea cae en y=750, con margen hasta la caja del
  // reintegro (y=806). La columna 2 va a x=MARGIN+450 (no 470) para que
  // "Paga con cripto o transferencia" no se pase del margen derecho.
  const benefitSvg = beneficios
    .map(({ icon, label }, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 450;
      const y = 700 + row * 50;
      return `<g transform="translate(${x}, ${y - 18}) scale(1.05)">${icon}</g>
      <text x="${x + 38}" y="${y}" font-family="${fontFamily}" font-weight="600" font-size="26" fill="#e5e7eb">${esc(label)}</text>`;
    })
    .join("\n  ");

  // ── Caja del REINTEGRO (gancho principal para el comprador) ────────────
  // Si no tenemos monto (sin cotización), omitimos la caja entera antes que
  // mostrar un número que no cuadre con lo que realmente se acredita.
  // El monto va solo, sin texto al lado: con "por tu compra" se superponía
  // en montos de 3+ dígitos.
  const rewardSvg =
    isProduct && Number(buyerRewardUsd) > 0
      ? `<rect x="${MARGIN}" y="806" width="560" height="112" rx="26" fill="${BRAND}" fill-opacity="0.15" stroke="${BRAND}" stroke-opacity="0.6" stroke-width="2.5"/>
      <text x="${MARGIN + 32}" y="850" font-family="${fontFamily}" font-weight="600" font-size="23" fill="#e5e7eb" letter-spacing="0.8">REINTEGRO EN USD</text>
      <text x="${MARGIN + 32}" y="898" font-family="${fontFamily}" font-weight="900" font-size="42" fill="${BRAND_SOFT}">US$ ${formatUsd(buyerRewardUsd)}</text>`
      : "";

  // ── Claim de marca (arriba a la derecha) ───────────────────────────────
  // "El nuevo marketplace argentino": posicionamiento local, más concreto que
  // "del futuro" (que era genérico y no decía de dónde era).
  const CLAIM = ["El nuevo", "marketplace", "argentino"];
  const claimSvg = CLAIM.map(
    (line, i) =>
      `<text x="${TEXT_RIGHT}" y="${76 + i * 32}" font-family="${fontFamily}" font-weight="800" font-size="27" fill="${BRAND_SOFT}" text-anchor="end">${esc(line)}</text>`,
  ).join("");

  // ── Logo ───────────────────────────────────────────────────────────────
  // Lo agrandamos respecto al primer diseño (el usuario lo vio chico) y
  // calculamos el alto desde el aspect ratio REAL del asset, así no se
  // deforma: el "NARANJA & N" es 1695x355 (~4.77:1), no 500x80.
  const logoW = logoAspect ? 380 : 260;
  const logoH = logoAspect
    ? Math.round(logoW / logoAspect)
    : Math.round((logoW * 80) / 500);
  // Centrado verticalmente en la franja del header (que va de y=40 a y=140).
  const logoY = Math.round(90 - logoH / 2);
  const logoSvg = logoDataUri
    ? `<image x="${MARGIN}" y="${logoY}" width="${logoW}" height="${logoH}" href="${logoDataUri}" xlink:href="${logoDataUri}" preserveAspectRatio="xMinYMid meet"/>`
    : `<circle cx="${MARGIN + 18}" cy="90" r="18" fill="url(#brand)"/>
       <text x="${MARGIN + 46}" y="102" font-family="${fontFamily}" font-weight="800" font-size="30" fill="#ffffff" letter-spacing="1.5">MERCADO NERO</text>`;

  // ── Pie: vendedor / categoría junto al QR ──────────────────────────────
  const footInfo = [sellerName, String(category || "").replace(/-/g, "")]
    .filter(Boolean)
    .join(" · ");

  return `<svg width="${KIT_SIZE}" height="${KIT_SIZE}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${fontStyle}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG_DARK}"/>
      <stop offset="1" stop-color="${BG_DARK_2}"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BRAND}"/>
      <stop offset="1" stop-color="${BRAND_SOFT}"/>
    </linearGradient>
  </defs>

  <!-- Fondo: gradiente base -->
  <rect width="${KIT_SIZE}" height="${KIT_SIZE}" fill="url(#bg)"/>
  <!-- Textura: mesh de lineas y nodos, BIEN tenue (25%) para que no compita
       con el texto. Va encima del gradiente pero debajo de todo el contenido.
       objectFit=cover via preserveAspectRatio: la imagen no es cuadrada
       (1500x1125) y la recortamos sin deformarla. -->


  <!-- Barra superior de marca -->
  <rect x="0" y="0" width="${KIT_SIZE}" height="8" fill="url(#brand)"/>

  <!-- Header: logo + claim -->
  ${logoSvg}
  ${claimSvg}

  <!-- Panel de la foto (fondo; la foto se compone encima) -->
  <rect x="${PHOTO.x - 5}" y="${PHOTO.y - 5}" width="${PHOTO.size + 10}" height="${PHOTO.size + 10}" rx="32" fill="#ffffff" fill-opacity="0.06" stroke="${BRAND}" stroke-opacity="0.35" stroke-width="2.5"/>

  <!-- Título del producto -->
  ${titleSvg}

  <!-- Precio -->
  ${priceBeforeSvg}
  <text x="${TX}" y="${priceY}" font-family="${fontFamily}" font-weight="900" font-size="60" fill="#ffffff">${esc(priceNow)}</text>
  ${discountSvg}

  <!-- Separador -->
  <rect x="${MARGIN}" y="662" width="${KIT_SIZE - MARGIN * 2}" height="1.5" fill="#ffffff" opacity="0.12"/>

  <!-- Beneficios para el comprador -->
  ${benefitSvg}

  <!-- Reintegro del comprador -->
  ${rewardSvg}

  <!-- Frame del QR (el QR real se compone encima) -->
  <rect x="${QR.x - 10}" y="${QR.y - 10}" width="${QR.size + 20}" height="${QR.size + 20}" rx="18" fill="#ffffff"/>
  <text x="${QR.x + QR.size / 2}" y="${QR.y + QR.size + 40}" font-family="${fontFamily}" font-weight="700" font-size="21" fill="#ffffff" text-anchor="middle">Escaneá para comprar</text>
  <text x="${QR.x + QR.size / 2}" y="${QR.y + QR.size + 66}" font-family="${fontFamily}" font-weight="500" font-size="17" fill="#9ca3af" text-anchor="middle">${esc(footInfo)}</text>
</svg>`;
}

/**
 * RENDERIZA el kit promocional completo y devuelve el Buffer JPEG.
 *
 * El orden de `composite` importa: la última capa tapa a las anteriores.
 *   1. SVG base (fondo + textos + frames).
 *   2. Foto del producto (recortada al cuadrado del panel).
 *   3. QR del enlace corto.
 *
 * @param {object}  opts
 * @param {object}  opts.product        documento Product (o lean)
 * @param {string}  opts.shortUrl       URL corta de referido (/r/<code>)
 * @param {number}  opts.buyerRewardUsd reintegro del COMPRADOR en USD
 * @returns {Promise<Buffer>} imagen JPEG
 */
export async function renderReferralKit({
  product,
  shortUrl,
  buyerRewardUsd = 0,
}) {
  const PHOTO = { x: 72, y: 250, size: 380 };
  const QR = { x: 700, y: 828, size: 168 };

  // ── Datos de presentación ──────────────────────────────────────────────
  const isProduct = product?.listingType !== "classified";
  const saleActive =
    Boolean(product?.sale?.active) &&
    Number(product?.sale?.price) > 0 &&
    Number(product?.sale?.price) < Number(product?.price || 0);

  const currentPrice = saleActive
    ? Number(product.sale.price)
    : Number(product?.price) || 0;

  const priceNow = `$ ${formatArs(currentPrice)}`;
  const priceBefore = saleActive ? `$ ${formatArs(product.price)}` : "";
  const discountLabel = saleActive
    ? `-${Math.round((1 - currentPrice / Number(product.price)) * 100)}% OFF`
    : "";

  // 20 caracteres por línea: es lo que entra en el bloque de texto a 46px
  // respetando el margen derecho.
  // 18 caracteres por línea: medido, 20 chars a 46px ocupan ~522px pero el
  // ancho útil es ~505px, así que se desbordaba contra el borde derecho
  // (bug reportado). Con 18 entramos con aire.
  const titleLines = wrapText(product?.name || "Producto", 17, 3);

  // Foto: la bajamos (nunca desde una URL del cliente, ver nota de arriba).
  const mainImage =
    product?.images?.find((img) => img?.isMain) || product?.images?.[0];
  const photoRaw = await fetchProductPhoto(mainImage?.url);

  // ── Capas ──────────────────────────────────────────────────────────────
  const composites = [];

  // 1) Foto, recortada y ajustada al panel.
  if (photoRaw) {
    try {
      const photo = await sharp(photoRaw)
        // `cover` = llena el cuadrado recortando el excedente (no deforma).
        .resize(PHOTO.size, PHOTO.size, { fit: "cover", position: "centre" })
        // Redondeamos las esquinas con una máscara: si el panel tiene
        // border-radius y la foto no, se ve "pegada" y sucia.
        .composite([
          {
            input: Buffer.from(
              `<svg width="${PHOTO.size}" height="${PHOTO.size}"><rect width="${PHOTO.size}" height="${PHOTO.size}" rx="28" fill="#ffffff"/></svg>`,
            ),
            blend: "dest-in",
          },
        ])
        .png()
        .toBuffer();
      composites.push({ input: photo, left: PHOTO.x, top: PHOTO.y });
    } catch (e) {
      console.warn("[ReferralKit] Foto inválida, sigo sin ella:", e.message);
    }
  }

  // 2) QR del enlace corto (lleva a la ficha del producto con ?ref=).
  try {
    const qr = await QRCode.toBuffer(shortUrl || "https://mercadonero.com", {
      type: "png",
      margin: 1,
      width: QR.size,
      errorCorrectionLevel: "M",
      color: { dark: "#111111ff", light: "#FFFFFFFF" },
    });
    composites.push({ input: qr, left: QR.x, top: QR.y });
  } catch (e) {
    console.warn("[ReferralKit] No se pudo generar el QR:", e.message);
  }

  // ── Render final ───────────────────────────────────────────────────────
  // ⚠️ La familia debe ser EXACTAMENTE "KitFont": pango/librsvg acepta el
  // @font-face embebido con el nombre pelado, pero si le pasamos una lista
  // con fallback ("KitFont, Arial") descarta la webfont y usa Arial.
  const [fontStyle, logoDataUri] = await Promise.all([
    getFontStyleBlock(),
    getLogoDataUri(),
  ]);

  const svg = Buffer.from(
    buildTemplateSvg({
      titleLines,
      priceNow,
      priceBefore,
      discountLabel,
      buyerRewardUsd,
      sellerName: product?.sellerName || "",
      category: product?.category || "",
      isProduct,
      fontStyle,
      fontFamily: fontStyle ? "KitFont" : "Poppins, Inter, Arial",
      logoDataUri,
      logoAspect,
    }),
  );

  return (
    sharp(svg)
      .composite(composites)
      // JPEG: más liviano que PNG para fotos (un PNG de 1080x1080 con foto
      // pesa 1.5-2MB; el JPEG ~200KB, ideal para subir a redes).
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer()
  );
}
