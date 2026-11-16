// Smoke test del generador de kits (versión "comprador").
// Valida dimensiones, peso y webfont. Escribe los JPG en tmp-kit/.
//
// Uso:  node scripts/testReferralKit.mjs
import sharp from "sharp";
import fs from "fs";
import { renderReferralKit } from "../src/services/referralKitService.js";

const photo = await sharp({
  create: { width: 600, height: 600, channels: 3, background: "#7c3aed" },
})
  .jpeg()
  .toBuffer();

const base = {
  price: 1899000,
  currency: "ARS",
  listingType: "product",
  sellerName: "Nero Store",
  category: "electronica",
  referral: { enabled: true, percent: 10 },
  images: [
    { url: `data:image/jpeg;base64,${photo.toString("base64")}`, isMain: true },
  ],
};

const casos = [
  {
    file: "kit-con-oferta.jpg",
    product: {
      ...base,
      name: "iPhone 15 Pro Max",
      sale: { active: true, price: 1599000 },
    },
    // Reintegro del COMPRADOR (25% de un 10% sobre ~1.3k USD).
    buyerRewardUsd: 4.25,
  },
  {
    file: "kit-sin-oferta.jpg",
    product: { ...base, name: "Auriculares Bluetooth" },
    buyerRewardUsd: 5.1,
  },
  {
    file: "kit-nombre-largo.jpg",
    product: {
      ...base,
      name: "Notebook Gamer Republic of Gamers Strix Scar 18 RTX 4090 32GB",
    },
    buyerRewardUsd: 12.75,
  },
  {
    file: "kit-sin-reintegro.jpg",
    product: { ...base, name: "Teclado Mecánico RGB" },
    // Sin cotización -> el template OMITE la caja de reintegro.
    buyerRewardUsd: 0,
  },
];

fs.mkdirSync("tmp-kit", { recursive: true });

let fallos = 0;
for (const { file, product, buyerRewardUsd } of casos) {
  const t0 = Date.now();
  const buf = await renderReferralKit({
    product,
    shortUrl: "https://mercadonero.com/r/abc123",
    buyerRewardUsd,
  });
  const meta = await sharp(buf).metadata();

  if (meta.width !== 1080 || meta.height !== 1080) {
    console.error(`${file}: dimensiones ${meta.width}x${meta.height}`);
    fallos++;
  }
  if (meta.format !== "jpeg") {
    console.error(`${file}: formato ${meta.format}`);
    fallos++;
  }

  fs.writeFileSync(`tmp-kit/${file}`, buf);
  console.log(
    "OK",
    file.padEnd(26),
    `${(buf.length / 1024).toFixed(0)} KB`,
    `${Date.now() - t0}ms`,
  );
}

// ── Verificación de la webfont ───────────────────────────────────────────
// El ancho de tinta del título con Poppins es notablemente menor que con
// Arial (478px vs 587px medido). Si se cae a la fuente del sistema, avisamos.
const buf = fs.readFileSync("tmp-kit/kit-sin-oferta.jpg");
const { data, info } = await sharp(buf)
  .extract({ left: 520, top: 300, width: 480, height: 190 })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

let first = -1;
let last = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[y * info.width + x] > 150) {
      if (first === -1 || x < first) first = x;
      last = Math.max(last, x);
    }
  }
}
const ink = last - first;
console.log(`\ntítulo inkWidth=${ink}px (Poppins si es < 500)`);
if (ink >= 500) {
  console.warn("⚠️  Posible caída a fuente del sistema (Arial/DejaVu).");
  fallos++;
}

console.log(fallos === 0 ? "\n=== TODO OK ===\n" : `\n=== ${fallos} FALLO(S) ===\n`);
process.exit(fallos === 0 ? 0 : 1);
