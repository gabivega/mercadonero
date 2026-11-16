// Test END-TO-END del kit de referidos, SIN necesitar JWT.
//
// ¿Cómo? Importamos el controller real y lo invocamos con `req`/`res` falsos.
// Así se ejecutan TODAS las validaciones de negocio (aprobación, rate limit,
// producto referrable, cálculo del reward, ETag) y el render real.
//
// Uso:  node scripts/testReferralKitE2E.mjs
//
// Requiere: backend/.env con la conexión a Mongo (usa la DB real para leer
// productos, pero NO escribe nada).
import "dotenv/config";
import mongoose from "mongoose";
import sharp from "sharp";
import fs from "fs";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import { getReferralKit } from "../src/controllers/referralKitController.js";

// ── Mock de res: captura status/headers/body ──────────────────────────────
function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      this.headersSent = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

// ── Mock de req ───────────────────────────────────────────────────────────
const makeReq = (productId, userId, headers = {}) => ({
  params: { productId: String(productId) },
  user: { _id: userId },
  headers,
});

let fallos = 0;
const check = (nombre, ok, detalle = "") => {
  console.log(ok ? `  ✓ ${nombre}` : `  ✗ ${nombre} ${detalle}`);
  if (!ok) fallos++;
};

try {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  // 1) Buscamos un referidor aprobado que NO sea vendedor del producto.
  const referrer = await User.findOne({
    referralStatus: "approved",
  }).select("_id email referralStatus");

  if (!referrer) {
    console.log(
      "\n⚠️  No hay usuarios con referralStatus='approved' en esta DB.",
    );
    console.log(
      "   Aprobá uno desde el admin o corré:\n" +
        "   node -e \"import('./src/models/User.js').then(async m=>{const {default:mongoose}=await import('mongoose');await mongoose.connect(process.env.MONGODB_URI);await m.default.updateOne({email:'TU_EMAIL'},{$set:{referralStatus:'approved'}});console.log('ok');process.exit(0)})\"\n",
    );
    process.exit(1);
  }

  // 2) Buscamos un producto referrable (activo + aprobado + con referral).
  const product = await Product.findOne({
    "referral.enabled": true,
    "referral.percent": { $gt: 0 },
    "moderation.status": "approved",
    status: "active",
    seller: { $ne: referrer._id },
  }).select("_id name price currency sale referral seller slug");

  if (!product) {
    console.log("\n⚠️  No hay productos referrables visibles en esta DB.");
    console.log("   Necesitás uno con: referral.enabled=true, percent>0,");
    console.log("   moderation.status='approved', status='active'.\n");
    process.exit(1);
  }

  console.log(`\nReferidor: ${referrer.email}`);
  console.log(`Producto:  "${product.name}" (${product._id})`);
  console.log(`Referral:  ${JSON.stringify(product.referral)}\n`);

  // ── CASO 1: happy path ────────────────────────────────────────────────
  console.log("CASO 1 — afiliado aprobado pide un kit válido");
  {
    const res = makeRes();
    await getReferralKit(makeReq(product._id, referrer._id), res);

    check("status 200", res.statusCode === 200, `(fue ${res.statusCode}: ${JSON.stringify(res.body)})`);
    check("Content-Type image/jpeg", res.headers["Content-Type"] === "image/jpeg");
    check("tiene ETag", Boolean(res.headers["ETag"]));
    check("Cache privado", /private/.test(res.headers["Cache-Control"] || ""));
    check("expone URL corta", Boolean(res.headers["X-Kit-Short-Url"]));
    check("body es un buffer", Buffer.isBuffer(res.body));

    if (Buffer.isBuffer(res.body)) {
      const meta = await sharp(res.body).metadata();
      check("1080x1080", meta.width === 1080 && meta.height === 1080,
        `(${meta.width}x${meta.height})`);
      check("es JPEG", meta.format === "jpeg");
      check("peso razonable (<400KB)", res.body.length < 400 * 1024,
        `(${(res.body.length / 1024).toFixed(0)}KB)`);

      fs.mkdirSync("tmp-kit", { recursive: true });
      fs.writeFileSync("tmp-kit/e2e-real.jpg", res.body);
      console.log("    → guardado en tmp-kit/e2e-real.jpg");

      // ── CASO 2: ETag (304 sin render) ─────────────────────────────────
      console.log("\nCASO 2 — mismo request con If-None-Match debe dar 304");
      const res2 = makeRes();
      const t0 = Date.now();
      await getReferralKit(
        makeReq(product._id, referrer._id, {
          "if-none-match": res.headers["ETag"],
        }),
        res2,
      );
      const ms304 = Date.now() - t0;

      // Lo que importa NO es el tiempo absoluto (eso incluye las queries a
      // Mongo: user + producto + config + link), sino que el 304 evite el
      // render, que es la parte cara (sharp + descarga de foto + QR).
      // Por eso comparamos 304 contra un 200 medido en el mismo proceso.
      const resRef = makeRes();
      const tStart = Date.now();
      await getReferralKit(makeReq(product._id, referrer._id), resRef);
      const ms200 = Date.now() - tStart;

      check("status 304", res2.statusCode === 304, `(fue ${res2.statusCode})`);
      check("el 304 es más rápido que el render", ms304 < ms200,
        `(304: ${ms304}ms vs 200: ${ms200}ms)`);
      console.log(
        `    → 304: ${ms304}ms | 200 con render: ${ms200}ms ` +
          `(ahorro ${Math.round((1 - ms304 / ms200) * 100)}%)`,
      );
    }
  }

  // ── CASO 3: producto propio ───────────────────────────────────────────
  console.log("\nCASO 3 — pedir kit de un producto propio");
  {
    const propio = await Product.findOne({
      seller: referrer._id,
      "referral.enabled": true,
    }).select("_id");

    if (!propio) {
      console.log("  - (omitido: el referidor no tiene productos propios)");
    } else {
      const res = makeRes();
      await getReferralKit(makeReq(propio._id, referrer._id), res);
      check("status 400", res.statusCode === 400);
      check("blocked='own_product'", res.body?.blocked === "own_product",
        `(fue ${res.body?.blocked})`);
    }
  }

  // ── CASO 4: producto inexistente ──────────────────────────────────────
  console.log("\nCASO 4 — producto inexistente");
  {
    const res = makeRes();
    await getReferralKit(makeReq("000000000000000000000000", referrer._id), res);
    check("status 404", res.statusCode === 404, `(fue ${res.statusCode})`);
  }

  // ── CASO 5: producto sin referidos ────────────────────────────────────
  console.log("\nCASO 5 — producto SIN programa de referidos");
  {
    const sinRef = await Product.findOne({
      $or: [
        { "referral.enabled": false },
        { "referral.enabled": { $exists: false } },
        { "referral.percent": { $lte: 0 } },
      ],
      "moderation.status": "approved",
      status: "active",
      seller: { $ne: referrer._id },
    }).select("_id name");

    if (!sinRef) {
      console.log("  - (omitido: no hay productos sin referidos en la DB)");
    } else {
      const res = makeRes();
      await getReferralKit(makeReq(sinRef._id, referrer._id), res);
      check("status 400", res.statusCode === 400);
      check("blocked='product_not_referrable'",
        res.body?.blocked === "product_not_referrable",
        `(fue ${res.body?.blocked})`);
    }
  }

  // ── CASO 6: rate limit ────────────────────────────────────────────────
  console.log("\nCASO 6 — rate limit (7 requests seguidos → el 7º da 429)");
  {
    // Usamos un user id distinto para no ensuciar el contador del caso 1.
    const otro = await User.findOne({ _id: { $ne: referrer._id } }).select("_id");
    if (!otro) {
      console.log("  - (omitido: no hay otro usuario)");
    } else {
      // Aprobamos temporalmente en memoria no se puede; usamos el mismo
      // referidor pero el contador ya tiene 1 hit del caso 1.
      let lastStatus = null;
      for (let i = 0; i < 7; i++) {
        const res = makeRes();
        await getReferralKit(makeReq(product._id, referrer._id), res);
        lastStatus = res.statusCode;
        if (res.statusCode === 429) {
          check("429 en el request excedente", true);
          check("Retry-After presente", Boolean(res.headers["Retry-After"]));
          break;
        }
      }
      if (lastStatus !== 429) {
        check("429 tras exceder el límite", false, `(último: ${lastStatus})`);
      }
    }
  }

  console.log(
    fallos === 0
      ? "\n=== TODO OK ===\n"
      : `\n=== ${fallos} FALLO(S) ===\n`,
  );
} catch (e) {
  console.error("\nERROR FATAL:", e.message);
  console.error(e.stack?.split("\n").slice(0, 6).join("\n"));
  fallos++;
} finally {
  await mongoose.disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}
