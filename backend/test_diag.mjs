import { gotScraping } from "got-scraping";
import * as cheerio from "cheerio";

const url = "https://www.mercadolibre.com.ar/impresora-termica-comandera-pos-tickets--58mm-usb/up/MLAU3796744514";

const response = await gotScraping({
  url,
  responseType: "text",
  headerGeneratorOptions: {
    browsers: [{ name: "chrome", minVersion: 120 }],
    devices: ["desktop"],
    locales: ["es-AR", "es"],
  },
});

console.log("STATUS", response.statusCode, "LENGTH", response.body.length);
console.log("FINAL URL:", response.url);

const $ = cheerio.load(response.body);

console.log("title tag:", $("title").text().trim());
console.log("og:title:", $('meta[property="og:title"]').attr("content"));
console.log("has .ui-pdp-title:", $(".ui-pdp-title").length);
console.log("has __PRELOADED_STATE__:", response.body.includes("__PRELOADED_STATE__"));
console.log("has suspicious_traffic:", response.body.includes("suspicious_traffic") || response.body.includes("account-verification"));
console.log("has gz/account:", response.body.includes("/gz/account"));
console.log("has .ui-pdp-price:", $(".ui-pdp-price").length);
console.log("og:description:", $('meta[property="og:description"]').attr("content"));

// Mostrar primeros 400 chars del body para ver qué es
console.log("BODY START:", response.body.slice(0, 300));
