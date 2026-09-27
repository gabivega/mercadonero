# SEO de productos — Guía rápida

Este documento resume la infraestructura de SEO de URLs amigables para
productos y **los pasos a dar al momento de salir a producción**.

## Cómo funciona

- Cada producto tiene un `slug` único: `<titulo>-<sufijo>`
  (ej: `consola-gaming-rog-ally-20ky5u`).
  - El slug del título aporta las *keywords* indexables.
  - El sufijo (derivado del `_id`) garantiza unicidad y estabilidad del enlace.
- Las URLs públicas son: `https://mercadonero.com/producto/<slug>`.
- El backend resuelve tanto por **slug** como por **ObjectId** (compatibilidad
  con enlaces viejos). El frontend redirige al slug canónico.
- La página de detalle inyecta dinámicamente:
  - `<title>`, meta `description`, `canonical`, Open Graph y Twitter Card.
  - **JSON-LD** `schema.org/Product` (precio, stock, condición, rating) para
    *rich snippets* en Google.

## Archivos clave

| Archivo | Rol |
| --- | --- |
| `backend/src/utils/slugify.js` | Genera slugs y sufijos |
| `backend/src/models/Product.js` | Campo `slug` + hook `pre-save` |
| `backend/src/controllers/seoController.js` | Endpoint del sitemap |
| `backend/src/scripts/generateSitemap.js` | Genera `frontend/public/sitemap.xml` |
| `backend/src/scripts/backfillProductSlugs.js` | Migra productos sin slug |
| `frontend/src/Utils/productUrl.js` | Helper de URLs de producto |
| `frontend/src/pages/ProductDetail.jsx` | SEO dinámico + canónica |

## ✅ Checklist al lanzar a producción

1. **Habilitar indexación**
   - En `frontend/index.html`: **eliminar** la línea
     `<meta name="robots" content="noindex, nofollow" />`.
   - En `frontend/public/robots.txt`: activar la "VERSIÓN PARA PRODUCCIÓN"
     (descomentar y borrar el bloque de bloqueo).

2. **Generar el sitemap** (con acceso a la DB de producción):
   ```bash
   cd backend
   node src/scripts/generateSitemap.js
   ```
   Esto escribe `frontend/public/sitemap.xml`. Regenerarlo periódicamente
   (cron) para mantenerlo fresco.

3. **Migrar productos existentes** (si quedaran sin slug):
   ```bash
   cd backend
   node src/scripts/backfillProductSlugs.js
   ```

4. **Variable de entorno** `SITE_URL` en el backend
   (ej: `SITE_URL=https://mercadonero.com`) para que el sitemap use el dominio
   correcto.

5. **Enviar el sitemap a Google** (Search Console) y solicitar indexación.

## Mejora futura recomendada

El sitio es una SPA: Googlebot ejecuta JS, pero para maximizar la indexación
conviene el **prerender/SSR** de las páginas de producto (ej. `vite-plugin-ssr`,
prerender con Puppeteer en el build, o migrar el detalle a SSR). Con la
infraestructura actual (slug + meta dinámica + sitemap + JSON-LD) ya se sientan
las bases; el prerender sería el siguiente salto.
