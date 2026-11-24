// Re-pricing del catálogo Elit con la estrategia de `pricingElitService.js`
// (markup escalonado + envío gratis por margen).
//
// POR QUÉ EXISTE:
//   La importación inicial usó un markup FIJO de 20% para todo el catálogo.
//   Eso deja productos baratos sin margen (el envío se come el 60% del valor)
//   y productos caros fuera de mercado. Este script recalcula precio, envío y
//   métodos de pago/entrega sobre los ~986 productos importados de Elit.
//
// QUÉ CAMBIA (solo productos con providerRef.provider == 'elit'):
//   - price                                   ← nuevo precio por escalón
//   - shipping.free                           ← regla de margen
//   - shipping.cost                           ← 0 (Zipnova cotiza al comprador)
//   - shipping.delivery.homeDelivery          ← true
//   - shipping.delivery.homeDeliveryMode      ← 'zipnova'
//   - shipping.delivery.pickup                ← true   (retiro habilitado)
//   - shipping.delivery.pickupLocationIds     ← []     (vacío = todas)
//   - payment.acceptsTransfer                 ← true
//   - payment.acceptsCrypto                   ← true
//
// QUÉ NO TOCA (a propósito):
//   stock, reservedStock, images, specifications, description, warranty,
//   moderation, sale (descuentos manuales), status, providerRef, slug.
//
// USO:
//   node scripts/repriceElitProducts.mjs                → dry-run (resumen)
//   node scripts/repriceElitProducts.mjs --explain      → dry-run + tabla por producto
//   node scripts/repriceElitProducts.mjs --apply        → escribe en la base
//
// Ajustes manuales posteriores:
//   Si un producto puntual necesita otro peso/precio/envío, se corrige a mano
//   en el panel. Volver a correr este script lo PISA. Para excluir un producto
//   del re-pricing: setear `providerRef.pricingLocked = true` en la base
//   (se respeta y se informa en el reporte).
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  calculateElitPricing,
  PLATFORM_FEE_PERCENT,
  FREE_SHIPPING_MIN_PRICE,
} from '../src/services/pricingElitService.js';

const APPLY = process.argv.includes('--apply');
const EXPLAIN = process.argv.includes('--explain');
const URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

if (!URI) {
  console.error('Falta MONGO_URI / MONGODB_URI en backend/.env');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  console.log('Base de datos:', mongoose.connection.name);
  console.log(`Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN'}${EXPLAIN ? ' + EXPLAIN' : ''}`);
  console.log(
    `Estrategia: markup escalonado + envío gratis solo ≥ ${money(FREE_SHIPPING_MIN_PRICE)} y si el margen lo cubre (comisión ${PLATFORM_FEE_PERCENT}%)\n`
  );

  const coll = mongoose.connection.db.collection('products');

  const filter = { 'providerRef.provider': 'elit' };
  const total = await coll.countDocuments(filter);
  console.log(`Productos Elit en la base: ${total}\n`);

  const cursor = coll.find(filter, {
    projection: {
      name: 1,
      price: 1,
      subCategory: 1,
      shipping: 1,
      payment: 1,
      providerRef: 1,
    },
  });

  // ── Acumuladores para el resumen ──
  const stats = {
    scanned: 0,
    locked: 0,
    noCost: 0,
    priceUp: 0,
    priceDown: 0,
    priceSame: 0,
    freeOn: 0,   // pasaron a envío gratis
    freeOff: 0,  // pasaron a envío cobrado
    freeSame: 0,
    cryptoOn: 0,
    pickupOn: 0,
    // Productos cuyo precio final queda por debajo del piso de envío gratis:
    // siempre se cotiza el envío. No es un error, es la regla de negocio.
    belowFloor: 0,
    finalFree: 0,     // resultado final: queda con envío gratis
    finalCharged: 0,  // resultado final: queda con envío cotizado
    errors: 0,
    negativeMargin: 0, // dato corrupto: NO se escribe
    sumPriceBefore: 0,
    sumPriceAfter: 0,
  };

  // Desglose por rango de PRECIO DE VENTA (no de costo).
  const byPriceRange = {
    'hasta $50.000 (envío cotizado)': { count: 0, free: 0 },
    '$50.001 - $100.000': { count: 0, free: 0 },
    '$100.001 - $200.000': { count: 0, free: 0 },
    '$200.001 - $500.000': { count: 0, free: 0 },
    '$500.001 - $1.000.000': { count: 0, free: 0 },
    '> $1.000.000': { count: 0, free: 0 },
  };

  const priceRangeOf = (price) => {
    if (price <= 50000) return 'hasta $50.000 (envío cotizado)';
    if (price <= 100000) return '$50.001 - $100.000';
    if (price <= 200000) return '$100.001 - $200.000';
    if (price <= 500000) return '$200.001 - $500.000';
    if (price <= 1000000) return '$500.001 - $1.000.000';
    return '> $1.000.000';
  };

  const byTier = {}; // agrupa por tramo de markup
  const warnings = []; // productos con margen ajustado o datos raros
  const ids = [];

  for await (const p of cursor) {
    stats.scanned += 1;

    if (p?.providerRef?.pricingLocked === true) {
      stats.locked += 1;
      continue;
    }

    const cost = Number(p?.providerRef?.costPvpArs) || 0;
    if (cost <= 0) {
      stats.noCost += 1;
      warnings.push({ name: p.name, kind: 'sin costo (pvp_ars=0)' });
      continue;
    }

    const r = calculateElitPricing({
      cost,
      weight: p?.shipping?.dimensions?.weight,
      subCategory: p.subCategory,
    });

    const beforePrice = Number(p.price) || 0;
    stats.sumPriceBefore += beforePrice;
    stats.sumPriceAfter += r.price;

    if (r.price > beforePrice) stats.priceUp += 1;
    else if (r.price < beforePrice) stats.priceDown += 1;
    else stats.priceSame += 1;

    // Cambios de envío gratis respecto al estado actual.
    const wasFree = p?.shipping?.free === true;
    if (r.freeShipping && !wasFree) stats.freeOn += 1;
    else if (!r.freeShipping && wasFree) stats.freeOff += 1;
    else stats.freeSame += 1;

    // Métodos de pago/entrega.
    if (p?.payment?.acceptsCrypto !== true) stats.cryptoOn += 1;
    if (p?.shipping?.delivery?.pickup !== true) stats.pickupOn += 1;

    // Producto bajo el piso de envío gratis: se cotiza aparte. Es lo esperado.
    if (r.price < FREE_SHIPPING_MIN_PRICE) stats.belowFloor += 1;
    if (r.freeShipping) stats.finalFree += 1;
    else stats.finalCharged += 1;

    // Chequeo de sanidad: margen negativo solo puede venir de un dato corrupto
    // (costo absurdo o precio 0). NO se escribe: sería vender a pérdida.
    if (r.netMargin < 0) {
      stats.negativeMargin += 1;
      warnings.push({
        name: p.name,
        kind: `MARGEN NEGATIVO ${money(r.netMargin)} (costo ${money(r.cost)}, precio ${money(r.price)}) — no se escribe`,
      });
      continue;
    }

    // Agrupación por tramo de markup.
    const key = r.markupTier;
    byTier[key] = byTier[key] || { count: 0, markup: r.markup, free: 0 };
    byTier[key].count += 1;
    if (r.freeShipping) byTier[key].free += 1;

    // Agrupación por rango de precio de venta.
    const range = priceRangeOf(r.price);
    byPriceRange[range].count += 1;
    if (r.freeShipping) byPriceRange[range].free += 1;

    if (EXPLAIN && ids.length < 30) {
      ids.push(null);
      console.log(
        [
          p.name?.slice(0, 42).padEnd(42),
          `costo ${money(r.cost).padStart(11)}`,
          `${String(Math.round(r.markup * 100)).padStart(3)}%`,
          `precio ${money(beforePrice).padStart(12)} → ${money(r.price).padStart(12)}`,
          `peso ${String(r.weightKg).padStart(5)}kg`,
          r.freeShipping ? 'GRATIS' : `cobra ${money(r.shippingEstimate)}`,
        ].join('  ')
      );
    }

    if (APPLY) {
      const update = {
        price: r.price,
        'shipping.free': r.freeShipping,
        'shipping.cost': 0,
        'shipping.delivery.homeDelivery': true,
        'shipping.delivery.homeDeliveryMode': 'zipnova',
        'shipping.delivery.pickup': true,
        'shipping.delivery.pickupLocationIds': [],
        'payment.acceptsTransfer': true,
        'payment.acceptsCrypto': true,
      };
      try {
        await coll.updateOne({ _id: p._id }, { $set: update });
      } catch (e) {
        stats.errors += 1;
        console.error(`  ERROR ${p._id}: ${e.message}`);
      }
    }
  }

  // ── REPORTE ──
  console.log('╔════════════════════════ RESUMEN ════════════════════════');
  console.log(`  Escaneados:            ${stats.scanned}`);
  console.log(`  Locked (pricingLocked):${stats.locked}`);
  console.log(`  Sin costo (pvp_ars=0): ${stats.noCost}`);
  console.log('  ── Precio ──');
  console.log(`    suben:               ${stats.priceUp}`);
  console.log(`    bajan:               ${stats.priceDown}`);
  console.log(`    iguales:             ${stats.priceSame}`);
  console.log(`    valor catálogo:      ${money(stats.sumPriceBefore)} → ${money(stats.sumPriceAfter)}`);
  console.log('  ── Envío gratis ──');
  console.log(`    se prenden:          ${stats.freeOn}`);
  console.log(`    se apagan:           ${stats.freeOff}`);
  console.log(`    sin cambio:          ${stats.freeSame}`);
  console.log('  ── Métodos ──');
  console.log(`    se habilita crypto:  ${stats.cryptoOn}`);
  console.log(`    se habilita retiro:  ${stats.pickupOn}`);
  console.log('  ── Envío gratis (resultado final) ──');
  console.log(`    con envío gratis:    ${stats.finalFree}`);
  console.log(`    envío cotizado:      ${stats.finalCharged}`);
  console.log(`    bajo piso ${money(FREE_SHIPPING_MIN_PRICE)}:      ${stats.belowFloor} (siempre cotizado)`);
  console.log('  ── Sanidad ──');
  console.log(`    margen negativo:     ${stats.negativeMargin} (no se escriben)`);
  console.log(`    errores:             ${stats.errors}`);
  console.log('╚═════════════════════════════════════════════════════════\n');

  console.log('── Por rango de PRECIO DE VENTA ──');
  for (const [label, data] of Object.entries(byPriceRange)) {
    console.log(
      `  ${label.padEnd(32)} ${String(data.count).padStart(4)} productos  (${data.free} con envío gratis)`
    );
  }

  console.log('\n── Por tramo de markup (costo Elit) ──');
  for (const [label, data] of Object.entries(byTier)) {
    console.log(
      `  ${label.padEnd(22)} ${String(Math.round(data.markup * 100)).padStart(3)}%  →  ${String(data.count).padStart(4)} productos  (${data.free} con envío gratis)`
    );
  }

  if (warnings.length) {
    console.log(`\n── A REVISAR (${warnings.length}) ──`);
    warnings.slice(0, 40).forEach((w) => console.log(`  · ${w.name?.slice(0, 55)} → ${w.kind}`));
    if (warnings.length > 40) console.log(`  … y ${warnings.length - 40} más`);
  }

  console.log(
    `\n${APPLY ? '✅ APLICADO' : '🔍 DRY-RUN (no se escribió nada)'}`
  );
  if (!APPLY) {
    console.log('Corré con --apply para escribir. Con --explain ves la tabla por producto.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
