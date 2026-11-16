// Deshace el experimento del fondo mesh: deja el kit con el gradiente liso
// y SIN los semicirculos naranjas (ese cambio se mantiene, era lo pedido).
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");

// 1) Sacar el <image> del mesh del SVG (deja la linea limpia).
const imgRe =
  /  \$\{bgImageDataUri \? `<image[^`]*` : ""\}/;
if (imgRe.test(s)) {
  s = s.replace(imgRe, "");
  console.log("OK: <image> del mesh removido del SVG.");
} else {
  console.log("Aviso: no encontre el <image> del mesh.");
}

// 2) Sacar el parametro del destructuring.
s = s.replace(
  /\n    \/\/ Imagen de fondo opcional \(mesh de lineas\), ya como data URI\.\n    \/\/ null = no se pudo cargar -> el kit queda solo con el gradiente\.\n    bgImageDataUri = null,/,
  "",
);

// 3) Sacar el paso en la llamada a buildTemplateSvg.
s = s.replace(/\n      bgImageDataUri,/, "");

// 4) Sacar la carga del Promise.all.
s = s.replace(
  /const \[fontStyle, logoDataUri, bgImageDataUri\] = await Promise\.all\(\[\n    getFontStyleBlock\(\),\n    getLogoDataUri\(\),\n    getBgImageDataUri\(\),\n  \]\);/,
  `const [fontStyle, logoDataUri] = await Promise.all([
    getFontStyleBlock(),
    getLogoDataUri(),
  ]);`,
);

fs.writeFileSync(P, s, "utf8");

// Verificacion: que no queden restos y que la sintaxis sea coherente.
const check = fs.readFileSync(P, "utf8");
console.log("");
console.log("restos de bgImageDataUri:", check.includes("bgImageDataUri"));
console.log("semicirculos removidos:", !check.includes('cx="1050" cy="40"'));
