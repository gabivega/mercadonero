// ─────────────────────────────────────────────────────────────────────────────
// CORRECCIÓN DE PRECIOS DirectCar
//
// La carga masiva (importDirectcarToUser.mjs) se hizo con DC_PRICE=40000 fijo,
// por lo que TODOS los productos quedaron con price=40000 aunque el precio real
// del proveedor es otro (quedó guardado en providerRef.costPvpArs).
//
// Este script corrige el `price` usando el catálogo scrapeado como fuente de
// verdad, SIN markup y SIN precio de oferta (todo estandarizado):
//     price = precio del proveedor (el mismo que muestra el proveedor)
//     sale  = { active:false, price:0 }
//
// Sólo toca `price` y `sale` de los productos con providerRef.provider='directcar'.
// No reimporta nada ni toca imágenes/categorías/etc.
//
// Uso (desde backend/):
//   node src/productsScrape/fixDirectcarPrices.mjs            # dry-run
//   node src/productsScrape/fixDirectcarPrices.mjs --run      # aplica cambios
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Product from '../models/Product.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUN = process.argv.includes('--run');
const CATALOG_PATH = path.join(__dirname, 'directcar_productos.json');

function loadCatalogById() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(
      `No se encontró el catálogo en ${CATALOG_PATH}. Corré primero scrapeDirectcar.mjs`
    );
  }
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const list = Array.isArray(raw.products) ? raw.products : [];
  const byId = new Map();
  for (const p of list) {
    const id = Number(p?.id);
    if (Number.isFinite(id)) byId.set(id, p);
  }
  return byId;
}

async function main() {
  console.log('─────────────────────────────────────────────────────────────');
  console.log(' Corrección de PRECIOS DirectCar (sin markup, sin ofertas)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`Modo: ${RUN ? 'EJECUCIÓN REAL' : 'DRY-RUN (no escribe nada)'}\n`);

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI no está seteado en .env');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB');

  const byId = loadCatalogById();
  console.log(`📖 Catálogo JSON: ${byId.size} productos por id`);

  const dbProducts = await Product.find(
    { 'providerRef.provider': 'directcar', status: { $ne: 'deleted' } },
    { price: 1, sale: 1, 'providerRef.id': 1, 'providerRef.costPvpArs': 1 }
  ).lean();
  console.log(`📦 Productos directcar en DB: ${dbProducts.length}\n`);

  let toUpdate = 0;
  let same = 0;
  let notInCatalog = 0;
  let noPrice = 0;
  const samples = [];
  const bulkOps = [];

  for (const p of dbProducts) {
    const pid = Number(p?.providerRef?.id);
    const dc = byId.get(pid);
    if (!dc) {
      notInCatalog += 1;
      continue;
    }

    // Precio del proveedor = el mismo que él muestra. Fallback al costo guardado.
    const supplierPrice = Number(dc.price) || Number(p?.providerRef?.costPvpArs) || 0;
    if (!(supplierPrice > 0)) {
      noPrice += 1;
      continue;
    }

    const curPrice = Number(p.price) || 0;
    const curSaleActive = Boolean(p.sale?.active);
    const curSalePrice = Number(p.sale?.price) || 0;

    // Estándar: price = precio proveedor, sale inactivo.
    const changed =
      curPrice !== supplierPrice || curSaleActive !== false || curSalePrice !== 0;

    if (!changed) {
      same += 1;
      continue;
    }

    toUpdate += 1;
    if (samples.length < 10) {
      samples.push({ id: pid, name: dc.name?.slice(0, 50), from: curPrice, to: supplierPrice });
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { price: supplierPrice, sale: { active: false, price: 0 } } },
      },
    });
  }

  console.log('Resumen:');
  console.log(`  ✏️  A actualizar:        ${toUpdate}`);
  console.log(`  ✅ Ya correctos:        ${same}`);
  console.log(`  ❓ No están en JSON:    ${notInCatalog}`);
  console.log(`  ⚠️  Sin precio válido:   ${noPrice}`);

  if (samples.length) {
    console.log('\nMuestra de cambios (id | nombre | $actual → $nuevo):');
    samples.forEach((s) => {
      console.log(`  • #${s.id} ${s.name}  |  $${s.from} → $${s.to}`);
    });
  }

  if (!RUN) {
    console.log('\n⚠️  DRY-RUN: no se escribió nada. Para aplicar:');
    console.log('   node src/productsScrape/fixDirectcarPrices.mjs --run');
    return;
  }

  if (bulkOps.length === 0) {
    console.log('\nNada por actualizar.');
    return;
  }

  const CHUNK = 500;
  let modified = 0;
  for (let i = 0; i < bulkOps.length; i += CHUNK) {
    const slice = bulkOps.slice(i, i + CHUNK);
    const r = await Product.bulkWrite(slice, { ordered: false });
    modified += r.modifiedCount || 0;
    console.log(`   … ${Math.min(i + CHUNK, bulkOps.length)}/${bulkOps.length} (modificados=${modified})`);
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`✅ Precios actualizados: ${modified}`);
  console.log('─────────────────────────────────────────────────────────────');
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
