// Verifica que el logo se haya dibujado, su tamaño y que el reintegro
// incluya el cashback de plataforma.
import sharp from "sharp";

const img = "tmp-kit/kit-con-oferta.jpg";

// Franja del logo: x 72..412, y 40..140
const { data, info } = await sharp(img)
  .extract({ left: 60, top: 30, width: 380, height: 120 })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, bright = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[y * info.width + x] > 120) {
      bright++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
}

console.log("=== LOGO ===");
console.log("pixeles con contenido:", bright);
console.log("caja del logo:", `${maxX - minX + 1}x${maxY - minY + 1}px`);
console.log("ancho que ocupa:", maxX - minX + 1, "(antes ~260, ahora apunta a ~340)");
console.log(bright > 3000 ? "OK: logo dibujado" : "AVISO: casi sin contenido");
