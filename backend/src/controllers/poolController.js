import Pool from "../models/Pool.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { createNotification } from "../services/notificationService.js";
import { sendPoolActivityToVendor } from "../services/sendEmail.js";
import { getTdc } from "../services/tdcService.js";
import { prepareFunding as prepareGasFunding } from "../services/gasDripService.js";
import {
  verifyMemberFunded,
  verifyGroupFunded,
  getGroupOnChain,
  closeGroupOnChain,
  releaseMemberOnChain,
  refundGroupOnChain,
  GROUP_BUY_CONTRACT_ADDRESS,
} from "../services/groupBuyEscrowService.js";
import { syncPoolOrdersAfterRelease } from "./groupBuyOrderController.js";

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
const GROUP_ESCROW_TOKEN =
  process.env.USDT_TESTNET_ADDRESS ||
  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
const GROUP_ESCROW_TOKEN_DECIMALS = 18; // USDT en BSC (mainnet y testnet) usa 18.

/** Lanza si el contrato de compra grupal no está configurado. */
const requireGroupContract = () => {
  if (!GROUP_BUY_CONTRACT_ADDRESS) {
    throw new Error(
      "GROUP_BUY_CONTRACT_ADDRESS no está configurada. Desplegá NeroGroupBuy y setea la variable.",
    );
  }
};

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
    const { productId, units: rawUnits } = req.body;
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

    // El vendedor no puede unirse a su propio pool (evita auto-sabotaje).
    if (product.seller.toString() === userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Sos el vendedor de este producto; no podés crear un grupo.",
      });
    }

    // ¿El usuario ya está en un pool abierto para este producto?
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

    // Stock disponible real = stock - reservado por pools abiertos.
    const availableStock = Math.max(
      0,
      (product.stock ?? 0) - (product.reservedStock ?? 0),
    );
    if (availableStock < units) {
      return res.status(400).json({
        success: false,
        message: `No hay stock suficiente para ${units} unidad(es). Disponible: ${availableStock}.`,
      });
    }

    const user = await User.findById(userId).select(
      "username firstName lastName avatar walletAddress",
    );

    // El creador necesita wallet Web3 para fondear on-chain.
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

    // ── VALIDACIÓN DE SALDO PREVIA (evita pools sin saldo congelado) ──
    // El grupo nace SOLO si el creador puede congelar su USDT. Validamos acá
    // ANTES de insertar el pool: si no alcanza, no se crea nada (nada de
    // grupos huérfanos ni "crear por crear").
    let tdcSnapshot = 0;
    try {
      const tdcRes = await getTdc();
      if (!tdcRes.success) {
        return res.status(503).json({
          success: false,
          message:
            "No se pudo obtener la cotización (TDC). Reintentá en unos segundos.",
        });
      }
      tdcSnapshot = tdcRes.tdc;

      const priceUnitArs = priceForBuyers(tiers, 1, basePrice);
      const lockedUsd = computeLockedAmountUsd(units, priceUnitArs, tdcSnapshot);

      const gas = await prepareGasFunding({
        userId,
        walletAddress: user.walletAddress,
        usdtAddress: GROUP_ESCROW_TOKEN,
        requiredUsd: lockedUsd,
        reason: "create_group",
        refId: null,
      });
      if (!gas.success) {
        return res.status(400).json({
          success: false,
          message:
            gas.error || "No pudimos validar tu saldo para fondear el grupo.",
          insufficientUsdt: !!gas.insufficientUsdt,
          required: gas.requiredUsd ?? lockedUsd,
          balance: gas.balanceUsd ?? 0,
        });
      }
    } catch (prepErr) {
      console.error("Error validando saldo en createPool:", prepErr);
      return res.status(502).json({
        success: false,
        message:
          "No pudimos validar tu saldo on-chain. Reintentá en unos segundos.",
      });
    }

    const pool = new Pool({
      product: product._id,
      seller: product.seller,
      creator: userId,
      members: [
        {
          user: userId,
          username: user?.username || user?.firstName || "vos",
          avatar: user?.avatar || "",
          joinedAt: new Date(),
          units,
          wallet: user?.walletAddress || "",
          escrowStatus: "pending",
        },
      ],
      targetBuyers,
      expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
      status: "open",
      baseUnitPrice: Number(basePrice) || 0,
      // Con 1 miembro todavía no aplica tier: precio actual = base.
      currentUnitPrice: Number(basePrice) || 0,
      targetUnitPrice: priceForBuyers(tiers, targetBuyers, basePrice),
      // Vínculo on-chain: el groupId es el _id del Pool.
      chainGroupId: null, // se setea al confirmar el fondeo on-chain
      escrowAddress: GROUP_BUY_CONTRACT_ADDRESS || "",
      reservedUnits: 0, // se suma al confirmar el fondeo
      rateAtLock: tdcSnapshot, // TDC snapshot para el precio en USDT
    });

    const saved = await pool.save();

    // Avisamos al vendedor (in-app + email). No bloquea la respuesta.
    notifyVendorPoolActivity({
      pool: { ...saved.toObject(), productName: product.name, product: product._id },
      action: "created",
      actorUser: user,
    });

    return res.status(201).json({ success: true, pool: serializePool(saved) });
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

    // No puede unirse el vendedor dueño del producto.
    if (pool.seller.toString() === userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Sos el vendedor; no podés unirte a este grupo.",
      });
    }

    // Evitar doble membresía.
    if (pool.members.some((m) => m.user.toString() === userId.toString())) {
      return res.status(409).json({
        success: false,
        message: "Ya estás en este grupo.",
        pool: serializePool(pool),
      });
    }

    // No se puede sumar si ya se alcanzó el objetivo.
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

    // Stock disponible real (stock - reservado por pools abiertos).
    const product = pool.product;
    const availableStock = Math.max(
      0,
      (product.stock ?? 0) - (product.reservedStock ?? 0),
    );
    if (availableStock < units) {
      return res.status(400).json({
        success: false,
        message: `No hay stock suficiente para ${units} unidad(es). Disponible: ${availableStock}.`,
      });
    }

    const user = await User.findById(userId).select(
      "username firstName lastName avatar walletAddress",
    );

    // El comprador necesita una wallet Web3 para fondear on-chain.
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
    });

    // Recalculamos el precio actual con el nº de miembros resultante.
    const tiers = pool.product?.socialSelling?.tiers || {};
    pool.currentUnitPrice = priceForBuyers(
      tiers,
      pool.members.length,
      pool.baseUnitPrice,
    );

    // ¿Se llenó?
    if (pool.members.length >= pool.targetBuyers) {
      pool.status = "filled";
      pool.filledAt = new Date();
    }

    const saved = await pool.save();

    // Avisamos al vendedor (in-app + email). No bloquea la respuesta.
    notifyVendorPoolActivity({
      pool: saved,
      action: "joined",
      actorUser: user,
    });

    return res
      .status(200)
      .json({ success: true, pool: serializePool(saved) });
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
    requireGroupContract();
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id).populate("product");
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    // El member debe existir y no estar ya fondeado.
    const member = pool.members.find(
      (m) => m.user.toString() === userId.toString(),
    );
    if (!member) {
      return res
        .status(403)
        .json({ success: false, message: "No sos parte de este grupo." });
    }
    if (member.escrowStatus === "locked" || member.escrowStatus === "released") {
      return res.status(409).json({
        success: false,
        message: "Tu porción ya está fondeada.",
        pool: serializePool(pool),
      });
    }
    if (pool.status === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "El grupo fue cancelado." });
    }

    // El vendedor debe tener wallet (destino de los fondos on-chain).
    const seller = await User.findById(pool.seller).select("walletAddress");
    if (!seller?.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "El vendedor no tiene una billetera Web3 vinculada.",
      });
    }

    // ── TDC + precio del tier actual ──
    const tdcRes = await getTdc();
    if (!tdcRes.success) {
      return res.status(503).json({
        success: false,
        message: "No se pudo obtener la cotización (TDC). Reintentá en unos segundos.",
      });
    }
    const tdc = tdcRes.tdc;

    const tiers = pool.product?.socialSelling?.tiers || {};
    // Tier según cuántas personas hay AHORA (incluyéndome).
    const priceUnitArs = priceForBuyers(
      tiers,
      pool.members.length,
      pool.baseUnitPrice,
    );
    const units = member.units || 1;
    const lockedUsd = computeLockedAmountUsd(units, priceUnitArs, tdc);
    const lockedWei = (
      BigInt(Math.round(lockedUsd * 1e6)) * BigInt(10) ** BigInt(12)
    ).toString(); // 6 dec → 18 dec

    // ── Gas drip: garantiza BNB para firmar + valida saldo USDT ──
    const buyerWallet = member.wallet || req.user.walletAddress;
    let gas = null;
    if (buyerWallet) {
      gas = await prepareGasFunding({
        userId,
        walletAddress: buyerWallet,
        usdtAddress: GROUP_ESCROW_TOKEN,
        requiredUsd: lockedUsd,
        reason: pool.creator.toString() === userId.toString()
          ? "create_group"
          : "join_group",
        refId: pool._id,
      });
      if (!gas.success) {
        return res.status(400).json({
          success: false,
          message:
            gas.error ||
            "No se pudo preparar el gas/saldo para el fondeo.",
          // Datos para que el front muestre el aviso de recarga de USDT.
          insufficientUsdt: !!gas.insufficientUsdt,
          required: gas.requiredUsd ?? lockedUsd,
          balance: gas.balanceUsd ?? 0,
        });
      }
    }

    return res.status(200).json({
      success: true,
      funding: {
        groupId: pool._id.toString(),
        contractAddress: GROUP_BUY_CONTRACT_ADDRESS,
        tokenAddress: GROUP_ESCROW_TOKEN,
        tokenSymbol: "USDT",
        tokenDecimals: GROUP_ESCROW_TOKEN_DECIMALS,
        sellerWallet: seller.walletAddress,
        targetBuyers: pool.targetBuyers,
        isCreator: pool.creator.toString() === userId.toString(),
        units,
        priceUnitArs,
        tdc,
        lockedUsd,
        lockedWei,
      },
      gas,
    });
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
    requireGroupContract();
    const userId = req.user._id;
    const { id } = req.params;
    const { txHash } = req.body;

    if (!txHash) {
      return res
        .status(400)
        .json({ success: false, message: "Falta el txHash del fondeo." });
    }

    const pool = await Pool.findById(id).populate("product");
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

    // Idempotencia: si ya estaba fondeado, devolvemos ok.
    if (member.escrowStatus === "locked") {
      return res.status(200).json({
        success: true,
        alreadyFunded: true,
        pool: serializePool(pool),
      });
    }

    const buyerWallet = member.wallet || req.user.walletAddress;
    if (!buyerWallet) {
      return res.status(400).json({
        success: false,
        message: "No se pudo determinar tu wallet para verificar el fondeo.",
      });
    }

    const groupId = pool._id.toString();
    const units = member.units || 1;

    // ── 1. Verificar el miembro on-chain por su wallet ──
    // El contrato no guarda el txHash por miembro, así que verificamos el
    // estado on-chain real: el buyer debe figurar fondeado con sus unidades.
    const check = await verifyMemberFunded(groupId, buyerWallet, { units });
    if (!check.success || !check.funded) {
      return res.status(400).json({
        success: false,
        message:
          check.error ||
          "No encontramos tu fondeo on-chain. Verificá que la transacción se haya confirmado.",
      });
    }

    // ── 2. Reservar stock: reservedStock += units (atómico, con guard) ──
    const product = pool.product;
    const stockRes = await Product.updateOne(
      {
        _id: product._id,
        $expr: {
          $gte: [
            { $subtract: [{ $ifNull: ["$stock", 0] }, { $ifNull: ["$reservedStock", 0] }] },
            units,
          ],
        },
      },
      { $inc: { reservedStock: units } },
    );
    if (stockRes.modifiedCount === 0) {
      // El fondeo on-chain ya ocurrió pero no hay stock físico: caso borde.
      // Marcamos el member para revisión manual (no rompemos el flujo on-chain).
      member.escrowStatus = "locked";
      member.txHash = txHash;
      member.fundedAt = new Date();
      member.needsReview = true;
      await pool.save();
      return res.status(409).json({
        success: false,
        message:
          "Tu pago se confirmó on-chain, pero ya no hay stock físico para reservar. Contactá a soporte.",
        pool: serializePool(pool),
      });
    }

    // ── 3. Persistir el member fondeado ──
    member.escrowStatus = "locked";
    member.txHash = txHash;
    member.fundedAt = new Date();
    member.locked = check.member?.lockedAmount
      ? String(check.member.lockedAmount)
      : member.locked;

    // ── 4. Vínculo con el grupo on-chain (groupId = Pool._id) ──
    pool.chainGroupId = groupId;
    if (!pool.escrowAddress) pool.escrowAddress = GROUP_BUY_CONTRACT_ADDRESS;
    pool.reservedUnits = (pool.reservedUnits || 0) + units;

    // ── 5. ¿Están TODOS los members fondeados? → group fully funded ──
    const allFunded = pool.members.every(
      (m) => m.escrowStatus === "locked" || m.escrowStatus === "released",
    );
    if (allFunded && pool.status === "filled") {
      // Listo para que el admin cierre el grupo on-chain.
      pool.orderSyncStatus = "pending";
    }

    await pool.save();

    return res.status(200).json({
      success: true,
      pool: serializePool(pool),
      allFunded,
    });
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
//   - Si memberCount === 1 → refundGroupOnChain (devuelve el 100% al creador).
//
// body: { force?: boolean }  (force permite cerrar un grupo "open" ya vencido)
// ──────────────────────────────────────────────────────────────────────
export const closePool = async (req, res) => {
  try {
    requireGroupContract();
    const { id } = req.params;

    const pool = await Pool.findById(id).populate("product");
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }

    if (!pool.chainGroupId) {
      return res.status(400).json({
        success: false,
        message: "El grupo nunca se fondeó on-chain. No hay nada que cerrar.",
      });
    }

    // ── Leer estado on-chain ──
    const onChain = await getGroupOnChain(pool.chainGroupId);
    if (!onChain.success) {
      return res.status(502).json({
        success: false,
        message: `No se pudo leer el grupo on-chain: ${onChain.error}`,
      });
    }
    if (onChain.closed) {
      return res.status(409).json({
        success: false,
        message: "El grupo ya estaba cerrado on-chain.",
      });
    }
    if (onChain.refunded) {
      return res.status(409).json({
        success: false,
        message: "El grupo ya fue reembolsado on-chain.",
      });
    }

    const memberCount = Number(onChain.memberCount);

    // ── CASO A: solo 1 comprador → reembolso íntegro ──
    if (memberCount < 2) {
      const refund = await refundGroupOnChain(pool.chainGroupId);
      if (!refund.success) {
        return res.status(502).json({
          success: false,
          message: `Fallo el reembolso on-chain: ${refund.error}`,
        });
      }

      // Restaurar stock reservado de ese único member.
      const units = pool.members.reduce((a, m) => a + (m.units || 1), 0);
      if (units > 0) {
        await Product.updateOne(
          { _id: pool.product._id },
          { $inc: { reservedStock: -units } },
        );
      }

      pool.status = "expired";
      pool.closedAt = new Date();
      pool.refundTxHash = refund.txHash;
      pool.members.forEach((m) => {
        m.escrowStatus = "refunded";
        m.refundedAt = new Date();
      });
      await pool.save();

      return res.status(200).json({
        success: true,
        refunded: true,
        txHash: refund.txHash,
        pool: serializePool(pool),
      });
    }

    // ── CASO B: cerrar con precio final unitario (USDT) ──
    // El precio final = tier de targetBuyers (o el más bajo definido). Lo
    // convertimos a USDT con el TDC del cierre.
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

    const closed = await closeGroupOnChain(
      pool.chainGroupId,
      finalUnitPriceUsd,
    );
    if (!closed.success) {
      return res.status(502).json({
        success: false,
        message: `Fallo el cierre on-chain: ${closed.error}`,
      });
    }

    // Actualizamos el pool con el precio final y disparamos el sync de órdenes.
    pool.finalUnitPriceUsd = finalUnitPriceUsd;
    pool.closeTxHash = closed.txHash;
    pool.closedAt = new Date();
    if (pool.status === "open") {
      pool.status = "filled"; // se cerró (aunque no se haya "llenado" del todo)
      pool.filledAt = pool.filledAt || new Date();
    }
    await pool.save();

    // ── Crear las órdenes individuales (idempotente) ──
    const sync = await syncPoolOrdersAfterRelease(pool._id);
    if (!sync.success) {
      // El cierre on-chain se hizo, pero el sync quedó parcial: se puede reintentar.
      return res.status(207).json({
        success: false,
        partial: true,
        message:
          "El grupo se cerró on-chain, pero no se pudieron crear todas las órdenes. Reintentá el cierre.",
        sync,
        pool: serializePool(await Pool.findById(pool._id)),
      });
    }

    return res.status(200).json({
      success: true,
      closed: true,
      txHash: closed.txHash,
      finalUnitPriceUsd,
      ordersCreated: sync.ordersCreated?.length || 0,
      sync,
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
    requireGroupContract();
    const userId = req.user._id;
    const { id } = req.params;

    const pool = await Pool.findById(id).populate("product");
    if (!pool) {
      return res
        .status(404)
        .json({ success: false, message: "Grupo no encontrado." });
    }
    if (pool.status !== "filled") {
      return res.status(400).json({
        success: false,
        message: "El grupo todavía no se cerró.",
      });
    }
    if (!pool.chainGroupId) {
      return res.status(400).json({
        success: false,
        message: "El grupo nunca se fondeó on-chain.",
      });
    }

    const member = pool.members.find(
      (m) => m.user.toString() === userId.toString(),
    );
    if (!member) {
      return res
        .status(403)
        .json({ success: false, message: "No sos parte de este grupo." });
    }
    if (member.escrowStatus === "released") {
      return res.status(409).json({
        success: false,
        message: "Tu porción ya fue liberada.",
        pool: serializePool(pool),
      });
    }
    if (member.escrowStatus !== "locked") {
      return res.status(400).json({
        success: false,
        message: "Tu porción no está fondeada; no se puede liberar.",
      });
    }

    const released = await releaseMemberOnChain(
      pool.chainGroupId,
      member.wallet,
    );
    if (!released.success) {
      return res.status(502).json({
        success: false,
        message: `Fallo la liberación on-chain: ${released.error}`,
      });
    }

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
