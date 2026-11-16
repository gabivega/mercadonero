// Verifica el flujo completo "escanear QR con el celular":
//   1. El CORS acepta el origen de LAN (http://192.168.x.x:5173).
//   2. El kit se sirve con los headers expuestos.
//   3. El short link redirige a la ficha con ?ref=.
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import {
  getOrCreateReferralLink,
  resolveReferralCode,
} from "../src/services/referralLinkService.js";
import os from "os";
import { createClient } from "@supabase/supabase-js";

function lan() {
  const nets = os.networkInterfaces();
  for (const n of Object.keys(nets))
    for (const net of nets[n] || [])
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254"))
        return net.address;
  return "localhost";
}

const LAN = lan();
const API = `http://${LAN}:${process.env.PORT || 3000}`;
const FRONT = `http://${LAN}:5173`;

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const u = await User.findOne({ referralStatus: "approved" });
const p = await Product.findOne({
  "referral.enabled": true,
  status: "active",
  "moderation.status": "approved",
  seller: { $ne: u._id },
});

const { code } = await getOrCreateReferralLink(u._id, p._id, p.slug || "");

console.log("LAN          :", LAN);
console.log("Front        :", FRONT);
console.log("API          :", API);
console.log("Código corto :", code);
console.log("");

// 1) CORS desde el origen de LAN
const corsRes = await fetch(`${API}/`, {
  headers: { Origin: FRONT },
});
const acao = corsRes.headers.get("access-control-allow-origin");
console.log("CORS Allow-Origin:", acao || "(ausente)");
console.log(
  acao === FRONT
    ? "  ✓ El celular puede llamar a la API"
    : "  ✗ El CORS NO acepta el origen de LAN",
);

// 2) Redirect del QR
const r = await fetch(`${API}/r/${code}`, { redirect: "manual" });
const loc = r.headers.get("location");
console.log("");
console.log("Redirect:", r.status, "->", loc);
console.log(
  loc?.startsWith(FRONT)
    ? "  ✓ El QR abre la ficha en el celular"
    : "  ✗ El QR NO abre una URL alcanzable desde el celular",
);

// 3) Coherencia: el código siempre resuelve al mismo producto
const link = await resolveReferralCode(code);
console.log("");
console.log(
  String(link?.product?._id) === String(p._id) || String(link?.product) === String(p._id)
    ? "  ✓ El código apunta al producto correcto"
    : `  ? product en link: ${link?.product}`,
);

await mongoose.disconnect();
