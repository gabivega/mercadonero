// Verifica la grilla de 4 beneficios: que no haya colisiones horizontales
// ni que nada invada la caja del reintegro.
import sharp from "sharp";

const img = "tmp-kit/kit-con-oferta.jpg";
const MARGIN = 72;
const COL2 = MARGIN + 450; // 522
const ICON = 38;
const RIGHT = 1008;

async function widthOf(text, size = 26, weight = 600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="100">
    <rect width="2200" height="100" fill="#000"/>
    <text x="0" y="70" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="#fff">${text}</text>
  </svg>`;
  const { info } = await sharp(Buffer.from(svg))
    .trim()
    .toBuffer({ resolveWithObject: true })
    .then((r) => sharp(r.data).toBuffer({ resolveWithObject: true }));
  return info.width;
}

const items = [
  ["Compra 100% protegida", MARGIN],
  ["Envío a todo el país", COL2],
  ["Cripto o transferencia", MARGIN],
  ["Nuevos y con garantía", COL2],
];

console.log("=== Anchos de los 4 beneficios (26px / 600) ===\n");
let fallos = 0;
for (const [label, x] of items) {
  const w = await widthOf(label);
  const end = x + ICON + w;
  const limit = x === MARGIN ? COL2 - 20 : RIGHT;
  const ok = end < limit;
  if (!ok) fallos++;
  console.log(
    label.padEnd(34),
    `fin x=${String(end).padEnd(5)} límite=${limit}`,
    ok ? "OK" : "CHOCA",
  );
}

// Verificar que el bloque de texto no invada el reintegro (y=806).
const { data, info } = await sharp(img)
  .extract({ left: 0, top: 760, width: 1080, height: 46 })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
let ink = 0;
for (let i = 0; i < data.length; i++) if (data[i] > 150) ink++;

console.log("");
console.log(`Franja y=760..806 (entre bullets y reintegro): ${ink} px con texto`);
console.log(ink < 900 ? "  OK: no invade el reintegro" : "  AVISO: puede estar invadiendo");
if (ink >= 900) fallos++;

console.log("");
console.log(fallos === 0 ? "=== TODO OK ===" : `=== ${fallos} PROBLEMA(S) ===`);
