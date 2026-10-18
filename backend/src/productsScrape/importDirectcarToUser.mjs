// ─────────────────────────────────────────────────────────────────────────────
// Carga masiva del catálogo DirectCar a la tienda de UN usuario (testing).
//
// Lee el catálogo ya scrapeado (directcar_productos.json, generado por
// scrapeDirectcar.mjs) y crea documentos Product reales en MongoDB para el
// usuario indicado.
//
// Decisiones de este script (definidas para TESTING):
//   - PRECIO FIJO para todo el catálogo (para probar la tienda sin importar
//     los precios reales del proveedor).
//   - Sólo importa productos CON STOCK y CON al menos 1 imagen. Se descartan
//     los "sin stock" (no aportan a un catálogo de prueba y ensucian la UI).
//   - Imágenes por HOTLINK: se guarda la URL original de DirectCar, NO se sube
//     nada a Cloudinary (evita saturar el free tier).
//   - Omite duplicados: no vuelve a crear productos que ya estén vinculados a
//     DirectCar por providerRef.id (podés correrlo varias veces).
//
// Uso (desde backend/):
//   node src/productsScrape/importDirectcarToUser.mjs            # dry-run
//   node src/productsScrape/importDirectcarToUser.mjs --run      # ejecuta
//
// Configuración por variables de entorno (opcionales):
//   DC_USER_ID     ObjectId del usuario destino (default: el provisto)
//   DC_PRICE       Precio fijo para todos los productos (default: 40000)
//   DC_MAX_IMAGES  Máximo de imágenes por producto (default: 1)
//   DC_LIMIT       Limita cuántos productos importar (0 = todos)
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Product from '../models/Product.js';
import User from '../models/User.js';
import { directcarToProduct, buildDirectcarProviderRef } from '../services/directcarAdapter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configuración ────────────────────────────────────────────────────────────
const RUN = process.argv.includes('--run');

const USER_ID = process.env.DC_USER_ID || '6ad42370346a42d3347d5f58';
const FIXED_PRICE = Number(process.env.DC_PRICE) || 40000; // mismo precio para todo
const MAX_IMAGES = Math.max(1, Number(process.env.DC_MAX_IMAGES) || 1);
const LIMIT = Number(process.env.DC_LIMIT) || 0; // 0 = sin límite

const CATALOG_PATH = path.join(__dirname, 'directcar_productos.json');

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(
      `No se encontró el catálogo en ${CATALOG_PATH}. Corré primero: node src/productsScrape/scrapeDirectcar.mjs`
    );
  }
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  return Array.isArray(raw.products) ? raw.products : [];
}

// ── Flujo principal ──────────────────────────────────────────────────────────
async function main() {
  console.log('─────────────────────────────────────────────────────────────');
  console.log(' Carga masiva DirectCar → tienda de usuario (testing)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`Modo:          ${RUN ? 'EJECUCIÓN REAL' : 'DRY-RUN (no escribe nada)'}`);
  console.log(`Usuario:       ${USER_ID}`);
  console.log(`Precio fijo:   $${FIXED_PRICE}`);
  console.log(`Máx imágenes:  ${MAX_IMAGES}`);
  console.log(`Límite:        ${LIMIT || 'sin límite'}`);
  console.log('');

  // 1. Conectar.
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no está seteado en .env');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB');

  // 2. Validar el usuario destino.
  if (!mongoose.Types.ObjectId.isValid(USER_ID)) {
    throw new Error(`USER_ID inválido: ${USER_ID}`);
  }
  const user = await User.findById(USER_ID).select(
    'username shop isVerified addresses email'
  );
  if (!user) throw new Error(`No existe el usuario ${USER_ID}`);

  const shopLocation = user?.shop?.location || {};
  const defaultAddress =
    user?.addresses?.find((a) => a.isDefault) || user?.addresses?.[0] || {};
  const sellerLocation = {
    city: shopLocation.city || defaultAddress.city || '',
    province: shopLocation.province || defaultAddress.province || '',
  };
  console.log(
    `👤 Vendedor: ${user?.shop?.name || user?.username || user.email} (${user.email})`
  );
  console.log(
    `📍 Ubicación: ${sellerLocation.city || '—'}, ${sellerLocation.province || '—'}`
  );

  // 3. Cargar catálogo y filtrar (con stock + con imagen).
  const catalog = loadCatalog();
  const eligible = catalog.filter(
    (p) => p.isInStock && Array.isArray(p.images) && p.images.some((i) => i?.src)
  );
  console.log(`\n📦 Catálogo total:           ${catalog.length}`);
  console.log(`✔️  Con stock + imagen:       ${eligible.length}`);
  console.log(`✖️  Descartados (sin stock o sin imagen): ${catalog.length - eligible.length}`);

  const toProcess = LIMIT > 0 ? eligible.slice(0, LIMIT) : eligible;
  if (LIMIT > 0) console.log(`🔢 Se procesarán (límite):  ${toProcess.length}`);

  // 4. Detectar ya importados (por providerRef.id) para no duplicar.
  const existing = await Product.find({
    'providerRef.provider': 'directcar',
    'providerRef.id': { $in: toProcess.map((p) => Number(p.id)) },
  })
    .select('providerRef.id')
    .lean();
  const existingIds = new Set(existing.map((p) => Number(p.providerRef?.id)));
  console.log(`♻️  Ya importados antes:       ${existingIds.size}`);

  const pending = toProcess.filter((p) => !existingIds.has(Number(p.id)));
  console.log(`🆕 A crear:                   ${pending.length}\n`);

  if (pending.length === 0) {
    console.log('Nada por hacer. Saliendo.');
    return;
  }

  // 5. DRY-RUN: mostramos una muestra y salimos sin escribir.
  if (!RUN) {
    console.log('🔎 Muestra (primeros 3 a crear):');
    pending.slice(0, 3).forEach((p) => {
      const img = p.images?.[0]?.src || '';
      console.log(`   • #${p.id} ${p.name.slice(0, 60)}`);
      console.log(`     marca=${p.brands?.[0] || '—'} sku=${p.sku || '—'} img=${img.slice(0, 70)}`);
    });
    console.log('\n⚠️  DRY-RUN: no se escribió nada. Para ejecutar de verdad:');
    console.log('   node src/productsScrape/importDirectcarToUser.mjs --run');
    return;
  }

  // 6. Crear productos en tandas (bulk-ish, tolerante a errores).
  const CHUNK = 200;
  let created = 0;
  let errors = 0;
  const errorSamples = [];
  const createdProductIds = [];

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);

    for (const dc of chunk) {
      try {
        const images = (dc.images || [])
          .map((im) => im?.src)
          .filter(Boolean)
          .slice(0, MAX_IMAGES)
          .map((url, idx) => ({ url, isMain: idx === 0 }));

        if (images.length === 0) continue;

        // Adapter: arma los campos base; luego forzamos precio fijo.
        const mapped = directcarToProduct(dc, { images });

        const doc = new Product({
          ...mapped,
          // Precio fijo para testing (ignora el precio real del proveedor).
          price: FIXED_PRICE,
          sale: { active: false, price: 0 },
          seller: USER_ID,
          sellerName: user?.shop?.name || user?.username || user.email,
          sellerIsVerified: user?.isVerified || false,
          location: sellerLocation,
          status: 'active',
          // Para testing, las publicaciones nacen VISIBLES (aprobadas).
          // Si querés probar el flujo de moderación, dejá este campo en pending.
          moderation: { status: 'approved', approvedAt: new Date() },
          providerRef: {
            ...buildDirectcarProviderRef(dc),
            // El costo real del proveedor lo guardamos igual, para trazabilidad.
            costPvpArs: Number(dc.price) || 0,
            lastSyncAt: new Date(),
          },
        });

        const saved = await doc.save();
        createdProductIds.push(saved._id);
        created += 1;
      } catch (err) {
        errors += 1;
        if (errorSamples.length < 10) {
          errorSamples.push({ id: dc.id, name: dc.name, reason: err.message });
        }
      }
    }

    const done = Math.min(i + CHUNK, pending.length);
    console.log(`   … ${done}/${pending.length} procesados (creados=${created}, errores=${errors})`);
  }

  // 7. Vincular los productos al array User.products (para que aparezcan en el dashboard).
  if (createdProductIds.length > 0) {
    await User.findByIdAndUpdate(USER_ID, {
      $push: { products: { $each: createdProductIds } },
    });
  }

  // 8. Resumen.
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(' RESUMEN');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`✅ Creados:   ${created}`);
  console.log(`⚠️  Errores:   ${errors}`);
  if (errorSamples.length) {
    console.log('   Muestras de error:');
    errorSamples.forEach((e) =>
      console.log(`   • #${e.id} ${String(e.name).slice(0, 40)} → ${e.reason}`)
    );
  }

  // 9. Reporte de uso estimado en MongoDB.
  try {
    const stats = await Product.db.command({ dbStats: 1, scale: 1024 * 1024 });
    console.log(
      `\n💾 DB "${stats.db}": ${stats.dataSize.toFixed(2)} MB datos / ${stats.storageSize.toFixed(
        2
      )} MB storage / ${stats.objects} objetos`
    );
  } catch {
    // dbStats puede no estar permitido en algunos planes; lo ignoramos.
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Error fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('\n🔌 Conexión a MongoDB cerrada.');
  });
