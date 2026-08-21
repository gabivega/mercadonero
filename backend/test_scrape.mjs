import { scrapeMercadoLibreProduct } from "./src/services/mercadoLibreScraper.js";

const url = "https://www.mercadolibre.com.ar/impresora-termica-comandera-pos-tickets--58mm-usb/up/MLAU3796744514";

try {
  const r = await scrapeMercadoLibreProduct(url);
  console.log("OK");
  console.log("title:", r.title);
  console.log("price:", r.price, r.currency);
  console.log("images:", r.images.length);
  console.log("attributes:", r.attributes.length);
  console.log("brand:", r.brand);
  console.log("category:", r.category);
  console.log("condition:", r.condition);
} catch (e) {
  console.log("ERR", e.status, e.message);
}
