/**
 * Migración: genera y guarda el `slug` SEO para todos los productos que
 * todavía no lo tienen (registros creados antes de esta funcionalidad).
 *
 * Uso (desde /backend, con acceso a la DB):
 *   node src/scripts/backfillProductSlugs.js
 *
 * Es idempotente: sólo toca productos sin slug. Guardar dispara el hook
 * pre-save del modelo (o lo forzamos explícitamente con save()).
 */
import "dotenv/config";
import connectDB from "../config/database.js";
import Product from "../models/Product.js";
import { buildProductSlug } from "../utils/slugify.js";

const run = async () => {
  await connectDB();

  const products = await Product.find({
    $or: [{ slug: { $exists: false } }, { slug: "" }, { slug: null }],
  });

  console.log(`Productos sin slug: ${products.length}`);

  let ok = 0;
  let fail = 0;

  for (const product of products) {
    try {
      product.slug = buildProductSlug(product.name, product._id);
      // save() dispara el hook pre-save (idempotente) y valida unicidad.
      await product.save();
      ok++;
    } catch (err) {
      fail++;
      console.warn(`⚠️  No se pudo procesar ${product._id}: ${err.message}`);
    }
  }

  console.log(`✅ Slugs generados: ${ok}. Fallidos: ${fail}.`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Error en backfill:", err);
  process.exit(1);
});
