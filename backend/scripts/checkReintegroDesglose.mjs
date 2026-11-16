// Verifica el desglose del reintegro: referido (parte del comprador) +
// cashback fijo de plataforma (2.5%). Debe coincidir con lo que paga el
// negocio: cashback = baseUsd * feePercent, con tope por orden.
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import { getReferralConfig } from "../src/services/referralService.js";
import { getCashbackConfig } from "../src/services/cashbackService.js";
import { getTdc } from "../src/services/tdcService.js";

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const u = await User.findOne({ referralStatus: "approved" });
const p = await Product.findOne({
  "referral.enabled": true,
  status: "active",
  "moderation.status": "approved",
  seller: { $ne: u._id },
});

const cfg = await getReferralConfig();
const cb = await getCashbackConfig();
const sharePercent = Number(cfg.referrerSharePercent) || 75;

const price =
  p.sale?.active && Number(p.sale?.price) > 0
    ? Number(p.sale.price)
    : Number(p.price) || 0;

let baseUsd = price;
if (String(p.currency || "ARS").toUpperCase() !== "USD") {
  const { tdc } = await getTdc();
  baseUsd = price / Number(tdc);
}

// Referido
let total = Math.round(baseUsd * (Number(p.referral.percent) / 100) * 100) / 100;
const cap = Number(cfg.maxRewardUsdPerOrder) || 0;
if (cap > 0 && total > cap) total = cap;
const referrer = Math.round(total * (sharePercent / 100) * 100) / 100;
const buyerPart = Math.round((total - referrer) * 100) / 100;

// Cashback de plataforma
let cashback = 0;
if (cb?.enabled) {
  cashback = Math.round(baseUsd * Number(cb.feePercent) * 100) / 100;
  if (Number(cb.maxPerOrderUsd) > 0 && cashback > Number(cb.maxPerOrderUsd))
    cashback = Number(cb.maxPerOrderUsd);
}

const totalBuyer = Math.round((buyerPart + cashback) * 100) / 100;

console.log("Producto      :", p.name?.slice(0, 46));
console.log("Precio        :", price, p.currency || "ARS");
console.log("En USD        :", baseUsd.toFixed(2));
console.log("");
console.log("--- Desglose del reintegro ---");
console.log("Referido total      :", total.toFixed(2), "USD");
console.log("  → referidor      :", referrer.toFixed(2), `(${sharePercent}%)`);
console.log("  → comprador      :", buyerPart.toFixed(2), `(${100 - sharePercent}%)`);
console.log(
  "Cashback plataforma :",
  cashback.toFixed(2),
  `(${(Number(cb.feePercent) * 100).toFixed(1)}% · enabled=${cb.enabled})`,
);
console.log("                     ----------------");
console.log("TOTAL comprador     :", totalBuyer.toFixed(2), "USD  ← lo que muestra el kit");

if (cashback === 0) {
  console.log("\n⚠️  Cashback en 0: revisar CashbackConfig.enabled");
}

await mongoose.disconnect();
