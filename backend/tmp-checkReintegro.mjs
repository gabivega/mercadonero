// Verifica la caja del reintegro: que se vea el monto y no se desborde.
// Simula distintos montos para el peor caso (monto alto de 4-5 dígitos).
import sharp from "sharp";
import fs from "fs";
import { renderReferralKit } from "./src/services/referralKitService.js";

const photo = await sharp({
  create: { width: 600, height: 600, channels: 3, background: "#334155" },
}).jpeg().toBuffer();

const base = {
  name: "Producto de prueba",
  price: 1899000,
  currency: "ARS",
  listingType: "product",
  sellerName: "Nero Store",
  category: "electronica",
  referral: { enabled: true, percent: 10 },
  images: [{ url: `data:image/jpeg;base64,${photo.toString("base64")}`, isMain: true }],
};

console.log("=== Caja del reintegro: distintos montos ===\n");
const montos = [0.5, 4.25, 42.75, 128.5, 1234.56];

for (const m of montos) {
  const buf = await renderReferralKit({
    product: base,
    shortUrl: "https://mercadonero.com/r/abc",
    buyerRewardUsd: m,
  });
  fs.writeFileSync(`tmp-kit/reintegro-${m}.jpg`, buf);

  // La caja va de x=72 a x=632 (560 de ancho), y=806..918.
  // El texto del monto arranca en x=104. Verificamos que no pase de x=632.
  const { data, info } = await sharp(buf)
    .extract({ left: 72, top: 806, width: 560, height: 112 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let maxX = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[y * info.width + x] > 170) maxX = Math.max(maxX, x);

  const dentro = maxX < 545; // 560 de ancho menos padding derecho
  console.log(
    `US$ ${m}`.padEnd(12),
    `último pixel x=${maxX}/560`,
    dentro ? "OK" : "SE DESBORDA",
  );
}
