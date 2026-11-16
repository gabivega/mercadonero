// Mide cuánto ocupa realmente una línea de título a 46px con Poppins,
// para dimensionar bien el ancho útil del kit.
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="90">
<rect width="1200" height="90" fill="#000"/>
<text x="0" y="62" font-family="Arial" font-size="46" font-weight="800" fill="#fff">Notebook Gamer Repub</text>
</svg>`;

const { info } = await sharp(Buffer.from(svg))
  .trim()
  .toBuffer({ resolveWithObject: true })
  .then((r) => sharp(r.data).toBuffer({ resolveWithObject: true }));

console.log("20 chars @46px Arial  ->", info.width, "px");
console.log("");
console.log("Geometría del kit:");
console.log("  PHOTO x=72 size=400  -> foto termina en 472");
console.log("  TX = 472 + 48        ->", 472 + 48);
console.log("  TEXT_RIGHT = 1080-72 ->", 1080 - 72);
console.log("  Ancho útil           ->", 1080 - 72 - (472 + 48), "px");
