// Diagnostico: confirma si el <image> del fondo llega al SVG generado.
import fs from "fs/promises";
import path from "path";

// Replicamos el loader.
const p = path.join(process.cwd(), "..", "frontend", "public", "assets", "img", "lines-dots.jpg");
const buf = await fs.readFile(p);
const uri = `data:image/jpeg;base64,${buf.toString("base64")}`;
console.log("data URI generada: len =", uri.length, "chars");

// Construimos un SVG MINIMO con la imagen y lo rasterizamos.
import sharp from "sharp";

const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="1080" height="1080" fill="#0b0b0f"/>
  <image x="0" y="0" width="1080" height="1080" href="${uri}" xlink:href="${uri}" preserveAspectRatio="xMidYMid slice" opacity="0.25"/>
</svg>`;

console.log("SVG len =", svg.length);

try {
  const out = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  await fs.writeFile("tmp-kit/bg-test.jpg", out);
  console.log("Rasterizado OK ->", out.length, "bytes");

  // Medimos: si el mesh aparece, hay variacion.
  const { data, info } = await sharp(out)
    .extract({ left: 400, top: 400, width: 280, height: 280 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lums = [];
  for (let i = 0; i < data.length; i += info.channels)
    lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const sd = Math.sqrt(lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length);
  console.log("lum media:", mean.toFixed(1), "sd:", sd.toFixed(1));
  console.log(sd > 1 ? "-> LA IMAGEN SI SE DIBUJA" : "-> NO se dibuja (liso)");
} catch (e) {
  console.error("FALLO el rasterizado:", e.message);
}
