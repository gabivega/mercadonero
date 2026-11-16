// Verifica el fondo nuevo:
//   1. La esquina superior derecha YA NO tiene el halo naranja (se sacaron).
//   2. La esquina inferior izquierda tampoco.
//   3. Hay textura (variacion de pixeles) en una zona que antes era liso.
import sharp from "sharp";

const img = "tmp-kit/kit-con-oferta.jpg";

async function stats(label, left, top, w, h) {
  const { data, info } = await sharp(img)
    .extract({ left, top, width: w, height: h })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  const lums = [];
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    rSum += r; gSum += g; bSum += b; n++;
    lums.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const varr = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length;
  const sd = Math.sqrt(varr);
  const min = Math.min(...lums), max = Math.max(...lums);

  console.log(
    label.padEnd(26),
    `R:${(rSum / n).toFixed(0)} G:${(gSum / n).toFixed(0)} B:${(bSum / n).toFixed(0)}`,
    `| lum min:${min.toFixed(0)} max:${max.toFixed(0)}`,
    `sd:${sd.toFixed(1)}`,
  );
  return { r: rSum / n, g: gSum / n, b: bSum / n, sd, max };
}

console.log("=== Esquinas (donde estaban los semicirculos) ===\n");
const tr = await stats("sup. derecha", 900, 30, 170, 170);
const bl = await stats("inf. izquierda", 10, 900, 170, 170);
// Zona de fondo limpio: entre el header y el titulo, lado derecho (sin texto
// ni foto). Antes era un gradiente liso; ahora deberia tener el mesh.
const center = await stats("fondo sup. derecho", 760, 180, 200, 90);

console.log("");
// Un halo naranja se veria como R claramente mayor a B.
const noOrangeTR = tr.r - tr.b < 40;
const noOrangeBL = bl.r - bl.b < 40;
console.log("Semicirculo sup.derecha removido:", noOrangeTR ? "OK" : "TODAVIA HAY NARANJA");
console.log("Semicirculo inf.izquierda removido:", noOrangeBL ? "OK" : "TODAVIA HAY NARANJA");

console.log("");
// Textura: si el fondo fuera liso, sd seria ~0.
console.log("Textura en el centro (sd):", center.sd.toFixed(1), center.sd > 2 ? "-> HAY textura" : "-> LISO (sin textura)");
