import axios from 'axios';
import 'dotenv/config';

// ─────────────────────────────────────────────────────────────────────────────
// Servicio de integración con Tiendanube (Santiago Deportes).
//
// A diferencia de Directcar/Flaming (WooCommerce Store API), Tiendanube NO
// expone una API pública sin credenciales. Usamos SCRAPING liviano basado en:
//
//   1) SITEMAP XML     → https://tienda.com/sitemap.xml  (lista de URLs)
//        · Filtramos las URLs que contienen "/productos/".
//   2) JSON-LD         → cada página de producto trae <script type="application/ld+json">
//        · Bloque "structured-data.page" con `mainEntity` (schema.org/Product):
//          name, sku, image, offers.price, offers.availability, weight.
//        · Y `breadcrumb` (itemListElement) del que sacamos la CATEGORÍA.
//   3) LS.product / LS.variants (JS embebido en la página):
//        · price_number, compare_at_price_number (precio de lista tachado),
//          stock, sku, image_url (imagen real del producto).
//   4) Descripción COMPLETA en data-store="product-description-<id>".
//   5) Galería real en data-store="product-image-<id>" (slides js-product-slide).
//
// Todo con una sola petición GET por producto. ~273 productos en el catálogo.
//
// MULTI-DOMINIO: todas las funciones aceptan un `baseUrl` para operar contra
// CUALQUIER tienda Tiendanube (no sólo Santiago Deportes). Si no se pasa, cae
// al default del .env (compatibilidad con el flujo original del admin).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL =
  process.env.TIENDANUBE_BASE_URL || 'https://www.santiagodeportes.com.ar';

// Cache de sitemaps por dominio (5 min) para no re-scrapear en cada request.
const sitemapCache = new Map(); // baseUrl -> { urls, total, fetchedAt }
const sitemapRawCache = new Map(); // baseUrl -> { locs, fetchedAt }
const SITEMAP_TTL_MS = 5 * 60 * 1000;

const tiendanubeClient = axios.create({
  timeout: 30000,
  headers: {
    // Algunos WAF/tiendas bloquean el User-Agent por defecto de axios.
    'User-Agent':
      'Mozilla/5.0 (compatible; MercadoNeroBot/1.0; +https://mercadonero.com)',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9',
  },
});

// ── Limpieza de HTML ──────────────────────────────────────────────────────
const stripHtml = (html = '') =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Las tiendas a veces mandan HTML con bytes mal decodificados (UTF-8
    // interpretado como Latin-1): los caracteres raros se ven como U+FFFD.
    .replace(/\uFFFD/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

// Corrige URLs protocol-relative (//acdn...) a https://acdn...
const normalizeUrl = (url = '') => {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

/**
 * Trae el SITEMAP y devuelve las URLs de producto (contienen "/productos/").
 *
 * @param {Object} [opts]
 * @param {string} [opts.baseUrl]     Base de la tienda (default: .env).
 * @param {string} [opts.sitemapUrl]  URL explícita del sitemap.
 * @param {boolean} [opts.force]      Ignorar cache.
 * @returns {Promise<{productUrls: string[], total: number}>}
 */
export async function fetchTiendanubeProductUrls(opts = {}) {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = opts.sitemapUrl || `${baseUrl}/sitemap.xml`;

  // Cache por dominio.
  const cached = sitemapCache.get(baseUrl);
  if (!opts.force && cached && Date.now() - cached.fetchedAt < SITEMAP_TTL_MS) {
    return { productUrls: cached.urls, total: cached.total };
  }

  const response = await tiendanubeClient.get(url, { responseType: 'text' });
  const xml = typeof response.data === 'string' ? response.data : String(response.data);

  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)].map((m) => m[1].trim());
  sitemapRawCache.set(baseUrl, { locs, fetchedAt: Date.now() });

  // Quedarnos sólo con URLs de producto (/productos/<slug>), descartando la
  // página índice "/productos/" y cualquier sub-sitemap.
  const productUrls = [
    ...new Set(
      locs.filter(
        (u) =>
          /\/productos\/[^/]+\/?$/.test(u) &&
          !u.includes('sitemap') &&
          !u.endsWith('/productos/')
      )
    ),
  ];

  sitemapCache.set(baseUrl, { urls: productUrls, total: productUrls.length, fetchedAt: Date.now() });

  return { productUrls, total: productUrls.length };
}

// Páginas del sitio que NO son categorías.
const NON_CATEGORY_PATHS = new Set([
  'contacto', 'sobre-nosotros', 'preguntas-frecuentes', 'politica-de-privacidad',
  'politica-de-devolucion', 'politica-de-envio', 'terminos-y-condiciones',
  'formas-de-pago', 'centros-instalacion', 'personaliza-tu-auto', 'ofertas',
  'quienes-somos', 'guia-de-talles', 'como-comprar', 'resenas-de-clientes',
]);

/**
 * Deriva la lista de CATEGORÍAS RAIZ a partir del sitemap (sin scrapear
 * productos). Rápido y válido incluso con miles de productos.
 *
 * IMPORTANTE: el sitemap NO permite saber cuántos productos tiene cada
 * categoría sin paginar la página de categoría (costoso), así que aquí NO
 * exponemos un conteo por categoría (sería un número falso). Sólo nombres.
 *
 * Fuentes de categorías (en orden):
 *   1) URLs de categoría en el sitemap (rutas tipo /<slug>/).
 *   2) URLs de subcategoría (/<slug>/<subslug>/) → tomamos el nivel raíz.
 *
 * @param {string[]} locs  Todas las URLs del sitemap.
 * @returns {{raices: {name,slug}[]}}
 */
function buildCategoriesFromSitemap(locs) {
  const rootSlugs = new Set();

  for (const u of locs) {
    let pathname = '';
    try {
      pathname = new URL(u).pathname;
    } catch {
      continue;
    }
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const first = parts[0];
    if (first === 'productos') continue; // nivel plano de productos
    if (NON_CATEGORY_PATHS.has(first)) continue;
    if (first.startsWith('sitemap')) continue;
    // Cualquier ruta de primer nivel que no sea página estática es categoría.
    rootSlugs.add(first);
  }

  const raices = [...rootSlugs].map((slug) => ({
    name: humanizeSlug(slug),
    slug,
  }));

  // Orden alfabético (sin conteo no hay criterio de relevancia).
  raices.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return { raices };
}

// "suspension-y-direccion" → "Suspension Y Direccion"
function humanizeSlug(slug = '') {
  return String(slug)
    .replace(/-\d+[a-z0-9]*$/i, '') // quita sufijos tipo "-1cz72"
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Devuelve las categorías RAIZ de la tienda a partir del sitemap (sin scrapear
 * productos). Mucho más rápido que recorrer el catálogo.
 *
 * @param {Object} [opts]
 * @param {string} [opts.baseUrl]
 * @returns {Promise<{categories: {name,slug,url}[], total: number}>}
 */
export async function fetchTiendanubeCategories(opts = {}) {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

  // Reusamos el sitemap cacheado (evita una request extra).
  const { productUrls, total } = await fetchTiendanubeProductUrls({ baseUrl });

  // Necesitamos TODAS las locs (no sólo productos) para ver las categorías,
  // así que volvemos a leer el sitemap crudo (está cacheado igualmente a nivel
  // de red por el cliente). Para no duplicar, revisamos el cache.
  let locs = [];
  const cachedRaw = sitemapRawCache.get(baseUrl);
  if (cachedRaw && Date.now() - cachedRaw.fetchedAt < SITEMAP_TTL_MS) {
    locs = cachedRaw.locs;
  } else {
    const response = await tiendanubeClient.get(`${baseUrl}/sitemap.xml`, { responseType: 'text' });
    const xml = typeof response.data === 'string' ? response.data : String(response.data);
    locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)].map((m) => m[1].trim());
    sitemapRawCache.set(baseUrl, { locs, fetchedAt: Date.now() });
  }

  const { raices } = buildCategoriesFromSitemap(locs);

  return {
    categories: raices.map((r) => ({ ...r, url: `${baseUrl}/${r.slug}/` })),
    total: total || productUrls.length,
  };
}

/**
 * Devuelve las URLs de producto de UNA categoría scrapeando su página de
 * categoría (con paginación `?page=N`). Mucho más barato que traer todo el
 * catálogo, y funciona tanto si la categoría lista productos como si tiene
 * subcategorías.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.slug           Slug de la categoría (ej: 'suspension-y-direccion').
 * @param {number} [opts.maxPages=60]  Tope de páginas (protección).
 * @returns {Promise<string[]>}        URLs de producto (absolutas).
 */
export async function fetchTiendanubeCategoryProductUrls(opts = {}) {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const slug = String(opts.slug || '').replace(/^\/+|\/+$/g, '');
  if (!slug) return [];
  const maxPages = Math.min(Math.max(Number(opts.maxPages) || 60, 1), 200);

  const seen = new Set();
  const urls = [];

  for (let p = 1; p <= maxPages; p += 1) {
    const pageUrl = p === 1 ? `${baseUrl}/${slug}/` : `${baseUrl}/${slug}/?page=${p}`;

    let html = '';
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await tiendanubeClient.get(pageUrl, { responseType: 'text' });
      html = typeof r.data === 'string' ? r.data : String(r.data);
    } catch {
      break; // 404 u otro error → cortamos.
    }

    // Slugs de producto en la página.
    const matches = [...html.matchAll(/\/productos\/[a-z0-9-]+\/?/gi)].map((m) => m[0]);
    const pageSlugs = [
      ...new Set(
        matches
          .map((s) => s.replace(/\/+$/, ''))
          .filter((s) => /\/productos\/[a-z0-9-]+$/i.test(s))
      ),
    ];

    // Si no aparecen productos nuevos → fin de la paginación.
    let added = 0;
    for (const s of pageSlugs) {
      const abs = `${baseUrl}${s}/`;
      if (!seen.has(abs)) {
        seen.add(abs);
        urls.push(abs);
        added += 1;
      }
    }

    if (added === 0) break; // página vacía o repetida → cortar.

    // Pausa amable entre páginas.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return urls;
}

/**
 * Extrae el primer bloque JSON-LD que contenga un `mainEntity` de tipo Product.
 * @param {string} html
 * @returns {Object|null}
 */
function extractProductLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]);
      if (json?.mainEntity?.['@type'] === 'Product') return json;
      if (json?.['@type'] === 'Product') return { mainEntity: json, breadcrumb: null };
    } catch {
      // Ignorar bloques inválidos.
    }
  }
  return null;
}

/**
 * Extrae el array LS.variants del JS embebido (bracket matching para no romper
 * con JSON anidado).
 * @param {string} html
 * @returns {Object[]}
 */
function extractLsvariants(html) {
  const marker = 'LS.variants';
  const idx = html.indexOf(marker);
  if (idx === -1) return [];

  const start = html.indexOf('[', idx);
  if (start === -1) return [];

  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  try {
    const arr = JSON.parse(html.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Extrae la descripción completa desde data-store="product-description-<id>".
 * @param {string} html
 * @param {string|number} productId
 * @returns {string}
 */
function extractDescription(html, productId) {
  const marker = `data-store="product-description-${productId}"`;
  let idx = html.indexOf(marker);
  if (idx === -1) {
    // Fallback: primer bloque product-description-* disponible.
    const m = html.match(/data-store="product-description-[^"]*"/);
    if (m) idx = html.indexOf(m[0]);
  }
  if (idx === -1) return '';

  // Tomamos un segmento generoso desde el marcador y buscamos el user-content.
  const segment = html.slice(idx, idx + 20000);
  const m = segment.match(/class="user-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return '';
  return stripHtml(m[1]);
}

/**
 * Extrae la galería real desde data-store="product-image-<id>".
 * @param {string} html
 * @param {string|number} productId
 * @returns {string[]}  URLs normalizadas (https).
 */
function extractGallery(html, productId) {
  const marker = `data-store="product-image-${productId}"`;
  let idx = html.indexOf(marker);
  if (idx === -1) {
    const m = html.match(/data-store="product-image-[^"]*"/);
    if (m) idx = html.indexOf(m[0]);
  }
  if (idx === -1) return [];

  const block = html.slice(idx, idx + 8000);
  const urls = [...block.matchAll(/(\/\/acdn-us\.mitiendanube\.com\/stores\/[^"'\s]*?\/products\/[^"'\s]*?\.(?:webp|jpg|jpeg|png))/gi)].map(
    (m) => normalizeUrl(m[1])
  );

  // Deduplicar por "clave" del archivo base: quitamos el sufijo de tamaño
  // (-480-0, -640-0, -1024-1024) para que una misma imagen no se repita.
  const seen = new Set();
  const unique = [];
  for (const u of urls) {
    const key = u.replace(/-\d+-\d+(\.(?:webp|jpg|jpeg|png))$/i, '$1');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(u);
    }
  }
  return unique;
}

/**
 * Normaliza un producto de Tiendanube a un shape plano y estable (parecido al
 * de Directcar/Flaming para reusar los adapters).
 *
 * @param {string} url  URL del producto.
 * @param {string} html HTML de la página del producto.
 * @returns {Object|null}
 */
export function normalizeTiendanubeProduct(url, html) {
  const ld = extractProductLd(html);
  if (!ld?.mainEntity) return null;

  const product = ld.mainEntity;

  // Categoría: del breadcrumb (todos los niveles menos el producto final).
  const breadcrumbItems = ld?.breadcrumb?.itemListElement || [];
  const categoryNames = breadcrumbItems
    .map((i) => i?.name)
    .filter((n) => n && !/^inicio$/i.test(n));
  // El último item del breadcrumb es el nombre del producto → lo descartamos.
  const categoryBreadcrumb = categoryNames.slice(0, Math.max(0, categoryNames.length - 1));

  // Variantes: usamos la primera (single-variant en general).
  const variants = extractLsvariants(html);
  const v = variants[0] || {};

  const priceNumber = Number(v.price_number ?? product?.offers?.price ?? 0) || 0;
  const listPriceNumber =
    Number(v.compare_at_price_number ?? 0) || 0; // precio "tachado"

  // Stock: del JSON-LD inventoryLevel o de la variante.
  const ldStock = Number(product?.offers?.inventoryLevel?.value);
  const stock = Number.isFinite(ldStock)
    ? ldStock
    : Number(v.stock) || 0;

  const availability = String(product?.offers?.availability || '');
  const isInStock = availability.includes('InStock') || stock > 0;

  // Imágenes: galería real; si falla, caemos a la imagen de la variante, luego
  // al JSON-LD. (El usuario pidió 1 sola imagen por ahora, pero devolvemos la
  // galería completa: la importación toma sólo la primera.)
  let gallery = extractGallery(html, product.id);
  if (gallery.length === 0) {
    const fallback = normalizeUrl(v.image_url) || normalizeUrl(product.image);
    if (fallback) gallery = [fallback];
  }

  const description =
    extractDescription(html, product.id) ||
    stripHtml(product.description) ||
    '';

  // ── MARCA: Tiendanube la expone en el JSON-LD de ALGUNAS tiendas
  // (product.brand.name), no en todas. Si existe, se respeta a rajatabla.
  let brand = '';
  if (product?.brand) {
    brand = typeof product.brand === 'string'
      ? product.brand
      : (product.brand.name || '');
  }
  brand = String(brand || '').trim();

  // ── SKU: preferimos el de la variante; Tiendanube a veces lo duplica con "@"
  // (ej: "AG213150TP@AG213150TP"). Nos quedamos con la primera parte.
  let sku = String(v.sku || product.sku || '').trim();
  if (sku.includes('@')) {
    const parts = sku.split('@').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] === parts[1]) sku = parts[0];
    else sku = parts[0];
  }

  return {
    id: product.id ?? null,
    url,
    name: product.name || '',
    sku,
    description,
    price: priceNumber, // precio FINAL de venta
    listPrice: listPriceNumber, // precio de lista (si hay descuento)
    onSale: listPriceNumber > priceNumber && priceNumber > 0,
    currency: product?.offers?.priceCurrency || 'ARS',
    isInStock,
    stock,
    images: gallery.map((src) => ({ src })),
    categoryBreadcrumb,
    // Marca real del proveedor si existe; si no, vacío (el adapter decide).
    brand,
    weight: Number(product?.weight?.value) || 0,
    permalink: product?.['@id'] || url,
  };
}

/**
 * Scrapea UN producto puntual desde su URL.
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
export async function fetchTiendanubeProduct(url) {
  const response = await tiendanubeClient.get(url, { responseType: 'text' });
  const html = typeof response.data === 'string' ? response.data : String(response.data);
  return normalizeTiendanubeProduct(url, html);
}

/**
 * Scrapea TODO el catálogo paginando las URLs del sitemap, con concurrencia
 * controlada para no saturar el sitio del proveedor.
 *
 * @param {Object} [opts]
 * @param {string} [opts.baseUrl]        Base de la tienda (para el sitemap).
 * @param {number} [opts.concurrency=4]  Peticiones simultáneas.
 * @param {number} [opts.limit]          Tope de productos a traer (para pruebas).
 * @param {string[]} [opts.urls]         URLs puntuales (saltea el sitemap).
 * @param {Function} [opts.onProgress]   (done, total) => void
 * @returns {Promise<{items: Object[], total: number, errors: Object[]}>}
 */
export async function fetchAllTiendanubeProducts(opts = {}) {
  const concurrency = Math.min(Math.max(Number(opts.concurrency) || 4, 1), 8);

  let urls = Array.isArray(opts.urls) && opts.urls.length
    ? opts.urls
    : (await fetchTiendanubeProductUrls({ baseUrl: opts.baseUrl })).productUrls;

  if (opts.limit) urls = urls.slice(0, Number(opts.limit));

  const items = [];
  const errors = [];
  let done = 0;

  // Procesamos en tandas de `concurrency`.
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          return await fetchTiendanubeProduct(url);
        } catch (err) {
          errors.push({ url, reason: err.message });
          return null;
        }
      })
    );

    for (const r of results) {
      if (r) items.push(r);
    }

    done += batch.length;
    opts.onProgress?.(Math.min(done, urls.length), urls.length);

    // Pequeña pausa entre tandas para ser amables con el proveedor.
    if (i + concurrency < urls.length) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return { items, total: items.length, errors };
}

/**
 * Chequeo rápido de conectividad: trae el sitemap y cuenta productos.
 * @param {Object} [opts]
 * @param {string} [opts.baseUrl]
 * @returns {Promise<{ok: boolean, total: number}>}
 */
export async function tiendanubeHealth(opts = {}) {
  const { total } = await fetchTiendanubeProductUrls({ baseUrl: opts.baseUrl, force: true });
  return { ok: true, total };
}
