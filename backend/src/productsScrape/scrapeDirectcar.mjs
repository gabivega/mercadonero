// ─────────────────────────────────────────────────────────────────────────────
// Scraper de catálogo completo de DirectCar (WooCommerce Store API pública).
//
// DirectCar (https://directcar.com.ar) corre sobre WooCommerce y expone su
// Store API sin auth:
//   GET https://directcar.com.ar/wp-json/wc/store/v1/products
//   GET https://directcar.com.ar/wp-json/wc/store/v1/products/categories
//
// Uso (desde backend/):
//   node src/productsScrape/scrapeDirectcar.mjs
//
// Genera: src/productsScrape/directcar_productos.json
//
// ⚠️ IMPORTANTE (precios): DirectCar usa currency_minor_unit = 2, o sea los
// precios vienen en CENTAVOS ("9760000" = $97.600,00). Acá guardamos el precio
// YA normalizado en pesos (dividido por 100) para que el resto del código lo
// consuma sin volver a dividir.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://directcar.com.ar/wp-json/wc/store/v1';
const PER_PAGE = 100;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 45000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; MercadoNeroBot/1.0; +https://mercadonero.com)',
    Accept: 'application/json',
  },
});

// El precio viene en unidad mínima (centavos para ARS con minor_unit=2).
function fromMinorUnit(raw, minorUnit = 2) {
  const n = Number(raw) || 0;
  const divisor = 10 ** (Number(minorUnit) || 0);
  return divisor === 0 ? n : n / divisor;
}

function normalize(p) {
  const minorUnit = p?.prices?.currency_minor_unit ?? 2;
  return {
    id: p?.id ?? null,
    name: p?.name || '',
    slug: p?.slug || '',
    sku: p?.sku || '',
    type: p?.type || 'simple',
    permalink: p?.permalink || '',
    description: p?.description || '',
    shortDescription: p?.short_description || '',
    price: fromMinorUnit(p?.prices?.price, minorUnit),
    regularPrice: fromMinorUnit(p?.prices?.regular_price, minorUnit),
    salePrice: fromMinorUnit(p?.prices?.sale_price, minorUnit),
    onSale: Boolean(p?.on_sale),
    currency: p?.prices?.currency_code || 'ARS',
    minorUnit,
    images: Array.isArray(p?.images)
      ? p.images.map((img) => ({ id: img?.id ?? null, src: img?.src || '' }))
      : [],
    categories: Array.isArray(p?.categories)
      ? p.categories.map((c) => ({ id: c?.id ?? null, name: c?.name || '', slug: c?.slug || '' }))
      : [],
    brands: Array.isArray(p?.brands) ? p.brands.map((b) => b?.name || '') : [],
    tags: Array.isArray(p?.tags) ? p.tags.map((t) => t?.name || '') : [],
    isInStock: Boolean(p?.is_in_stock),
    stockAvailability: p?.stock_availability?.text || '',
  };
}

async function main() {
  console.log('[DirectCar] Iniciando scraping del catálogo...');

  let total = 0;
  let totalPages = 1;
  const all = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const res = await client.get('/products', {
      params: { per_page: PER_PAGE, page, orderby: 'id', order: 'asc' },
    });

    if (page === 1) {
      total = Number(res.headers['x-wp-total']) || 0;
      totalPages = Number(res.headers['x-wp-totalpages']) || 1;
      console.log(`[DirectCar] Total reportado: ${total} productos / ${totalPages} páginas`);
    }

    const batch = Array.isArray(res.data) ? res.data : [];
    all.push(...batch.map(normalize));
    console.log(`[DirectCar] Página ${page}/${totalPages} → ${all.length} acumulados`);

    if (batch.length === 0) break;
    // Pausa suave para no golpear el server.
    await new Promise((r) => setTimeout(r, 250));
  }

  // Categorías.
  let categories = [];
  try {
    const catsRes = await client.get('/products/categories', { params: { per_page: 100 } });
    categories = (catsRes.data || []).map((c) => ({
      id: c?.id ?? null,
      name: c?.name || '',
      slug: c?.slug || '',
      parent: c?.parent ?? 0,
      count: Number(c?.count) || 0,
    }));
    console.log(`[DirectCar] ${categories.length} categorías obtenidas.`);
  } catch (err) {
    console.warn('[DirectCar] No se pudieron traer categorías:', err.message);
  }

  const out = {
    provider: 'directcar',
    source: BASE_URL,
    fetchedAt: new Date().toISOString(),
    total,
    count: all.length,
    categories,
    products: all,
  };

  const outPath = path.join(__dirname, 'directcar_productos.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`[DirectCar] ✅ Guardado en ${outPath} (${all.length} productos)`);
}

main().catch((err) => {
  console.error('[DirectCar] Error fatal:', err.message);
  process.exit(1);
});
