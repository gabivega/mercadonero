/**
 * ════════════════════════════════════════════════════════════════════════════
 *  IMPORTADOR: LISTA DE PRECIOS INTELBRAS / MACROTECNO → Mercado Nero
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Convierte la planilla "LISTA DE PRECIOS INTELBRAS - Macrotecno - Noviembre"
 *  (5 hojas: CONTROL DE ACCESOS, INTRUSION, INCENDIO, INFRAESTRUCTURA,
 *  PORTERIA) en productos de Mercado Nero para la cuenta Macrotecno.
 *
 *  ── ESTRUCTURA DE LA PLANILLA ────────────────────────────────────────────
 *  Columnas: [MODELO] [DETALLE] [GREMIO] [IVA]
 *  - El precio GREMIO está en USD y **SIN IVA**. La columna IVA trae la alícuota
 *    (0.21 / 0.105) que hay que SUMAR: precioFinal = gremio * (1 + iva).
 *    (Ojo: en otras planillas el IVA viene incluido y se resta; acá NO.)
 *  - Las filas de SUBTÍTULO tienen texto y precio vacío ("REMOTOS Y RECEPTORES").
 *    Definen la sección del bloque siguiente.
 *  - Las filas de CABECERA repiten "GREMIO"/"IVA" → se saltean.
 *  - Las imágenes están incrustadas como objetos dentro de la celda MODELO y
 *    NO se extraen: quedarían como binario sin destino. Se usa un placeholder
 *    y el vendedor carga las fotos desde el editor del producto.
 *
 *  ── DECISIONES ───────────────────────────────────────────────────────────
 *  - MONEDA: ARS. El catálogo no está afinado para USD todavía, así que
 *    convertimos USD → ARS con la cotización del dólar de dolarapi (la misma
 *    que usa el checkout: /v1/dolares/cripto → campo `venta`).
 *  - CATEGORÍA: hogar-muebles-y-jardin / seguridad-para-el-hogar.
 *  - MARCA: Intelbras / Fullvision / Megatron según el texto del detalle.
 *  - MODERACIÓN: los productos nacen en `pending`, IGUAL que un producto
 *    individual creado desde el formulario. NO se autoaprueban.
 *  - TELEGRAM: un producto individual dispara un aviso al admin. Acá se
 *    manda UN SOLO aviso resumiendo el lote (no 221 mensajes).
 *
 *  ── USO ──────────────────────────────────────────────────────────────────
 *    node scripts/importIntelbrasMacrotecno.mjs                  # DRY-RUN
 *    node scripts/importIntelbrasMacrotecno.mjs --apply          # importa
 *    node scripts/importIntelbrasMacrotecno.mjs --apply --reset  # borra los
 *        productos previos de esta importación y vuelve a cargarlos
 *    node scripts/importIntelbrasMacrotecno.mjs --apply --limit 5
 *    node scripts/importIntelbrasMacrotecno.mjs --apply --currency USD  # sin convertir
 *    node scripts/importIntelbrasMacrotecno.mjs --apply --rate 1250      # TC fijo
 *
 *  Los productos importados llevan `providerRef.provider = "intelbras-macrotecno"`
 *  para poder identificarlos, contar cuántos van a moderación y borrarlos con
 *  --reset sin tocar nada del resto del catálogo.
 * ════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `xlsx` NO es dependencia del backend (lo usa el frontend para leer el Excel
// en el navegador). Para no agregarla solo por un script, la resolvemos desde
// frontend/node_modules.
const require = createRequire(import.meta.url);
const XLSX = require(path.resolve(__dirname, '../../frontend/node_modules/xlsx/xlsx.js'));

import User from '../src/models/User.js';
import Product from '../src/models/Product.js';
import { notifyAdmin, escapeTelegramHtml as tgEsc } from '../src/services/telegramService.js';

// ── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESET = args.includes('--reset');

const argValue = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const LIMIT = Number(argValue('--limit', 0)) || 0;
const FILE = argValue(
  '--file',
  path.resolve(__dirname, '../../frontend/LISTA DE PRECIOS INTELBRAS - Macrotecno - Noviembre.xlsx')
);
const SELLER_EMAIL = argValue('--email', 'macrotecno@protonmail.com');
const SELLER_ID = argValue('--seller-id', '6b06cd31bc2fbf7eabb51407');
const CURRENCY = (argValue('--currency', 'ARS') || 'ARS').toUpperCase();
const FIXED_RATE = Number(argValue('--rate', 0)) || 0;

// Etiqueta que identifica los productos de ESTA importación. Sirve para
// borrarlos con --reset y para contar el lote sin tocar el resto del catálogo.
const IMPORT_SOURCE = 'intelbras-macrotecno';

const CATEGORY = 'hogar-muebles-y-jardin';
const SUBCATEGORY = 'seguridad-para-el-hogar';

// Placeholder de imagen (la planilla NO trae URLs).
const PLACEHOLDER_BASE = argValue(
  '--placeholder',
  'https://placehold.co/600x600/1f2937/9ca3af.png?text='
);

// ── Helpers de texto ────────────────────────────────────────────────────────
const cleanText = (s) =>
  String(s ?? '')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isHeaderRow = (row) =>
  row.some((c) => typeof c === 'string' && /^(gremio|iva|modelo|detalle)$/i.test(c.trim()));

/** Fila de subtítulo: tiene texto y NO tiene precio. */
const readSectionTitle = (row) => {
  const hasNumber = row.some(
    (c) => c !== '' && c !== null && c !== undefined && !Number.isNaN(Number(String(c).replace(',', '.')))
  );
  if (hasNumber) return null;
  const text = row.find((c) => typeof c === 'string' && c.trim().length > 2);
  return text ? text.trim() : null;
};

const humanizeSection = (s) => {
  const t = cleanText(s).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const guessBrand = (model, detail) => {
  const text = `${model} ${detail}`.toLowerCase();
  if (text.includes('megatron')) return 'Megatron';
  if (text.includes('fullvision') || /^(fv|hc|hd|sc|sl|gb|gd|co)-/i.test(model)) return 'Fullvision';
  return 'Intelbras';
};

// ── Parseo de una hoja ──────────────────────────────────────────────────────
const parseSheet = (sheetName, rows) => {
  const products = [];
  const skipped = [];
  let currentSection = '';

  rows.forEach((rawRow, idx) => {
    const rowNumber = idx + 1;
    const cells = (Array.isArray(rawRow) ? rawRow : []).map((c) =>
      typeof c === 'string' ? c.trim() : c
    );

    if (cells.every((c) => c === '' || c === null || c === undefined)) return;

    if (isHeaderRow(cells)) {
      skipped.push({ rowNumber, reason: 'cabecera' });
      return;
    }

    const section = readSectionTitle(cells);
    if (section) {
      currentSection = section;
      skipped.push({ rowNumber, reason: 'subtitulo' });
      return;
    }

    // Índices numéricos: el primero es GREMIO (USD sin IVA), el siguiente IVA.
    const numericCells = [];
    cells.forEach((c, i) => {
      if (c === '' || c === null || c === undefined) return;
      const n = Number(String(c).replace(',', '.'));
      if (!Number.isNaN(n)) numericCells.push({ i, n });
    });

    if (numericCells.length === 0) {
      skipped.push({ rowNumber, reason: 'sin precio' });
      return;
    }

    const { i: priceIdx, n: gremio } = numericCells[0];
    // IVA: la celda inmediatamente posterior al precio, si es un número entre
    // 0 y 1. Si no viene, asumimos 21% (la alícuota más común de la lista).
    const ivaCell = numericCells.find((x) => x.i === priceIdx + 1);
    const iva = ivaCell && ivaCell.n >= 0 && ivaCell.n <= 1 ? ivaCell.n : 0.21;

    const textCells = cells.slice(0, priceIdx).filter((c) => c !== '' && c !== null && c !== undefined);
    if (textCells.length === 0) {
      skipped.push({ rowNumber, reason: 'sin modelo ni detalle' });
      return;
    }

    let model = '';
    let detail = '';
    if (textCells.length >= 2) {
      model = cleanText(textCells[0]);
      detail = cleanText(textCells.slice(1).join(' '));
    } else {
      model = cleanText(textCells[0]);
    }

    // Si el "modelo" es en realidad una frase larga, es detalle.
    if (model.split(' ').length > 6) {
      detail = cleanText(`${model} ${detail}`);
      model = '';
    }

    if (!gremio || gremio <= 0) {
      skipped.push({ rowNumber, reason: 'precio inválido' });
      return;
    }

    const brand = guessBrand(model, detail);
    const shortDetail = detail.split(/[,.;]/)[0]?.trim() || '';
    const titleBase = model || shortDetail || 'Producto Intelbras';

    const description = cleanText(
      [
        detail,
        detail && !/[.]$/.test(detail) ? '.' : '',
        currentSection ? `Línea: ${humanizeSection(currentSection)}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );

    // Nombre base = "MODELO - Marca". Los homónimos se resuelven más abajo.
    products.push({
      sheet: sheetName,
      rowNumber,
      model,
      baseName: cleanText(`${titleBase} - ${brand}`),
      name: cleanText(`${titleBase} - ${brand}`),
      brand,
      description,
      gremio,
      iva,
      section: currentSection,
    });
  });

  return { products, skipped };
};

// ── Cotización USD → ARS ────────────────────────────────────────────────────
const fetchUsdRate = async () => {
  if (FIXED_RATE > 0) {
    console.log(`TC fijo (--rate): ${FIXED_RATE} ARS/USD`);
    return FIXED_RATE;
  }
  // Misma fuente que el checkout del frontend (OrderUtils / cashbackUtils):
  // dolarapi "cripto" → `venta` = ARS por 1 USDT.
  const res = await fetch('https://dolarapi.com/v1/dolares/cripto');
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.venta);
  if (!(rate > 0)) throw new Error('La cotización recibida no es válida');
  console.log(`TC dolarapi (cripto, venta): ${rate} ARS/USD — ${data.fechaActualizacion || ''}`);
  return rate;
};

const placeholderFor = (model, fallback) => {
  if (!PLACEHOLDER_BASE.includes('text=')) return PLACEHOLDER_BASE;
  const label = cleanText(model || fallback || 'Macrotecno').slice(0, 22);
  return PLACEHOLDER_BASE + encodeURIComponent(label);
};

// ── Main ────────────────────────────────────────────────────────────────────
const main = async () => {
  console.log('════════════════════════════════════════════════════');
  console.log('  IMPORT INTELBRAS / MACROTECNO → MERCADO NERO');
  console.log(`  Modo: ${APPLY ? 'APPLY (escribe en la DB)' : 'DRY-RUN (no escribe)'}`);
  console.log(`  Moneda destino: ${CURRENCY}`);
  console.log('════════════════════════════════════════════════════');

  const workbook = XLSX.readFile(FILE);
  console.log(`Archivo: ${path.basename(FILE)}`);

  const all = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      blankrows: false,
    });
    const { products, skipped } = parseSheet(sheetName, rows);
    console.log(`  ${sheetName.padEnd(20)} ${String(products.length).padStart(3)} productos  (${skipped.length} filas salteadas)`);
    all.push(...products);
  }

  console.log(`\nTOTAL DETECTADO: ${all.length} productos`);

  // ── Desambiguar nombres repetidos ──
  // Un mismo modelo aparece varias veces (en secciones distintas o con precio
  // distinto). Le agregamos la sección; si aún colisiona, el precio en USD.
  // Sin esto quedaban publicaciones homónimas que confunden al admin.
  const recount = () => {
    const m = new Map();
    all.forEach((p) => m.set(p.name.toLowerCase(), (m.get(p.name.toLowerCase()) || 0) + 1));
    return m;
  };

  let dupMap = recount();
  let renamed = 0;
  all.forEach((p) => {
    if (dupMap.get(p.name.toLowerCase()) > 1) {
      const withSection = p.section
        ? `${p.baseName} (${humanizeSection(p.section)})`
        : p.baseName;
      if (withSection.toLowerCase() !== p.name.toLowerCase()) {
        p.name = cleanText(withSection);
        renamed += 1;
      }
    }
  });

  // Segunda pasada: lo que siga duplicado se distingue por precio.
  dupMap = recount();
  all.forEach((p) => {
    if (dupMap.get(p.name.toLowerCase()) > 1) {
      p.name = cleanText(`${p.name} — ${p.gremio} USD`);
      renamed += 1;
    }
  });

  if (renamed) console.log(`  ↳ ${renamed} nombre(s) desambiguados`);
  const finalDup = [...recount().values()].filter((n) => n > 1).length;
  if (finalDup) console.warn(`⚠️  Quedaron ${finalDup} nombre(s) repetidos`);

  // ── Conversión de precio ──
  let rate = 0;
  if (CURRENCY === 'ARS') {
    rate = await fetchUsdRate();
    // precio ARS = gremio (USD sin IVA) * (1 + iva) * TC
    all.forEach((p) => {
      p.price = Math.round(p.gremio * (1 + p.iva) * rate);
    });
  } else {
    all.forEach((p) => {
      p.price = Math.round(p.gremio * (1 + p.iva) * 100) / 100;
    });
  }

  const byBrand = all.reduce((acc, p) => ({ ...acc, [p.brand]: (acc[p.brand] || 0) + 1 }), {});
  console.log('Por marca:', JSON.stringify(byBrand));

  // ── Muestra ──
  console.log('\n── Muestra (primeros 5) ──');
  all.slice(0, 5).forEach((p) => {
    console.log(`  • [${p.sheet} f${p.rowNumber}] ${p.name}`);
    console.log(
      `      ${p.gremio} USD + IVA ${(p.iva * 100).toFixed(1)}% = ${CURRENCY} ${p.price.toLocaleString('es-AR')}`
    );
    console.log(`      ${p.description.slice(0, 100)}…`);
  });

  if (!APPLY) {
    console.log('\n(DRY-RUN) No se escribió nada. Corré con --apply para importar.');
    return;
  }

  // ── Conexión y validación ──
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en backend/.env');
  await mongoose.connect(process.env.MONGODB_URI);

  const seller = await User.findOne({ email: SELLER_EMAIL }).select(
    '_id email firstName lastName shop walletAddress accountStatus username'
  );
  if (!seller) throw new Error(`No existe el usuario ${SELLER_EMAIL}`);
  if (String(seller._id) !== SELLER_ID) {
    console.warn(`⚠️  El _id (${seller._id}) no coincide con el esperado (${SELLER_ID}).`);
  }
  if (!seller.shop?.active || !seller.shop?.approved) {
    throw new Error('La tienda del vendedor no está activa y aprobada. No se puede publicar.');
  }
  console.log(`\nVendedor: ${seller.email} (${seller._id}) — ${seller.shop.name}`);

  // ── RESET: borra los productos de esta importación ──
  if (RESET) {
    const del = await Product.deleteMany({
      seller: seller._id,
      'providerRef.provider': IMPORT_SOURCE,
    });
    console.log(`🗑  Reset: ${del.deletedCount} producto(s) previos de ${IMPORT_SOURCE} eliminados.`);
  }

  const sellerName =
    seller.shop?.name ||
    [seller.firstName, seller.lastName].filter(Boolean).join(' ') ||
    'Macrotecno';

  // Evitar duplicados contra lo que ya haya del vendedor (por nombre).
  const existing = await Product.find({ seller: seller._id }).select('name').lean();
  const existingNames = new Set(existing.map((p) => String(p.name).toLowerCase()));

  const pool = LIMIT ? all.slice(0, LIMIT) : all;
  const target = pool.filter((p) => !existingNames.has(p.name.toLowerCase()));
  const dupCount = pool.length - target.length;
  if (dupCount) console.log(`⏭  ${dupCount} producto(s) ya existen (se saltean)`);

  let created = 0;
  const errors = [];

  for (const p of target) {
    try {
      // Usamos create() en serie (no insertMany) porque insertMany NO dispara
      // el hook pre('save') que genera el SLUG. Con 221 docs alcanza de sobra.
      await Product.create({
        name: p.name,
        description: p.description || `${p.name}. Consultá por más detalles.`,
        price: p.price,
        currency: CURRENCY,
        brand: p.brand,
        condition: 'new',
        stock: 1,
        category: CATEGORY,
        subCategory: SUBCATEGORY,
        images: [{ url: placeholderFor(p.model, p.name), isMain: true }],
        seller: seller._id,
        sellerName,
        sellerIsVerified: false,
        listingType: 'product',
        source: 'manual',
        // ── MODERACIÓN: mismo comportamiento que un producto individual ──
        // Nace en 'pending' y SIN fecha de revisión: el admin tiene que aprobarlo.
        status: 'active',
        moderation: { status: 'pending' },
        payment: { acceptsTransfer: true, acceptsCrypto: false },
        shipping: {
          free: false,
          cost: 0,
          isDigital: false,
          mode: 'both',
          delivery: { homeDelivery: true, pickup: false },
          shippingTime: '48h',
        },
        // Trazabilidad de la importación (permite --reset y contar el lote).
        // OJO: `providerRef` tiene CAMPOS TIPADOS en el modelo; cualquier clave
        // que no exista ahí la descarta Mongoose EN SILENCIO. Usamos los reales.
        providerRef: {
          provider: IMPORT_SOURCE,
          storeName: 'Macrotecno',
          codigo_producto: `${p.sheet}:${p.rowNumber}`,
          costPvpArs: p.price,
          lastSyncAt: new Date(),
        },
      });
      created += 1;
      if (created % 25 === 0) console.log(`   … ${created} creados`);
    } catch (err) {
      errors.push({ name: p.name, reason: err.message });
    }
  }

  console.log(`\n✅ Creados: ${created} (todos en estado PENDIENTE de aprobación)`);
  if (errors.length) {
    console.log(`❌ Errores: ${errors.length}`);
    errors.slice(0, 10).forEach((e) => console.log(`   • ${e.name}: ${e.reason}`));
  }

  // ── UN SOLO aviso al admin por TODO el lote ──
  // Un producto individual dispara "product_created" por cada uno. Importar
  // 221 y mandar 221 mensajes al Telegram del admin sería insoportable, así
  // que mandamos un único resumen. Respeta el interruptor del evento
  // `product_created` (si el admin lo apagó, no sale nada).
  //
  // ⚠️ `notifyAdmin` ENCOLA el mensaje y lo manda con un debounce de ~2s, con
  // el timer `unref()`: si el script termina antes, el mensaje NUNCA sale
  // (nos pasó). Por eso esperamos unos segundos al final del script.
  if (created > 0) {
    try {
      const totalPendientes = await Product.countDocuments({
        seller: seller._id,
        'moderation.status': 'pending',
      });
      const result = await notifyAdmin('product_created', {
        header: '📦 <b>Carga masiva pendiente de aprobación</b>',
        lines: [
          `<b>${created}</b> producto(s) importados desde la lista de precios`,
          `Vendedor: ${tgEsc(seller.shop?.name || seller.email)}`,
          `Pendientes totales del vendedor: <b>${totalPendientes}</b>`,
          'Revisalos desde el panel de admin → Productos.',
        ],
        data: { sellerId: seller._id, created, source: IMPORT_SOURCE },
      });
      if (result?.queued) {
        // Damos tiempo a que el debounce de la cola dispare el fetch a Telegram.
        await new Promise((r) => setTimeout(r, 4000));
        console.log('🔔 Aviso de Telegram enviado (1 solo mensaje por el lote).');
      } else {
        // Motivo típico: event_disabled / no_chat / no_token. Lo mostramos para
        // no fallar en silencio (la primera vez no llegó y no había rastro).
        console.warn(`⚠️  No se envió el aviso a Telegram (${result?.reason || 'desconocido'}).`);
        if (result?.reason === 'event_disabled') {
          console.warn('   → Activá el evento "product_created" en Admin → Telegram.');
        }
      }
    } catch (e) {
      console.warn('[Telegram] No se pudo avisar al admin:', e?.message);
    }
  }

  await mongoose.disconnect();
  console.log('Listo.');
};

main().catch(async (err) => {
  console.error('\n❌ ERROR:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
