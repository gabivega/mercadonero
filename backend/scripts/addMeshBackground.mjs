// Prueba de fondo con imagen: mesh de lineas y nodos (lines-dots.jpg) bien
// tenue al 25%, y saca los dos semicirculos naranjas de las esquinas.
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");
const before = s;

// ── 1) Loader de la imagen de fondo (cacheado en memoria) ────────────────
const bgMarker = "let logoDataUriCache;";
const bgLoader = `// ── IMAGEN DE FONDO (mesh de lineas y nodos) ─────────────────────────────
// Asset opcional del frontend. Se embebe como data URI y se dibuja como
// PRIMERA capa del SVG, debajo del gradiente y de todo el contenido.
//
// Se cachea en memoria: sin esto, leeriamos 250 KB del disco en cada render.
// Si el archivo no existe, devuelve null y el kit se queda con el gradiente
// liso de siempre (nunca rompemos el render por un asset faltante).
const BG_IMAGE_PATH = path.join(
  process.cwd(),
  "..",
  "frontend",
  "public",
  "assets",
  "img",
  "lines-dots.jpg",
);
let bgImageDataUriCache; // undefined = no intentado, null = fallo, string = ok

async function getBgImageDataUri() {
  if (bgImageDataUriCache !== undefined) return bgImageDataUriCache;
  try {
    const buf = await fs.readFile(BG_IMAGE_PATH);
    bgImageDataUriCache = \`data:image/jpeg;base64,\${buf.toString("base64")}\`;
  } catch {
    console.warn("[ReferralKit] Sin imagen de fondo; uso solo el gradiente.");
    bgImageDataUriCache = null;
  }
  return bgImageDataUriCache;
}

let logoDataUriCache;`;

if (!s.includes(bgMarker)) {
  console.error("No encontre el marcador del logo. Abortando.");
  process.exit(1);
}
if (!s.includes("getBgImageDataUri")) {
  s = s.replace(bgMarker, bgLoader);
}

// ── 2) Pasar la data URI al template ─────────────────────────────────────
// Se resuelve junto al logo, en la misma funcion.
s = s.replace(
  /const logoDataUri = await getLogoDataUri\(\);/,
  `const logoDataUri = await getLogoDataUri();
  // Imagen de fondo opcional (mesh de lineas), tenue.
  const bgImageDataUri = await getBgImageDataUri();`,
);

// El parametro del template: lo agregamos junto a logoDataUri.
s = s.replace(
  /    logoDataUri,\n    logoAspect,/,
  `    logoDataUri,
    logoAspect,
    // Imagen de fondo opcional (null si no se pudo cargar).
    bgImageDataUri = null,`,
);

// ── 3) Dibujar el fondo tenue y sacar los semicirculos ───────────────────
const oldBg = `  <!-- Fondo -->
  <rect width="\${KIT_SIZE}" height="\${KIT_SIZE}" fill="url(#bg)"/>
  <circle cx="1050" cy="40" r="280" fill="\${BRAND}" fill-opacity="0.10"/>
  <circle cx="30" cy="1050" r="300" fill="\${BRAND}" fill-opacity="0.07"/>`;

const newBg = `  <!-- Fondo: gradiente base -->
  <rect width="\${KIT_SIZE}" height="\${KIT_SIZE}" fill="url(#bg)"/>
  <!-- Textura: mesh de lineas y nodos, BIEN tenue (25%) para que no compita
       con el texto. Va encima del gradiente pero debajo de todo el contenido.
       objectFit=cover via preserveAspectRatio: la imagen no es cuadrada
       (1500x1125) y la recortamos sin deformarla. -->
  \${bgImageDataUri ? \`<image x="0" y="0" width="\${KIT_SIZE}" height="\${KIT_SIZE}" href="\${bgImageDataUri}" xlink:href="\${bgImageDataUri}" preserveAspectRatio="xMidYMid slice" opacity="0.25"/>\` : ""}`;

if (!s.includes(oldBg)) {
  console.error("No encontre el bloque de fondo/semicirculos. Abortando.");
  process.exit(1);
}
s = s.replace(oldBg, newBg);

if (s !== before) fs.writeFileSync(P, s, "utf8");

// ── Verificacion en disco ────────────────────────────────────────────────
const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("getBgImageDataUri") &&
  check.includes("bgImageDataUri") &&
  !check.includes('cx="1050" cy="40"');

console.log(ok ? "OK: cambios aplicados" : "FALLO");
if (!ok) {
  console.log("  loader:", check.includes("getBgImageDataUri"));
  console.log("  circulos removidos:", !check.includes('cx="1050" cy="40"'));
}
process.exit(ok ? 0 : 1);
