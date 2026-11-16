// Conecta la imagen de fondo: la carga en el Promise.all y la pasa al SVG.
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");

// 1) Cargarla junto a la fuente y el logo.
const oldLoad = `  const [fontStyle, logoDataUri] = await Promise.all([
    getFontStyleBlock(),
    getLogoDataUri(),
  ]);`;

const newLoad = `  const [fontStyle, logoDataUri, bgImageDataUri] = await Promise.all([
    getFontStyleBlock(),
    getLogoDataUri(),
    getBgImageDataUri(),
  ]);`;

if (!s.includes(oldLoad)) {
  console.error("No encontre el Promise.all. Abortando.");
  process.exit(1);
}
s = s.replace(oldLoad, newLoad);

// 2) Pasarla al template.
const oldCall = `      logoDataUri,
      logoAspect,
    }),`;

const newCall = `      logoDataUri,
      logoAspect,
      bgImageDataUri,
    }),`;

if (!s.includes(oldCall)) {
  console.error("No encontre la llamada a buildTemplateSvg. Abortando.");
  process.exit(1);
}
s = s.replace(oldCall, newCall);

fs.writeFileSync(P, s, "utf8");

const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("getBgImageDataUri(),") && check.includes("bgImageDataUri,\n    }),");
console.log(ok ? "OK: fondo conectado" : "FALLO");
process.exit(ok ? 0 : 1);
