// Agrega el parametro bgImageDataUri al destructuring de buildTemplateSvg.
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");

const old = `    logoAspect = null,
  } = data;`;

const neu = `    logoAspect = null,
    // Imagen de fondo opcional (mesh de lineas), ya como data URI.
    // null = no se pudo cargar -> el kit queda solo con el gradiente.
    bgImageDataUri = null,
  } = data;`;

if (!s.includes(old)) {
  console.error("No encontre el destructuring. Abortando.");
  process.exit(1);
}
if (s.includes("bgImageDataUri = null,")) {
  console.log("Ya estaba agregado.");
  process.exit(0);
}

s = s.replace(old, neu);
fs.writeFileSync(P, s, "utf8");

const check = fs.readFileSync(P, "utf8");
const ok = check.includes("bgImageDataUri = null,");
console.log(ok ? "OK: parametro agregado" : "FALLO");
process.exit(ok ? 0 : 1);
