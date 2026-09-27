import Product from "../models/Product.js";
import allCategories from "../categoriesWithSlugs.js";

/**
 * Dominio público del sitio (sin barra final). Se puede sobreescribir con la
 * variable de entorno SITE_URL. Es la base de TODAS las URLs del sitemap.
 */
const SITE_URL = (process.env.SITE_URL || "https://mercadonero.com").replace(
  /\/$/,
  "",
);

// Escapa caracteres especiales de XML (&, <, >, ", ') en URLs y textos.
const escapeXml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const urlTag = ({ loc, lastmod, changefreq, priority }) => {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>${
      lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""
    }${changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : ""}${
    priority ? `\n    <priority>${priority}</priority>` : ""
  }
  </url>`;
};

/**
 * GET /sitemap.xml
 * Sitemap dinámico con:
 *   - Home
 *   - Todas las categorías (/c/<slug>)
 *   - Todos los productos activos, usando su URL SEO (/producto/<slug>)
 * Se genera al vuelo desde la base. Para catálogos muy grandes conviene
 * paginar en varios sitemaps (sitemap-index), pero para el volumen actual un
 * único archivo alcanza.
 */
export const getSitemap = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const urls = [];

    // 1. Home
    urls.push(
      urlTag({
        loc: `${SITE_URL}/`,
        lastmod: today,
        changefreq: "daily",
        priority: "1.0",
      }),
    );

    // 2. Categorías
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

    // 3. Productos activos (solo los que tienen slug y seller con wallet,
    //    igual que la vitrina pública).
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

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.header("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  } catch (error) {
    console.error("Error generando sitemap:", error);
    res.status(500).send("Error generando sitemap");
  }
};
