// controllers/referralKitController.js
//
// Endpoint que GENERA y SIRVE el kit promocional de un producto para el
// afiliado logueado (referidor).
//
// GET /api/referral/kit/:productId
//
// Reglas (todas verificadas ANTES de renderizar, para no gastar CPU al pedo):
//   1. El usuario debe estar logueado (verifyAuth + attachUser en la ruta).
//   2. Debe ser REFERIDOR APROBADO (`referralStatus === "approved"`). El
//      programa es por invitación: si todavía está en lista de espera, no
//      tiene sentido que se lleve la imagen (no le van a acreditar nada).
//   3. El producto debe existir y tener referidos ACTIVOS (`referral.enabled`
//      + `percent > 0`). Si no, no hay nada que promocionar.
//   4. El producto NO puede ser del propio afiliado: es raro que un vendedor
//      sea el que comparte (puede, pero le conviene otra cosa) y además evita
//      confusión de roles.
//   5. Rate limit: 6 kits por minuto por usuario. Cada kit es CPU-bound; sin
//      límite, una cuenta puede tumbar el VPS con un loop de requests.
//
// Optimizaciones:
//   - ETag derivado de (productId + updatedAt + sharePercent + precio). Si el
//     cliente manda If-None-Match y no cambió nada, respondemos 304 SIN
//     renderizar: costo 0.
//   - Cache-Control privado (nunca compartido): el kit lleva la atribución del
//     afiliado en el QR, no debe quedar en un CDN público.
import Product from "../models/Product.js";
import User from "../models/User.js";
import os from "os";
import { getReferralConfig } from "../services/referralService.js";
import { getOrCreateReferralLink } from "../services/referralLinkService.js";
import { renderReferralKit } from "../services/referralKitService.js";
import { getCashbackConfig } from "../services/cashbackService.js";
import { getTdc } from "../services/tdcService.js";

// ── RATE LIMIT (in-memory, por usuario) ───────────────────────────────────
// Ventana deslizante simple. En un deploy multi-instancia esto no escala
// (cada nodo cuenta distinto), pero para esta etapa con un solo VPS es
// suficiente y no suma dependencias ni Redis. Si en el futuro escala, se
// migra a un contador compartido usando el mismo patrón que `gasDrip`.
const KIT_LIMIT = 6; // kits por ventana
const KIT_WINDOW_MS = 60 * 1000; // 1 minuto
const kitHits = new Map(); // userId -> number[] (timestamps)

function checkRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const hits = (kitHits.get(key) || []).filter((t) => now - t < KIT_WINDOW_MS);

  if (hits.length >= KIT_LIMIT) {
    const retryAfter = Math.ceil((KIT_WINDOW_MS - (now - hits[0])) / 1000);
    kitHits.set(key, hits);
    return { allowed: false, retryAfter };
  }

  hits.push(now);
  kitHits.set(key, hits);

  // Housekeeping oportunista: si el mapa crece mucho (muchos usuarios únicos
  // en el proceso), purgamos las entradas viejas para no filtrar memoria.
  if (kitHits.size > 5000) {
    for (const [k, arr] of kitHits) {
      const alive = arr.filter((t) => now - t < KIT_WINDOW_MS);
      if (alive.length === 0) kitHits.delete(k);
      else kitHits.set(k, alive);
    }
  }

  return { allowed: true };
}

// ── BASE URL PARA EL QR ───────────────────────────────────────────────────
// El QR de la imagen se escanea con un celular. "localhost" NO sirve: el
// teléfono lo resuelve a sí mismo. En dev detectamos la IP del equipo en la
// LAN (192.168.x.x) para que el QR funcione desde otro dispositivo de la
// misma red. En prod va directo al dominio de la API.
let cachedLanIp;

function getLanIp() {
  if (cachedLanIp !== undefined) return cachedLanIp;
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family !== "IPv4" || net.internal) continue;
        // Descartamos APIPA (169.254.x) que es un "no hay red real".
        if (net.address.startsWith("169.254")) continue;
        cachedLanIp = net.address;
        return cachedLanIp;
      }
    }
  } catch (e) {
    console.warn("[ReferralKit] No pude detectar la IP de LAN:", e.message);
  }
  cachedLanIp = null;
  return null;
}

/**
 * Resuelve la base (sin barra final) sobre la que se arma `/r/<code>`.
 * Prioridad: PUBLIC_SHORT_URL > PUBLIC_API_URL > prod > LAN > localhost.
 */
function resolveQrBase() {
  if (process.env.PUBLIC_SHORT_URL) {
    return process.env.PUBLIC_SHORT_URL.replace(/\/$/, "");
  }
  if (process.env.PUBLIC_API_URL) {
    return process.env.PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://api.mercadonero.com";
  }

  const port = process.env.PORT || 3000;
  const lan = getLanIp();
  // En dev preferimos la IP de LAN: así el QR funciona al escanearlo desde
  // el celular. Si no hay LAN, localhost (funciona al menos en la máquina).
  return `http://${lan || "localhost"}:${port}`;
}

/**
 * GET /api/referral/kit/:productId
 * Devuelve el JPG del kit promocional (Content-Type: image/jpeg) o un JSON
 * de error `{ success:false, message, blocked? }`.
 */
export const getReferralKit = async (req, res) => {
  try {
    const { productId } = req.params;

    // 1) Gate de referidor aprobado. No usamos `attachUser` solo: necesitamos
    // el `referralStatus` vigente, así que releemos el campo puntual.
    const user = await User.findById(req.user?._id).select(
      "referralStatus referral.balance role",
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }
    if (user.referralStatus !== "approved") {
      return res.status(403).json({
        success: false,
        blocked: "not_approved",
        message:
          "Necesitás ser referidor aprobado para generar kits promocionales.",
      });
    }

    // 2) Rate limit ANTES de tocar la DB del producto y de descargar la foto.
    const rl = checkRateLimit(user._id);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({
        success: false,
        blocked: "rate_limited",
        message: `Generaste muchos kits seguidos. Probá de nuevo en ${rl.retryAfter}s.`,
      });
    }

    // 3) Producto: SIEMPRE desde Mongo (nunca de la query del cliente).
    const product = await Product.findById(productId).select(
      "name slug price currency sale images category listingType referral seller sellerName moderation status updatedAt",
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Producto no encontrado." });
    }

    // 4) Debe ofrecer referidos y estar visible (aprobado + activo).
    if (!product.referral?.enabled || Number(product.referral?.percent) <= 0) {
      return res.status(400).json({
        success: false,
        blocked: "product_not_referrable",
        message: "Este producto no tiene el programa de referidos activo.",
      });
    }
    if (
      product.moderation?.status !== "approved" ||
      product.status !== "active"
    ) {
      return res.status(400).json({
        success: false,
        blocked: "product_not_referrable",
        message: "Este producto no está disponible para promocionar.",
      });
    }

    // 5) No armar kits de productos propios.
    if (String(product.seller) === String(user._id)) {
      return res.status(400).json({
        success: false,
        blocked: "own_product",
        message: "No podés generar un kit de tu propio producto.",
      });
    }

    // 6) Config vigente para calcular el reparto (75/25 por defecto).
    const config = await getReferralConfig();
    const sharePercent = Number.isFinite(Number(config.referrerSharePercent))
      ? Number(config.referrerSharePercent)
      : 75;

    // 7) Enlace corto: mismo que usa "Compartir" en el front (fuente única).
    const { code, clicks } = await getOrCreateReferralLink(
      user._id,
      product._id,
      product.slug || "",
    );

    // ── URL DEL QR ─────────────────────────────────────────────────────
    // El QR tiene que ser ESCANEABLE DESDE UN CELULAR y llevar a la ficha
    // del producto. Un `localhost:3000` en la imagen es inútil (el teléfono
    // no puede resolverlo). Orden de preferencia:
    //
    //   1. PUBLIC_SHORT_URL  → base explícita para los enlaces cortos
    //   2. PUBLIC_API_URL    → base de la API
    //   3. prod              → https://api.mercadonero.com
    //   4. dev               → IP de LAN (para probar con el celu en la red)
    //
    // En dev NO usamos "localhost" a secas: si estás probando desde el
    // teléfono, localhost apunta al propio teléfono y no funciona.
    const apiBase = resolveQrBase();
    const shortUrl = `${apiBase}/r/${code}`;

    // 8) REINTEGRO DEL COMPRADOR — el número que se muestra en el kit.
    //
    // ⚠️ OJO: el kit lo ve el COMPRADOR, no el afiliado. Antes mostrábamos
    // "Ganás US$ X por venta" (la parte del REFERIDOR), que es información
    // interna que el comprador no debe ver. Ahora mostramos lo que gana ÉL:
    //
    //   baseUsd       = precio efectivo (oferta aplicada) / TDC   (ARS→USDT)
    //   totalUsd      = baseUsd * (percent del producto / 100)    [tope global]
    //   referrerUsd   = totalUsd * (referrerSharePercent / 100)
    //   buyerUsd      = totalUsd - referrerUsd    ← ESTE es el del kit
    //
    // Mismo cálculo que `calculateReferralSplit` del backend, para que el
    // número del kit coincida EXACTO con lo que se acredita al completar.
    // Si la cotización falla, rewardUsd = 0 y el template omite la caja:
    // preferimos no mostrar nada antes que inventar un número que no cuadre.
    const priceForCalc =
      product.sale?.active && Number(product.sale?.price) > 0
        ? Number(product.sale.price)
        : Number(product.price) || 0;

    let baseUsd = 0;
    if (priceForCalc > 0) {
      if (String(product.currency || "ARS").toUpperCase() === "USD") {
        baseUsd = priceForCalc;
      } else {
        try {
          const { tdc } = await getTdc();
          const rate = Number(tdc) || 0;
          if (rate > 0) baseUsd = priceForCalc / rate;
        } catch (e) {
          console.warn(
            "[ReferralKit] Sin cotización, omito la recompensa del kit:",
            e.message,
          );
        }
      }
    }

    // Reparto: tope global por orden + share del referidor (mismos topes que
    // `accrueReferralForOrder`). Redondeo a 2 decimales como el backend.
    let totalRewardUsd =
      Math.round(baseUsd * (Number(product.referral.percent) / 100) * 100) / 100;
    const maxPerOrder = Number(config.maxRewardUsdPerOrder) || 0;
    if (maxPerOrder > 0 && totalRewardUsd > maxPerOrder) {
      totalRewardUsd = maxPerOrder;
    }

    // Parte del REFERIDOR (redondeada) y del COMPRADOR (derivada como
    // diferencia, para que la suma cuadre al centavo — igual que el backend).
    const referrerUsd =
      Math.round(totalRewardUsd * (sharePercent / 100) * 100) / 100;
    const referralBuyerUsd =
      Math.round((totalRewardUsd - referrerUsd) * 100) / 100;

    // ── REINTEGRO FIJO DE LA PLATAFORMA (cashback) ────────────────────────
    // Además del reintegro de referidos, TODO comprador recibe un reintegro
    // fijo por comprar con cripto/transferencia (el cashback de la plataforma,
    // 2.5% por defecto). Lo sumamos al del referido para que el número del
    // kit refleje el beneficio TOTAL real y sea más atractivo.
    //
    // Fuente: `resolveCashbackParams` (misma función que acredita el cashback
    // al completar la orden), así el kit nunca promete más de lo que se paga.
    // Si el cashback está deshabilitado o la cotización falló, suma 0.
    let cashbackUsd = 0;
    try {
      const cfg = await getCashbackConfig();
      if (cfg?.enabled) {
        // El cashback se calcula sobre el precio en USD (ARS convertido).
        cashbackUsd = Math.round(baseUsd * (Number(cfg.feePercent) || 0) * 100) / 100;
        const cap = Number(cfg.maxPerOrderUsd) || 0;
        if (cap > 0 && cashbackUsd > cap) cashbackUsd = cap;
      }
    } catch (e) {
      // Si falla, mostramos solo el de referidos: nunca rompemos el kit.
      console.warn(
        "[ReferralKit] No pude resolver el cashback de plataforma:",
        e.message,
      );
    }

    // Total que ve el comprador: referido (su parte) + fijo de plataforma.
    const buyerRewardUsd =
      Math.round((referralBuyerUsd + cashbackUsd) * 100) / 100;

    // 9) ETag: si nada relevante cambió, 304 sin render (ahorra CPU).
    // Incluimos sharePercent para regenerar si el admin cambia el reparto.
    const etag = `"kit-v3-${product._id}-${new Date(
      product.updatedAt || Date.now(),
    ).getTime()}-${product.referral.percent}-${sharePercent}-${priceForCalc}-${buyerRewardUsd}"`;
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    // 10) Render.
    const jpeg = await renderReferralKit({
      product,
      shortUrl,
      buyerRewardUsd,
    });

    // 11) Cabeceras de cache PRIVADAS (por usuario). 5 min alcanza para que
    // el afiliado navegue sin regenerar, sin quedar cacheado eternamente
    // cuando cambia un precio.
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", String(jpeg.length));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("ETag", etag);
    // Nombre de archivo amigable para el "Descargar" del navegador.
    res.setHeader(
      "Content-Disposition",
      `inline; filename="mercadonero-${product.slug || product._id}.jpg"`,
    );
    // Exponemos metadatos útiles para la UI sin un round-trip extra.
    res.setHeader("X-Kit-Clicks", String(clicks));
    res.setHeader("X-Kit-Short-Url", encodeURIComponent(shortUrl));

    return res.status(200).send(jpeg);
  } catch (error) {
    console.error("Error en getReferralKit:", error);
    // Si ya empezamos a escribir la respuesta, no podemos cambiarla: cortamos.
    if (res.headersSent) return res.end();
    return res
      .status(500)
      .json({ success: false, message: error.message });
  }
};
