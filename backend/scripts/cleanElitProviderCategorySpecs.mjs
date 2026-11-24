// Limpia de las publicaciones importadas de Elit los specs
// "Categoría proveedor" y "Subcategoría proveedor".
//
// POR QUÉ EXISTE:
//   El adapter viejo (elitAdapter.js) inyectaba la categoría ORIGINAL del
//   proveedor en `specifications` y `buildDescription` volcaba TODAS las specs
//   al final de la descripción. Resultado: el comprador leía
//   "• Categoría proveedor: Audio • Subcategoría proveedor: Parlantes",
//   información interna que no debe ver el público (la categoría de MN ya se
//   muestra en el breadcrumb y en el filtro del catálogo).
//
// QUÉ HACE (idempotente):
//   1. Quita del array `specifications` los pares con esas claves.
//   2. Borra de `description` las líneas "• Categoría proveedor: ..." y
//      "• Subcategoría proveedor: ..." (dejando el resto intacto).
//   3. Limpia los saltos de línea huérfanos que queden al final.
//
// Uso:
//   cd backend && node scripts/cleanElitProviderCategorySpecs.mjs            (dry-run)
//   cd backend && node scripts/cleanElitProviderCategorySpecs.mjs --apply    (escribe)
import 'dotenv/config';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!URI) {
  console.error('Falta MONGO_URI / MONGODB_URI en backend/.env');
  process.exit(1);
}

// Claves exactas que inyectaba el adapter viejo.
const KEYS = ['Categoría proveedor', 'Subcategoría proveedor'];

// Regex tolerante al acento roto (mojibake) y a la ausencia de tilde.
const KEY_RE =
  /^\s*[•\-*]?\s*(Categor[ií]?a|Subcategor[ií]?a)\s*proveedor\s*:/i;

const stripSpecLines = (text = '') => {
  const lines = String(text).split(/\r?\n/);
  const kept = lines.filter((l) => !KEY_RE.test(l));
  return (
    kept
      .join('\n')
      // Colapsa los saltos de línea que quedaban colgando al final.
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, '')
  );
};

async function main() {
  await mongoose.connect(URI);
  console.log('Base de datos:', mongoose.connection.name);

  const coll = mongoose.connection.db.collection('products');

  // Candidatos: los que tengan alguna de las claves en specs o en description.
  const filter = {
    $or: [
      { 'specifications.key': { $in: KEYS } },
      { description: /proveedor\s*:/i },
    ],
  };

  const total = await coll.countDocuments(filter);
  console.log(`Productos candidatos: ${total}`);

  const cursor = coll.find(filter, {
    projection: { name: 1, description: 1, specifications: 1 },
  });

  let touched = 0;
  let errors = 0;

  for await (const p of cursor) {
    const specs = Array.isArray(p.specifications) ? p.specifications : [];
    const newSpecs = specs.filter(
      (s) => !KEYS.includes(String(s?.key || '')) && !KEY_RE.test(`${s?.key || ''}:`)
    );
    const newDescription = stripSpecLines(p.description || '');

    const specsChanged = newSpecs.length !== specs.length;
    const descChanged = newDescription !== (p.description || '');

    if (!specsChanged && !descChanged) continue;

    touched += 1;
    if (touched <= 5) {
      console.log(`\n— ${p.name}`);
      if (specsChanged) {
        console.log(`  specs: ${specs.length} -> ${newSpecs.length}`);
      }
      if (descChanged) {
        const before = (p.description || '')
          .split(/\r?\n/)
          .filter((l) => KEY_RE.test(l));
        console.log(`  description: se quitan ${before.length} linea(s) de proveedor`);
      }
    }

    if (APPLY) {
      try {
        await coll.updateOne(
          { _id: p._id },
          { $set: { specifications: newSpecs, description: newDescription } }
        );
      } catch (e) {
        errors += 1;
        console.error(`  ERROR ${p._id}: ${e.message}`);
      }
    }
  }

  console.log(
    `\n${APPLY ? 'APLICADO' : 'DRY-RUN'} -> productos a modificar: ${touched}, errores: ${errors}`
  );
  if (!APPLY) console.log('Volvé a correrlo con --apply para escribir los cambios.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
