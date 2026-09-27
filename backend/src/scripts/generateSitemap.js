/**
 * Genera el sitemap.xml estático a partir de los productos activos y las
 * categorías, y lo escribe en frontend/public/sitemap.xml.
 *
 * Uso (desde /backend, con acceso a la DB):
 *   node src/scripts/generateSitemap.js
 *
 * Ideal para correrlo en el deploy (o por cron) para mantener fresco el
 * sitemap que sirve el frontend estático.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "../config/database.js";
import Product from "../models/Product.js";
import allCategories from "../categoriesWithSlugs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_URL = (process.env.SITE_URL || "https://mercadonero.com").replace(
  /\/$/,
  "",
);

const escapeXml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const urlTag = ({ loc, lastmod, changefreq, priority }) =>
  `  <url>\n    <loc>${escapeXml(loc)}</loc>` +
  (lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "") +
  (changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : "") +
  (priority ? `\n    <priority>${priority}</priority>` : "") +
  `\n  </url>`;

const run = async () => {
  await connectDB();

  const today = new Date().toISOString().split("T")[0];
  const urls = [];

  urls.push(
    urlTag({
      loc: `${SITE_URL}/`,
      lastmod: today,
      changefreq: "daily",
      priority: "1.0",
    }),
  );

  allCategories.forEach((cat) => {
    if (cat.slug) {
      urls.push(
        urlTag({
          loc: `${SITE_URL}/c/${cat.slug}`,
          changefreq: "daily",
          priority: "0.7",
        }),
      );
    }
  });

  const products = await Product.find(
    { status: "active", slug: { $exists: true, $ne: "" } },
    "slug updatedAt",
  )
    .sort({ updatedAt: -1 })
    .lean();

  products.forEach((p) => {
    urls.push(
      urlTag({
        loc: `${SITE_URL}/producto/${p.slug}`,
        lastmod: (p.updatedAt || new Date()).toISOString().split("T")[0],
        changefreq: "weekly",
        priority: "0.8",
      }),
    );
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    "\n",
  )}\n</urlset>`;

  const outPath = path.resolve(
    __dirname,
    "../../../frontend/public/sitemap.xml",
  );
  fs.writeFileSync(outPath, xml, "utf-8");
  console.log(`✅ Sitemap generado: ${outPath} (${urls.length} URLs)`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Error generando sitemap:", err);
  process.exit(1);
});
