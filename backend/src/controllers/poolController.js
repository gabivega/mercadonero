import Pool from "../models/Pool.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { createNotification } from "../services/notificationService.js";
import { sendPoolActivityToVendor } from "../services/sendEmail.js";
import { getTdc } from "../services/tdcService.js";
import Order from "../models/Order.js";
import { getEscrowChainConfig, ESCROW_DEFAULT_CHAIN_ID } from "../config/chains.js";
// Escrow individual (NeroEscrow) reutilizado para cada orden del grupo.
import {
  cancelOrderEscrow,
  settleOrderEscrow,
  releaseOrderEscrow,
  getFeeBps,
} from "../services/escrowServices.js";
import {
  createPendingOrderForPoolMember,
  finalizePoolOrdersFinalPrice,
} from "./groupBuyOrderController.js";

/**
 * Avisa al vendedor (in-app + email) que hubo actividad en un grupo de compra.
 * NUNCA debe romper el flujo principal: todo va con catch silencioso.
 *
 * @param {object} opts
 * @param {object} opts.pool      Pool ya guardado (con product poblado o no)
 * @param {"created"|"joined"} opts.action
 * @param {object} opts.actorUser Usuario comprador (con firstName/lastName/username)
 */
const notifyVendorPoolActivity = async ({ pool, action, actorUser }) => {
  try {
    const productName =
      pool.product?.name || pool.productName || "tu producto";
    const buyerName =
      [actorUser?.firstName, actorUser?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      actorUser?.username ||
      "Un comprador";

    const isCreated = action === "created";
    const verb = isCreated ? "creó" : "se sumó a";
    const buyerId = actorUser?._id || actorUser;

    // ── Notificación in-app al vendedor ──
    createNotification({
      recipient: pool.seller,
      type: isCreated ? "pool_created" : "pool_joined",
      title: isCreated
        ? "Nuevo grupo de compra"
        : "Nuevo integrante en un grupo",
      message: isCreated
        ? `${buyerName} ${verb} un grupo para "${productName}".`
        : `${buyerName} ${verb} un grupo de "${productName}".`,
      data: {
        poolId: pool._id,
        productId: pool.product?._id || pool.product,
        buyerId,
        membersCount: pool.members?.length || 0,
      },
    }).catch((err) => console.error("Falló notificación de grupo:", err));

    // ── Email al vendedor (best-effort) ──
    const vendor = await User.findById(pool.seller).select(
      "email firstName shop",
    );
    if (vendor?.email) {
      sendPoolActivityToVendor({
        vendorEmail: vendor.email,
        action,
        productName,
        buyerName,
        membersCount: pool.members?.length || 0,
        targetBuyers: pool.targetBuyers,
        currentUnitPrice: pool.currentUnitPrice,
      }).catch((err) => console.error("Falló email de grupo:", err));
    }
  } catch (error) {
    console.error("[notifyVendorPoolActivity] Error:", error);
  }
};

const ACTION_WINDOW_MS = 1000 * 60 * 60 * 24; // (no usado aún; reservado)

// ── CONFIG DE ESCROW DEL GRUPO ────────────────────────────────────────
// Token de escrow del grupo (USDT). En testnet usamos el USDT de prueba.
// El contrato de escrow vive en el NeroEscrow común (no hay contratos de grupo).
// Red/token/contrato se resuelven con getEscrowChainConfig(chainId).
const ALLOWED_PAYMENT_TOKENS = [
  "USDT",
  "USDC",
  "USDXM",
  "DAI",
  "BNB",
  "POL",
  "ETH",
];
const resolvePaymentToken = (token, escrowChain) => {
  const norm = (v) =>
    ALLOWED_PAYMENT_TOKENS.includes(String(v || "").toUpperCase())
      ? String(v).toUpperCase()
      : null;
  return (
    norm(token) ||
    norm(escrowChain?.tokenSymbol) ||
    norm(escrowChain?.nativeSymbol) ||
    "USDT"
  );
};
const requireGroupContract = () => true; // no-op (compat)

/**
 * Devuelve el precio unitario (ARS) para un pool según la cantidad de
 * PERSONAS (compradores). Usa los tiers del producto; si no hay tier exacto
 * para esa cantidad, cae al precio base.
 */
const priceForBuyers = (tiers, buyersCount, basePrice) => {
  if (tiers && tiers[buyersCount] != null) return Number(tiers[buyersCount]);
  // Si no hay tier exacto, probamos el mayor tier definido <= buyersCount.
  if (tiers) {
    const keys = Object.keys(tiers)
      .map((k) => Number(k))
      .filter((k) => Number.isFinite(k) && k <= buyersCount)
      .sort((a, b) => b - a);
    if (keys.length > 0) return Number(tiers[keys[0]]);
  }
  return Number(basePrice) || 0;
};

/**
 * Calcula el monto (en USDT) que un comprador debe congelar on-chain:
 *   amount = units * priceUnitArs / tdc
 * Redondeado a 6 decimales (más que suficiente para el USDT de 18 dec).
 */
const computeLockedAmountUsd = (units, priceUnitArs, tdc) => {
  const amount = (Number(units) * Number(priceUnitArs)) / Number(tdc);
  return Number(amount.toFixed(6));
};

/**
 * Precio unitario final (ARS) del pool cuando se llena del todo:
 * usa el tier de `targetBuyers` (ej: 5) o el precio base.
 */
const finalTargetPriceArs = (tiers, targetBuyers, basePrice) =>
  priceForBuyers(tiers, targetBuyers, basePrice);

/**
 * Serializa un Pool a la forma que espera el frontend:
 *   - members: [{ _id, username, avatar, joinedAt }]  (id de usuario como _id)
 *   - idem campos base.
 * Así el front no necesita populate ni cambiar su contrato.
 */
const serializePool = (pool) => {
  const obj = pool.toObject ? pool.toObject() : { ...pool };
  return {
    ...obj,
    members: (obj.members || []).map((m) => ({
      _id: (m.user?._id || m.user || "").toString(),
      username: m.username || "",
      avatar: m.avatar || "",
      joinedAt: m.joinedAt,
      escrowStatus: m.escrowStatus,
      units: m.units || 1,
      wallet: m.wallet || "",
      locked: m.locked || "0",
      finalUnitPriceUsd: m.finalUnitPriceUsd || 0,
      txHash: m.txHash || "",
      fundedAt: m.fundedAt || null,
    })),
  };
};

/**
 * Promueve un pool "open" cuya fecha ya pasó a "expired".
 * (Expiración LAZY: sin cron. Se resuelve al momento de leer.)
 * Devuelve true si hubo que persistir el cambio.
 */
const applyLazyExpiry = async (pool) => {
  if (pool.status === "open" && pool.expiresAt && pool.expiresAt < new Date()) {
    pool.status = "expired";
    await pool.save();
    return true;
  }
  return false;
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/pool/create   (protegida)
// Crea un pool para un producto. El creador queda como primer miembro.
// body: { productId }
// ──────────────────────────────────────────────────────────────────────

export const createPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, units: rawUnits, chainId } = req.body;
    const units = Math.max(1, Math.floor(Number(rawUnits) || 1));

    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Falta el id del producto." });
    }

    const product = await Product.findById(productId);
    if (!product || product.status !== "active") {
      return res
        .status(404)
        .json({ success: false, message: "Producto no disponible." });
    }

    const ss = product.socialSelling;
    if (!ss?.enabled) {
      return res.status(400).json({
        success: false,
        message: "Este producto no tiene Compra en Grupo habilitada.",
      });
    }

    if (product.seller.toString() === userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Sos el vendedor de este producto; no podés crear un grupo.",
      });
    }

    const existing = await Pool.findOne({
      product: productId,
      status: "open",
      "members.user": userId,
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Ya estás participando en un grupo de este producto.",
        pool: serializePool(existing),
      });
    }

    const user = await User.findById(userId).select(
      "username firstName lastName avatar walletAddress",
    );

    // Wallet Web3 obligatoria (se firma el escrow del member en la orden).
    if (!user?.walletAddress) {
      return res.status(400).json({
        success: false,
        message:
          "Necesitás una billetera Web3 vinculada para crear un grupo de compra. Generá o vinculá tu billetera e intentá de nuevo.",
        needsWallet: true,
      });
    }

    const duration = ss.durationHours || 24;
    const tiers = ss.tiers || {};
    const targetBuyers = 5;
    const basePrice = product.sale?.active ? product.sale.price : product.price;

    // TDC snapshot (solo para el precio informativo del pool; la orden lo
    // recalcula on-chain igual que el flujo individual).
    let tdcSnapshot = 0;
    try {
      const tdcRes = await getTdc();
      if (tdcRes.success) tdcSnapshot = tdcRes.tdc;
    } catch (e) {
      // No bloqueante: el precio final se calcula al fondear desde la orden.
      console.error("createPool: no se pudo obtener TDC:", e?.message);
    }

    const escrowChain = getEscrowChainConfig(chainId ?? ESCROW_DEFAULT_CHAIN_ID);

    const member = {
      user: userId,
      username: user?.username || user?.firstName || "vos",
      avatar: user?.avatar || "",
      joinedAt: new Date(),
      units,
      wallet: user?.walletAddress || "",
      escrowStatus: "pending",
      shippingAddress: req.body.shippingAddress || {},
    };

    const pool = new Pool({
      product: product._id,
      seller: product.seller,
      creator: userId,
      members: [member],
      targetBuyers,
      expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
      status: "open",
      baseUnitPrice: Number(basePrice) || 0,
      currentUnitPrice: Number(basePrice) || 0,
      targetUnitPrice: priceForBuyers(tiers, targetBuyers, basePrice),
      chainGroupId: null,
      escrowAddress: escrowChain.contractAddress || "",
      reservedUnits: 0,
      rateAtLock: tdcSnapshot,
    });

    const saved = await pool.save();
    const savedMember = saved.members[saved.members.length - 1];

    // Monto (USD) a congelar del membro creador, según el tier vigente (1).
    const priceUnitArs = priceForBuyers(tiers, 1, basePrice);
    const lockedProductsUsd =
      tdcSnapshot > 0
        ? computeLockedAmountUsd(units, priceUnitArs, tdcSnapshot)
        : Number(basePrice) || 0;
    const shippingUsd = product.shipping?.free
      ? 0
      : Number(product.shipping?.cost) || 0;

    const order = await createPendingOrderForPoolMember({
      pool: saved,
      member: savedMember,
      product,
      chainId: escrowChain.chainId,
      lockedProductsUsd,
      shippingUsd,
      tokenSymbol: resolvePaymentToken(null, escrowChain),
      usdRate: tdcSnapshot,
    });
    savedMember.orderId = order._id;
    await saved.save();

    notifyVendorPoolActivity({
      pool: { ...saved.toObject(), productName: product.name, product: product._id },
      action: "created",
      actorUser: user,
    });

    const seller = await User.findById(product.seller).select("walletAddress");
    const orderForModal = {
      ...order.toObject(),
      sellerWallet: seller?.walletAddress || "",
      escrowContract: escrowChain.contractAddress || "",
      tokenSymbol: resolvePaymentToken(null, escrowChain),
      chainId: escrowChain.chainId,
      fundingMode: escrowChain.fundingMode,
    };

    return res
      .status(201)
      .json({ success: true, pool: serializePool(saved), order: orderForModal });
  } catch (error) {
    console.error("Error en createPool:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al crear el grupo." });
  }
};


// ──────────────────────────────────────────────────────────────────────
// POST /api/pool/:id/join   (protegida)
// Suma al usuario logueado al pool. Si se llena, pasa a "filled".
// ──────────────────────────────────────────────────────────────────────

export const joinPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const units = Math.max(1, Math.floor(Number(req.body?.units) || 1));
    const chainId = req.body?.chainId;

    const pool = await Pool.findById(id).populate("product");
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    await applyLazyExpiry(pool);

    if (pool.status !== "open") {
      return res.status(400).json({
        success: false,
        message:
          pool.status === "filled"
            ? "El grupo ya está completo."
            : "El grupo ya no está activo.",
      });
    }

    if (pool.seller.toString() === userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Sos el vendedor; no podés unirte a este grupo.",
      });
    }

    if (pool.members.some((m) => m.user.toString() === userId.toString())) {
      return res.status(409).json({
        success: false,
        message: "Ya estás en este grupo.",
        pool: serializePool(pool),
      });
    }

    if (pool.members.length >= pool.targetBuyers) {
      pool.status = "filled";
      pool.filledAt = pool.filledAt || new Date();
      await pool.save();
      return res.status(400).json({
        success: false,
        message: "El grupo ya está completo.",
        pool: serializePool(pool),
      });
    }

    const user = await User.findById(userId).select(
      "username firstName lastName avatar walletAddress",
    );

    if (!user?.walletAddress) {
      return res.status(400).json({
        success: false,
        message:
          "Necesitás una billetera Web3 vinculada para unirte a un grupo de compra. Generá o vinculá tu billetera e intentá de nuevo.",
        needsWallet: true,
      });
    }

    pool.members.push({
      user: userId,
      username: user?.username || user?.firstName || "vos",
      avatar: user?.avatar || "",
      joinedAt: new Date(),
      units,
      wallet: user.walletAddress,
      escrowStatus: "pending",
      shippingAddress: req.body?.shippingAddress || {},
    });

    const tiers = pool.product?.socialSelling?.tiers || {};
    pool.currentUnitPrice = priceForBuyers(
      tiers,
      pool.members.length,
      pool.baseUnitPrice,
    );

    if (pool.members.length >= pool.targetBuyers) {
      pool.status = "filled";
      pool.filledAt = new Date();
    }

    const saved = await pool.save();
    const savedMember = saved.members[saved.members.length - 1];

    // Monto (USD) a congelar del nuevo member, según el tier VIGENTE ahora.
    const tdc = Number(pool.rateAtLock) || 0;
    const priceUnitArs = priceForBuyers(
      tiers,
      saved.members.length,
      pool.baseUnitPrice,
    );
    const lockedProductsUsd =
      tdc > 0
        ? computeLockedAmountUsd(units, priceUnitArs, tdc)
        : Number(pool.currentUnitPrice) || 0;
    const shippingUsd = saved.product?.shipping?.free
      ? 0
      : Number(saved.product?.shipping?.cost) || 0;

    const escrowChain = getEscrowChainConfig(chainId ?? ESCROW_DEFAULT_CHAIN_ID);

    const order = await createPendingOrderForPoolMember({
      pool: saved,
      member: savedMember,
      product: saved.product,
      chainId: escrowChain.chainId,
      lockedProductsUsd,
      shippingUsd,
      tokenSymbol: resolvePaymentToken(null, escrowChain),
      usdRate: tdc,
    });
    savedMember.orderId = order._id;
    await saved.save();

    notifyVendorPoolActivity({
      pool: saved,
      action: "joined",
      actorUser: user,
    });

    const seller = await User.findById(pool.seller).select("walletAddress");
    const orderForModal = {
      ...order.toObject(),
      sellerWallet: seller?.walletAddress || "",
      escrowContract: escrowChain.contractAddress || "",
      tokenSymbol: resolvePaymentToken(null, escrowChain),
      chainId: escrowChain.chainId,
      fundingMode: escrowChain.fundingMode,
    };

    return res
      .status(200)
      .json({ success: true, pool: serializePool(saved), order: orderForModal });
  } catch (error) {
    console.error("Error en joinPool:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al unirse al grupo." });
  }
};


// ──────────────────────────────────────────────────────────────────────
// GET /api/pool/product/:productId   (pública)
// Lista los pools de un producto. Por defecto sólo activos; con ?all=1 trae
// también los cerrados. Devuelve, además, el pool propio si se está logueado.
// ──────────────────────────────────────────────────────────────────────
export const getPoolsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { all } = req.query;

    const filter = { product: productId };
    if (!all) filter.status = "open";

    const pools = await Pool.find(filter).sort({ expiresAt: 1 });

    // Expiración lazy (por si alguna quedó colgada sin cron).
    await Promise.all(pools.map((p) => applyLazyExpiry(p)));

    const serialized = pools
      .filter((p) => (all ? true : p.status === "open"))
      .map(serializePool);

    return res.status(200).json({ success: true, pools: serialized });
  } catch (error) {
    console.error("Error en getPoolsByProduct:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al obtener los grupos." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/pool/:id   (pública)
// Detalle de un pool + producto poblado (para el deep-link /pool/:id).
// ──────────────────────────────────────────────────────────────────────
export const getPoolById = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await Pool.findById(id)
      .populate("product")
      .populate("seller", "username shop isVerified walletAddress")
      .populate("creator", "username firstName lastName avatar");

    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    await applyLazyExpiry(pool);

    return res.status(200).json({
      success: true,
      pool: serializePool(pool),
      // `productData` para que PoolDetail no tenga que hacer otra request.
      productData: pool.product || null,
    });
  } catch (error) {
    console.error("Error en getPoolById:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al obtener el grupo." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/pool   (pública)
// Lista global de pools. Por defecto sólo ACTIVOS ("open" sin expirar),
// ordenados por % de avance (más llenos primero) — para los carousels de
// Home. Con ?status=all trae todos los estados (para /compras-grupales).
//   ?limit=10   ?status=open|filled|expired|cancelled|all
// ──────────────────────────────────────────────────────────────────────
export const getActivePools = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const statusParam = req.query.status;
    const wantsAll = statusParam === "all";

    const filter = {};
    if (wantsAll) {
      // todos los estados
    } else if (
      statusParam &&
      ["open", "filled", "expired", "cancelled"].includes(statusParam)
    ) {
      filter.status = statusParam;
    } else {
      // por defecto: activos no vencidos
      filter.status = "open";
      filter.expiresAt = { $gt: new Date() };
    }

    const pools = await Pool.find(filter)
      .populate("product")
      .populate("seller", "username shop isVerified walletAddress")
      .lean();

    // Orden: progreso (% miembros/target) desc; desempate por fecha.
    const sorted = pools
      .map((p) => {
        // Expiración lazy "en memoria" (no persistimos en un listado lean):
        // si está open y ya venció, lo mostramos como expirado.
        const effectiveStatus =
          p.status === "open" && p.expiresAt && new Date(p.expiresAt) < new Date()
            ? "expired"
            : p.status;
        return {
          ...p,
          status: effectiveStatus,
          _progress: p.targetBuyers
            ? (p.members?.length || 0) / p.targetBuyers
            : 0,
        };
      })
      .sort(
        (a, b) =>
          b._progress - a._progress ||
          new Date(a.expiresAt) - new Date(b.expiresAt),
      )
      .slice(0, limit)
      .map((p) => {
        const { _progress, ...rest } = p;
        return serializePool({
          ...rest,
          toObject: () => rest,
        });
      });

    return res.status(200).json({ success: true, pools: sorted });
  } catch (error) {
    console.error("Error en getActivePools:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al obtener los grupos." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/pool/seller   (protegida)
// Lista los grupos ACTIVOS de los productos del vendedor logueado.
// No son órdenes todavía: sólo visibilidad para el vendedor.
//   ?status=open|filled|all   (default: open)
// ──────────────────────────────────────────────────────────────────────
export const getSellerPools = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const statusParam = req.query.status;

    const filter = { seller: sellerId };
    if (statusParam === "all") {
      // sin filtro de estado
    } else if (["open", "filled", "expired", "cancelled"].includes(statusParam)) {
      filter.status = statusParam;
    } else {
      filter.status = "open";
    }

    const pools = await Pool.find(filter)
      .populate("product", "name price images")
      .populate("creator", "username firstName lastName avatar")
      .sort({ createdAt: -1 })
      .lean();

    // Expiración lazy "en memoria" (sin persistir).
    const serialized = pools.map((p) => {
      const effectiveStatus =
        p.status === "open" && p.expiresAt && new Date(p.expiresAt) < new Date()
          ? "expired"
          : p.status;
      return serializePool({
        ...p,
        status: effectiveStatus,
        toObject: () => ({ ...p, status: effectiveStatus }),
      });
    });

    return res.status(200).json({ success: true, pools: serialized });
  } catch (error) {
    console.error("Error en getSellerPools:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al obtener tus grupos." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/pool/mine   (protegida)
// Lista los grupos en los que PARTICIPA el usuario logueado (ya sea como
// creador o como miembro). Sirve para que el COMPRADOR vea sus grupos
// activos desde su panel, de la misma forma que el vendedor los ve desde
// el suyo. Una vez que el grupo se cierra se crean las órdenes oficiales y
// esas órdenes pasan a verse en la solapa principal de compras.
//   ?status=open|filled|all   (default: open)
// ──────────────────────────────────────────────────────────────────────
export const getBuyerPools = async (req, res) => {
  try {
    const userId = req.user._id;
    const statusParam = req.query.status;

    // El usuario es miembro del pool (el creador siempre está en members).
    const filter = { "members.user": userId };
    if (statusParam === "all") {
      // sin filtro de estado
    } else if (
      ["open", "filled", "expired", "cancelled"].includes(statusParam)
    ) {
      filter.status = statusParam;
    } else {
      filter.status = "open";
    }

    const pools = await Pool.find(filter)
      .populate("product", "name price images")
      .populate("seller", "username shop isVerified walletAddress")
      .populate("creator", "username firstName lastName avatar")
      .sort({ createdAt: -1 })
      .lean();

    // Expiración lazy "en memoria" (sin persistir).
    const serialized = pools.map((p) => {
      const effectiveStatus =
        p.status === "open" &&
        p.expiresAt &&
        new Date(p.expiresAt) < new Date()
          ? "expired"
          : p.status;
      return serializePool({
        ...p,
        status: effectiveStatus,
        toObject: () => ({ ...p, status: effectiveStatus }),
      });
    });

    return res.status(200).json({ success: true, pools: serialized });
  } catch (error) {
    console.error("Error en getBuyerPools:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al obtener tus grupos." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// PATCH /api/pool/:id/cancel   (protegida)
// Cancela un pool. Sólo el creador puede hacerlo (mientras esté "open").
// ──────────────────────────────────────────────────────────────────────
export const cancelPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id);
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    if (pool.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Sólo el creador puede cancelar el grupo.",
      });
    }

    if (pool.status !== "open") {
      return res.status(400).json({
        success: false,
        message: "El grupo ya no está activo.",
      });
    }

    pool.status = "cancelled";
    await pool.save();

    return res.status(200).json({ success: true, pool: serializePool(pool) });
  } catch (error) {
    console.error("Error en cancelPool:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al cancelar el grupo." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// DELETE /api/pool/:id/rollback   (protegida)
//
// ROLLBACK de un pool PROVISIONAL. Se usa cuando el creador inició la
// creación del grupo (el Pool ya existe en DB) pero el fondeo on-chain NO se
// completó (canceló la firma, rechazó la tx o falló). En ese caso el pool NO
// debe quedar activo: nadie depositó, y un grupo sin saldo congelado es un
// agujero (otro se une, deposita, y el creador nunca fondea).
//
// Condiciones para borrar:
//   - El que llama es el creador.
//   - El pool sigue "open" (nadie lo cerró/llenó).
//   - NO hay fondeo confirmado (chainGroupId === null) — si ya está on-chain
//     no se puede borrar a la ligera, se cancela.
//   - No hay OTROS miembros (si alguien más ya se unió, se marca cancelled).
// ──────────────────────────────────────────────────────────────────────
export const rollbackPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id);
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    if (pool.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Sólo el creador puede descartar el grupo.",
      });
    }

    // Si ya se fondeó on-chain, NO borramos: lo cancelamos para conservar el
    // rastro (el reembolso on-chain lo maneja el flujo de close/refund).
    if (pool.chainGroupId) {
      if (pool.status === "open") {
        pool.status = "cancelled";
        await pool.save();
      }
      return res.status(200).json({
        success: true,
        cancelled: true,
        pool: serializePool(pool),
      });
    }

    // Si hay otros miembros (además del creador), no es "provisional puro":
    // lo cancelamos en lugar de borrarlo, para no perder el historial.
    const otherMembers = pool.members.filter(
      (m) => m.user.toString() !== userId.toString(),
    );
    if (otherMembers.length > 0) {
      pool.status = "cancelled";
      await pool.save();
      return res.status(200).json({
        success: true,
        cancelled: true,
        pool: serializePool(pool),
      });
    }

    // Pool provisional: creador solo, sin fondeo, sin otros miembros → BORRAR.
    await Pool.deleteOne({ _id: pool._id });
    return res.status(200).json({ success: true, deleted: true });
  } catch (error) {
    console.error("Error en rollbackPool:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al descartar el grupo." });
  }
};

// ──────────────────────────────────────────────────────────────────────
// DELETE /api/pool/:id/leave   (protegida)  — opcional (útil para tests)
// Saca al usuario logueado del pool (mientras esté "open").
// ──────────────────────────────────────────────────────────────────────
export const leavePool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id).populate("product");
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    if (pool.status !== "open") {
      return res.status(400).json({
        success: false,
        message: "No podés salir de un grupo que ya cerró.",
      });
    }

    const before = pool.members.length;
    pool.members = pool.members.filter(
      (m) => m.user.toString() !== userId.toString(),
    );

    if (pool.members.length === before) {
      return res
        .status(404)
        .json({ success: false, message: "No estás en este grupo." });
    }

    // Recalculamos precio con la nueva cantidad.
    const tiers = pool.product?.socialSelling?.tiers || {};
    pool.currentUnitPrice = priceForBuyers(
      tiers,
      pool.members.length,
      pool.baseUnitPrice,
    );

    await pool.save();
    return res.status(200).json({ success: true, pool: serializePool(pool) });
  } catch (error) {
    console.error("Error en leavePool:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error al salir del grupo." });
  }
};

// ══════════════════════════════════════════════════════════════════════
// ESCROW ON-CHAIN DEL GRUPO (NeroGroupBuy)
// ══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
// POST /api/pool/:id/prepare-funding   (protegida)
//
// Prepara TODO lo que el front necesita para que el comprador firme el
// fondeo on-chain de SU porción (createGroup si es el creador, joinGroup
// si se está sumando):
//   - groupId (= Pool._id.toString())
//   - address del contrato, token USDT, targetBuyers
//   - units + monto (USDT) a congelar, priceArs y rateAtLock (snapshot TDC)
//   - gas drip (la plataforma le da BNB para pagar el gas)
//
// El comprador luego hace approve + createGroup/joinGroup desde el front.
// Después debe llamar a POST /:id/escrow/fund con el txHash.
// ──────────────────────────────────────────────────────────────────────

export const preparePoolFunding = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id);
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }
    const member = pool.members.find(
      (m) => m.user.toString() === userId.toString(),
    );
    if (!member) {
      return res
        .status(403)
        .json({ success: false, message: "No sos parte de este grupo." });
    }

    const order = member.orderId
      ? await Order.findById(member.orderId)
      : await Order.findOne({
          "groupBuy.poolId": pool._id,
          buyer: member.user,
          isGroupBuy: true,
        });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "No se encontró la orden del comprador en el grupo.",
      });
    }

    // Delegamos en el MISMO prepare de las órdenes individuales.
    const { prepareEscrowFunding } = await import("./orderCryptoController.js");
    req.params.orderId = order._id.toString();
    return prepareEscrowFunding(req, res);
  } catch (error) {
    console.error("Error en preparePoolFunding:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error al preparar el fondeo del grupo.",
    });
  }
};


// ──────────────────────────────────────────────────────────────────────
// POST /api/pool/:id/escrow/fund   (protegida)
//
// El comprador YA firmó createGroup/joinGroup on-chain. Verificamos la tx
// on-chain (no confiamos en el front), reservamos el stock y guardamos el
// txHash + estado "locked" del member.
//
// body: { txHash }
// ──────────────────────────────────────────────────────────────────────

export const confirmPoolFunding = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id);
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }
    const member = pool.members.find(
      (m) => m.user.toString() === userId.toString(),
    );
    if (!member) {
      return res
        .status(403)
        .json({ success: false, message: "No sos parte de este grupo." });
    }

    const order = member.orderId
      ? await Order.findById(member.orderId)
      : await Order.findOne({
          "groupBuy.poolId": pool._id,
          buyer: member.user,
          isGroupBuy: true,
        });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "No se encontró la orden del comprador en el grupo.",
      });
    }

    // Delegamos en el MISMO confirm de las órdenes individuales.
    const { confirmEscrowFunding } = await import("./orderCryptoController.js");
    req.params.orderId = order._id.toString();
    // El modal manda fundTxHash; el wrapper de pool puede recibir txHash.
    if (req.body?.txHash && !req.body?.fundTxHash) {
      req.body.fundTxHash = req.body.txHash;
    }
    return confirmEscrowFunding(req, res);
  } catch (error) {
    console.error("Error en confirmPoolFunding:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error al confirmar el fondeo del grupo.",
    });
  }
};


// ──────────────────────────────────────────────────────────────────────
// POST /api/pool/:id/close   (ADMIN)
//
// Cierra el grupo on-chain (fija el precio final unitario en USDT) y
// dispara la creación de las órdenes individuales (syncPoolOrdersAfterRelease).
//
// Reglas:
//   - Si memberCount >= 2 → closeGroupOnChain + sync órdenes.
//   - Si hay 1 solo comprador: reembolso íntegro (cancelOrderEscrow).
//
// body: { force?: boolean }  (force permite cerrar un grupo "open" ya vencido)
// ──────────────────────────────────────────────────────────────────────

export const closePool = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await Pool.findById(id).populate("product");
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    if (!["open", "filled"].includes(pool.status)) {
      return res.status(400).json({
        success: false,
        message: "El grupo no está abierto/filled; no se puede cerrar.",
      });
    }

    // Precio final unitario (USDT) según el tier del objetivo del grupo.
    const tdcRes = await getTdc();
    if (!tdcRes.success) {
      return res.status(503).json({
        success: false,
        message: "No se pudo obtener el TDC para fijar el precio final.",
      });
    }
    const tdc = tdcRes.tdc;
    const tiers = pool.product?.socialSelling?.tiers || {};
    const finalPriceArs = finalTargetPriceArs(
      tiers,
      pool.targetBuyers,
      pool.baseUnitPrice,
    );
    const finalUnitPriceUsd = Number((finalPriceArs / tdc).toFixed(6));

    // Fee vigente del contrato de escrow (para calcular el neto del vendedor).
    let feeBps = 0;
    try {
      const feeRead = await getFeeBps(ESCROW_DEFAULT_CHAIN_ID);
      if (feeRead.success) feeBps = feeRead.feeBps;
    } catch (e) {
      console.warn("closePool: no se pudo leer feeBps:", e?.message);
    }

    // Fix del precio final escalonado en cada orden del grupo.
    const fin = await finalizePoolOrdersFinalPrice({
      pool,
      finalUnitPriceUsd,
      feeBps,
    });

    // Grupo con 1 solo comprador → reembolso íntegro (cancelOrderEscrow).
    const isSingle = (pool.members?.length || 0) < 2;
    if (isSingle) {
      const results = [];
      for (const o of fin.orders) {
        try {
          if (o.payment?.status === "funded") {
            const r = await cancelOrderEscrow(
              o._id.toString(),
              o.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID,
            );
            results.push({ orderId: o._id, ok: r.success, error: r.error });
            if (r.success) {
              o.payment.status = "cancelled_refunded";
              o.status = "cancelled";
              await o.save();
            }
          }
        } catch (err) {
          results.push({ orderId: o._id, ok: false, error: err.message });
        }
      }
      pool.status = "expired";
      pool.closedAt = new Date();
      pool.finalUnitPriceUsd = finalUnitPriceUsd;
      pool.members.forEach((m) => {
        m.escrowStatus = "refunded";
        m.refundedAt = new Date();
      });
      await pool.save();
      return res.status(200).json({
        success: true,
        refunded: true,
        single: true,
        results,
        pool: serializePool(await Pool.findById(pool._id)),
      });
    }

    // Grupo >= 2: el grupo se cierra. Las órdenes ya están fondeadas; el
    // reintegro escalonado se ejecuta en el settle al confirmar recepción.
    pool.status = "filled";
    pool.filledAt = pool.filledAt || new Date();
    pool.closedAt = new Date();
    pool.finalUnitPriceUsd = finalUnitPriceUsd;
    await pool.save();

    return res.status(200).json({
      success: true,
      closed: true,
      finalUnitPriceUsd,
      ordersUpdated: fin.updated,
      pool: serializePool(await Pool.findById(pool._id)),
    });
  } catch (error) {
    console.error("Error en closePool:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error al cerrar el grupo.",
    });
  }
};


// ──────────────────────────────────────────────────────────────────────
// POST /api/pool/:id/release-member   (protegida)
//
// Un COMPRADOR confirma la recepción de su pedido → se libera su porción
// on-chain (releaseMember): el vendedor recibe el neto, se cobra el fee y
// se reintegra el remanente al comprador.
//
// body: { buyer?: address }  (admin puede liberar a otro; el comprador solo a sí mismo)
// ──────────────────────────────────────────────────────────────────────

export const releasePoolMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id);
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    const member = pool.members.find(
      (m) => m.user.toString() === userId.toString(),
    );
    if (!member) {
      return res
        .status(403)
        .json({ success: false, message: "No sos parte de este grupo." });
    }

    // Resolvemos la orden del member y liberamos su escrow (NeroEscrow).
    const order = member.orderId
      ? await Order.findById(member.orderId)
      : await Order.findOne({
          "groupBuy.poolId": pool._id,
          buyer: member.user,
          isGroupBuy: true,
        });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "No se encontró la orden del comprador en el grupo.",
      });
    }

    const released = await releaseOrderEscrow(
      order._id.toString(),
      order.payment?.chainId ?? ESCROW_DEFAULT_CHAIN_ID,
    );
    if (!released.success) {
      return res.status(502).json({
        success: false,
        message: `Fallo la liberación on-chain: ${released.error}`,
      });
    }

    order.payment.status = "released";
    order.payment.releaseTxHash = released.txHash;
    order.payment.releasedAt = new Date();
    order.groupBuy.refunded = true;
    order.groupBuy.refundTxHash = released.txHash;
    order.groupBuy.refundedAt = new Date();
    await order.save();

    member.escrowStatus = "released";
    member.releasedAt = new Date();
    member.releaseTxHash = released.txHash;
    member.finalUnitPriceUsd = pool.finalUnitPriceUsd;
    await pool.save();

    return res.status(200).json({
      success: true,
      txHash: released.txHash,
      pool: serializePool(pool),
    });
  } catch (error) {
    console.error("Error en releasePoolMember:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error al liberar tu porción del grupo.",
    });
  }
};

