import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
await mongoose.connect(uri);

const { updateOrder } = await import("./src/controllers/orderController.js");

const SELF_ID = "6a0367c822962544f6c0dba1";
const req = {
  params: { orderId: "6abe9e306439de2dab2dab35" },
  body: { pickupReady: true },
  user: { _id: { toString: () => SELF_ID }, role: "seller" },
};

const res = {
  statusCode: 200,
  status(c) { this.statusCode = c; return this; },
  json(payload) {
    console.log("\n===== RESPUESTA HTTP =====");
    console.log("status:", this.statusCode);
    console.log("payload:", JSON.stringify(payload, null, 2));
    return this;
  },
};

console.log(">>> Llamando updateOrder directamente...");
const t = setTimeout(() => {
  console.log("\n⏰ TIMEOUT: el handler NO respondió en 20s — está COLGADO.");
  process.exit(2);
}, 20000);

try {
  await updateOrder(req, res);
  clearTimeout(t);
  console.log(">>> updateOrder RETORNÓ sin colgarse.");
} catch (e) {
  clearTimeout(t);
  console.log(">>> updateOrder LANZÓ excepción:", e?.message);
  console.log(e?.stack);
}

await mongoose.disconnect();
process.exit(0);
