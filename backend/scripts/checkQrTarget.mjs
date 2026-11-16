// Verifica a dónde apunta el QR del kit: el enlace corto debe redirigir a la
// ficha del producto con ?ref=<referidor>. Y avisa si la base es alcanzable
// desde un celular (LAN) o no (localhost).
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import { getOrCreateReferralLink } from "../src/services/referralLinkService.js";
import os from "os";

const uri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL;
await mongoose.connect(uri);

const u = await User.findOne({ referralStatus: "approved" });
if (!u) {
  console.error("No hay usuario aprobado para probar.");
  process.exit(1);
}

// Producto referrable que NO sea del propio referidor.
const p = await Product.findOne({
  "referral.enabled": true,
  status: "active",
  "moderation.status": "approved",
  seller: { $ne: u._id },
});

if (!p) {
  console.error("No hay producto referrable para probar.");
  process.exit(1);
}

const { code } = await getOrCreateReferralLink(u._id, p._id, p.slug || "");

// Misma lógica que resolveQrBase() del controller.
function lanIp() {
  const nets = os.networkInterfaces();
  for (const n of Object.keys(nets)) {
    for (const net of nets[n] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254")) {
        return net.address;
      }
    }
  }
  return null;
}

const base =
  process.env.PUBLIC_SHORT_URL ||
  process.env.PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.mercadonero.com"
    : `http://${lanIp() || "localhost"}:${process.env.PORT || 3000}`);

console.log("Referidor :", u.email);
console.log("Producto  :", p.name?.slice(0, 50), `(${p._id})`);
console.log("Slug      :", p.slug);
console.log("");
console.log("Base del QR :", base);
console.log("URL del QR  :", `${base.replace(/\/$/, "")}/r/${code}`);
console.log("Redirige a  : /producto/" + p.slug + "?ref=" + u._id);
console.log("");

const b = base.replace(/\/$/, "");
if (b.includes("localhost") || b.includes("127.0.0.1")) {
  console.log("⚠️  El QR apunta a localhost: NO se puede escanear desde el celular.");
} else if (b.startsWith("http://192.168.") || b.startsWith("http://10.")) {
  console.log("✓ LAN: escaneable desde un celular en la misma red Wi-Fi.");
} else {
  console.log("✓ Pública: escaneable desde cualquier dispositivo.");
}

await mongoose.disconnect();
