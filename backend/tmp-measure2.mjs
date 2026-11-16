// Mide el ancho real de los textos del kit para detectar desbordes.
// La fila de beneficios pone el 2do item a x = MARGIN + 470 = 542, así que el
// 1ro tiene ~470px disponibles antes de chocar.
import sharp from "sharp";

async function widthOf(text, { size, weight = 700, family = "Arial" }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="${size * 2}">
    <rect width="2000" height="${size * 2}" fill="#000"/>
    <text x="0" y="${size * 1.4}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="#fff">${text}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg))
    .trim()
    .toBuffer({ resolveWithObject: true })
    .then((r) => sharp(r.data).toBuffer({ resolveWithObject: true }));
  return info.width;
}

const MARGIN = 72;
const COL2 = MARGIN + 470; // x del 2do beneficio
const ICON = 38; // el texto arranca a x+38

console.log("=== BENEFICIOS (fila 1: 2 items) ===");
const b1 = "Compra 100% protegida";
const b2 = "Pagá con cripto o transferencia";
const w1 = await widthOf(b1, { size: 26, weight: 600 });
const w2 = await widthOf(b2, { size: 26, weight: 600 });
console.log(`"${b1}" -> ${w1}px  (fin en x=${MARGIN + ICON + w1}, límite ${COL2 - 20})`);
console.log(
  `  ${MARGIN + ICON + w1 < COL2 - 20 ? "OK" : "CHOCA con la 2da columna"}`,
);
console.log(`"${b2}" -> ${w2}px  (fin en x=${COL2 + ICON + w2}, límite ${1008})`);
console.log(
  `  ${COL2 + ICON + w2 < 1008 ? "OK" : "SE SALE del margen derecho"}`,
);

console.log("");
console.log("=== CLAIM (arriba derecha) ===");
for (const line of ["El nuevo", "marketplace", "argentino"]) {
  const w = await widthOf(line, { size: 27, weight: 800 });
  // El claim arranca en x = 1008 - w; el logo ocupa hasta 72+340=412.
  console.log(`"${line}" -> ${w}px, arranca en x=${1008 - w}`);
  console.log(`  ${1008 - w > 430 ? "OK (no toca el logo)" : "CHOCA con el logo"}`);
}
