// controllers/adminController.js

import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import {
  auditCollateral,
  summarizeAudit,
} from '../services/collateralAuditService.js';
import { notifyAdmin, escapeTelegramHtml as tgEsc } from '../services/telegramService.js';

export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('buyer', 'firstName lastName email username avatar')
      .populate('seller', 'username email firstName lastName shop avatar')
      .sort({ createdAt: -1 });

    // Mapeamos para exponer solo lo necesario y con campos normalizados
    const data = orders.map((o) => ({
      _id: o._id,
      code: String(o._id).slice(-6).toUpperCase(),
      buyer: o.buyer,
      seller: o.seller,
      totalAmount: o.totalAmount,
      productsAmount: o.productsAmount,
      shippingAmount: o.shippingAmount,
      currency: o.currency,
            status: o.status,
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
      // Buffer de protecciÃ³n del comprador (flujo reception_confirmed â†’ liberaciÃ³n).
      // El panel de admin los necesita para saber si el perÃ­odo de seguridad ya
      // se cumpliÃ³ y mostrar "liberable desde ..." en vez de "N/D".
      receptionConfirmedAt: o.receptionConfirmedAt,
      releaseEligibleAt: o.releaseEligibleAt,
      paymentProof: o.paymentProof,
      itemsSnapshot: o.itemsSnapshot,
      shippingDetails: o.shippingDetails,
      shippingAddress: o.shippingAddress,
            financials: o.financials,
      collateralTxHash: o.collateralTxHash,
      releaseTxHash: o.releaseTxHash,
      pendingRequest: o.pendingRequest,
      releaseRequest: o.releaseRequest,
      orderActions: o.orderActions,
      // Datos del PAGO (mÃ©todo + estado del escrow). El panel de admin los
      // necesita para distinguir transferencia bancaria de escrow crypto y
      // habilitar la acciÃ³n correcta ("Reembolsar comprador" usa cancel-escrow
      // sÃ³lo cuando payment.method === "crypto").
      payment: o.payment,
      // Estado de disputa. El modal de admin lo usa para mostrar el banner
      // "Orden en disputa", habilitar los botones de cierre (a favor del
      // comprador/vendedor) y OCULTAR "Abrir Disputa" cuando ya hay una
      // disputa abierta. Sin este campo, dispute llega undefined y el modal
      // cree que la orden no tiene disputa.
      dispute: o.dispute,
    }));

    res.status(200).json({ success: true, orders: data });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Error al obtener las Ã³rdenes" });
  }
};

// GET /api/admin/users
// Lista los usuarios con bÃºsqueda, ordenamiento y paginaciÃ³n (server-side).
// Los conteos de ventas/compras se calculan desde la colecciÃ³n Order (siempre al dÃ­a).
export const getAllUsers = async (req, res) => {
  try {
    const {
      search = "",
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

        // Filtro de bÃºsqueda (email, supabaseId, username, nombre)
    const match = {};
    if (search) {
      const reg = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      match.$or = [
        { email: reg },
        { supabaseId: reg },
        { username: reg },
        { firstName: reg },
        { lastName: reg },
      ];
    }

    // Mapa de ordenamiento.
    const sortMap = {
      sales: { totalSales: 1 },
      purchases: { totalPurchases: 1 },
      username: { username: 1 },
      createdAt: { createdAt: 1 },
    };
    const sortField = sortMap[sort] || sortMap.createdAt;
    const sortDir = order === "asc" ? 1 : -1;
    const sortStage = {};
    for (const k of Object.keys(sortField)) {
      sortStage[k] = sortDir;
    }

    const pipeline = [
      { $match: match },
      { $lookup: { from: "orders", localField: "_id", foreignField: "seller", as: "sales" } },
      { $lookup: { from: "orders", localField: "_id", foreignField: "buyer", as: "purchases" } },
      {
        $project: {
          username: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          avatar: 1,
          isSeller: 1,
          isVerified: 1,
          "shop.name": 1,
          "shop.active": 1,


                    rating: 1,
                    createdAt: 1,
          supabaseId: 1,
          "accounting.cancellationsAsBuyer": 1,
          "accounting.cancellationsAsSeller": 1,
          "accounting.refundsRequested": 1,
          "accounting.refundsPending": 1,



                                                  "accounting.claimsOpened": 1,
          "accounting.returnsRequested": 1,
          "accounting.expiredOrdersAsBuyer": 1,
          "accounting.expiredCollateralHolds": 1,
          "accounting.collateralRejectedBySeller": 1,
          "accounting.collateralHoldCancelledByBuyer": 1,
          "accounting.restricted": 1,
          totalSales: { $size: "$sales" },
          totalPurchases: { $size: "$purchases" },
        },
      },
      { $sort: sortStage },
      { $facet: { data: [{ $skip: skip }, { $limit: limitNum }], total: [{ $count: "count" }] } },
    ];

    const results = await User.aggregate(pipeline);
    const data = (results[0]?.data || []).map((u) => ({
      _id: u._id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: [u.firstName, u.lastName].filter(Boolean).join(" ").trim(),
      email: u.email,
      avatar: u.avatar,
      isSeller: u.isSeller,
      isVerified: u.isVerified,
      shopName: u.shop?.name || null,
      shopActive: u.shop?.active || false,
            totalSales: u.totalSales,
      totalPurchases: u.totalPurchases,
      rating: u.rating,
            createdAt: u.createdAt,
      accounting: {
        refundsPending: u.accounting?.refundsPending ?? 0,
        claimsOpened: u.accounting?.claimsOpened ?? 0,
        returnsRequested: u.accounting?.returnsRequested ?? 0,
        expiredOrdersAsBuyer: u.accounting?.expiredOrdersAsBuyer ?? 0,
        expiredCollateralHolds: u.accounting?.expiredCollateralHolds ?? 0,
        collateralRejectedBySeller: u.accounting?.collateralRejectedBySeller ?? 0,
        collateralHoldCancelledByBuyer: u.accounting?.collateralHoldCancelledByBuyer ?? 0,
        restricted: u.accounting?.restricted ?? false,
      },
    }));

    const total = results[0]?.total?.[0]?.count || 0;

    res.status(200).json({
      success: true,
      users: data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al obtener los usuarios" });
  }
};

// GET /api/admin/users/:id
// Detalle completo de un usuario (sin datos bancarios ni wallet).
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-__v -bankAccounts -shop.bankAccounts -addresses -favorites -posts -reviews -walletAddress",
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const [salesCount, purchasesCount] = await Promise.all([
      Order.countDocuments({ seller: user._id }),
      Order.countDocuments({ buyer: user._id }),
    ]);

        res.status(200).json({
      success: true,
      user: { ...user.toObject(), totalSales: salesCount, totalPurchases: purchasesCount },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al obtener el usuario" });
  }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GESTIÃ“N DEL ESTADO DE LA CUENTA (solo admin)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PATCH /api/admin/users/:id/status
// Body: { status: "active" | "suspended", reason? }
// Cambia el accountStatus del usuario. Suspender tambiÃ©n pausa sus productos
// activos (reversible). Nunca borra el documento (preserva Ã³rdenes/escrow).
export const adminSetUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason = "" } = req.body || {};

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Estado invÃ¡lido. UsÃ¡ 'active' o 'suspended'.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }

    if (user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "No se puede cambiar el estado de una cuenta de administrador.",
      });
    }

    if (status === "suspended" && !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: "El motivo de suspensiÃ³n es obligatorio.",
      });
    }

    user.accountStatus = status;
    user.accountStatusChangedAt = new Date();
    user.accountStatusChangedBy = req.user._id;
    user.accountStatusReason =
      status === "suspended" ? String(reason).trim() : "";
    await user.save();

        let productsPaused = 0;
    if (status === "suspended") {
      const r = await Product.updateMany(
        { seller: user._id, status: "active" },
        { $set: { status: "paused" } },
      );
      productsPaused = r.modifiedCount || 0;
    }

    // ── Espejo en TELEGRAM (solo admin): trazabilidad de acciones de cuenta ──
    notifyAdmin(status === "suspended" ? "user_suspended" : "user_reactivated", {
      header: status === "suspended" ? "⛔ <b>Cuenta suspendida</b>" : "♻️ <b>Cuenta reactivada</b>",
      lines: [
        `${tgEsc(user.email || "")} · ${tgEsc(user.username || "")}`,
        status === "suspended" ? `Motivo: ${tgEsc(String(reason).trim())}` : "",
        status === "suspended" ? `Publicaciones pausadas: ${productsPaused}` : "",
      ].filter(Boolean),
      data: { userId: user._id },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message:
        status === "suspended"
          ? `Cuenta suspendida. ${productsPaused} publicaciÃ³n(es) pausada(s).`
          : "Cuenta reactivada.",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        accountStatus: user.accountStatus,
        accountStatusReason: user.accountStatusReason,
        accountStatusChangedAt: user.accountStatusChangedAt,
      },
      productsPaused,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "Error al actualizar el estado de la cuenta" });
  }
};

// Gestion de la TIENDA del vendedor (aprobar / desactivar como admin).
// PATCH /api/admin/users/:id/shop  Body: { approved: boolean, reason? }.
// - approved=true: habilita publicar (requiere onboarding completo: shop.active).
// - approved=false: desactiva la tienda y pausa sus productos "active" (reversible).
// Ortogonal a accountStatus. Nunca borra el documento.
export const adminSetShopStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, reason = "" } = req.body || {};

    if (typeof approved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Valor invalido. Envia 'approved' como booleano.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    if (user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "No se puede gestionar la tienda de una cuenta de administrador.",
      });
    }

    if (approved && !user.shop?.active) {
      return res.status(400).json({
        success: false,
        message:
          "El vendedor todavia no completo su onboarding (datos y cuenta bancaria). No se puede aprobar la tienda.",
      });
    }

    user.shop = user.shop || {};
    user.shop.approved = approved;
    user.shop.approvedAt = new Date();
    user.shop.approvedBy = req.user._id;
    user.shop.approvalReason = approved ? "" : String(reason).trim();
    await user.save();

        let productsPaused = 0;
    if (!approved) {
      const r = await Product.updateMany(
        { seller: user._id, status: "active" },
        { $set: { status: "paused" } },
      );
      productsPaused = r.modifiedCount || 0;
    }

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin(approved ? "shop_approved" : "shop_disabled", {
      header: approved ? "✅ <b>Tienda aprobada</b>" : "🚫 <b>Tienda desactivada</b>",
      lines: [
        `${tgEsc(user.shop?.name || "")} · ${tgEsc(user.email || "")}`,
        !approved && reason ? `Motivo: ${tgEsc(String(reason).trim())}` : "",
        !approved ? `Publicaciones pausadas: ${productsPaused}` : "",
      ].filter(Boolean),
      data: { userId: user._id },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: approved
        ? "Tienda aprobada. El vendedor ya puede publicar productos de pago."
        : `Tienda desactivada. ${productsPaused} publicacion(es) pausada(s).`,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        shopApproved: user.shop.approved,
        shopApprovalReason: user.shop.approvalReason,
      },
      productsPaused,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al actualizar el estado de la tienda." });
  }
};

// MODERACIÃ“N DE PUBLICACIONES (aprobaciÃ³n manual por admin)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Flujo: el vendedor publica â†’ el producto nace en moderation.status="pending"
// y NO aparece en el catÃ¡logo pÃºblico. El admin lo revisa y lo aprueba o
// rechaza (con motivo). Solo los "approved" (y status="active") son visibles.
//
// Estos endpoints NO tocan el `status` de venta (active/paused/...): la
// moderaciÃ³n es ortogonal. Un producto rechazado puede seguir "active" para
// el vendedor, pero no se muestra al pÃºblico.

// GET /api/admin/products?moderation=pending&search=&page=&limit=
// Lista publicaciones para revisar. Por defecto muestra las "pending".
// TambiÃ©n acepta moderation=approved | rejected | all para ver el historial.
export const adminGetProducts = async (req, res) => {
  try {
    const {
      moderation = "pending",
      search = "",
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // Filtro por estado de moderaciÃ³n (o todos si moderation === "all").
    const match = { status: { $ne: "deleted" } };
    if (moderation !== "all") {
      match["moderation.status"] = moderation;
    }

    // BÃºsqueda por nombre, marca o categorÃ­a.
    if (search) {
      const reg = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      match.$or = [{ name: reg }, { brand: reg }, { category: reg }];
    }

    const [products, total] = await Promise.all([
      Product.find(match)
        .populate("seller", "username firstName lastName email shop isVerified")
        .populate("moderation.reviewedBy", "username firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Product.countDocuments(match),
    ]);

    // Contadores por estado para el tablero del panel.
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      Product.countDocuments({ "moderation.status": "pending", status: { $ne: "deleted" } }),
      Product.countDocuments({ "moderation.status": "approved", status: { $ne: "deleted" } }),
      Product.countDocuments({ "moderation.status": "rejected", status: { $ne: "deleted" } }),
    ]);

    res.status(200).json({
      success: true,
      products,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al obtener las publicaciones" });
  }
};

// PATCH /api/admin/products/:id/moderate
// Body: { action: "approve" | "reject", reason? }
// Aprueba o rechaza una publicaciÃ³n. El motivo es obligatorio al rechazar.
export const adminModerateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason = "" } = req.body || {};

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "AcciÃ³n invÃ¡lida. UsÃ¡ 'approve' o 'reject'.",
      });
    }

    if (action === "reject" && !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: "El motivo de rechazo es obligatorio.",
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "PublicaciÃ³n no encontrada." });
    }

    const now = new Date();
    product.moderation = product.moderation || {};
    product.moderation.status = action === "approve" ? "approved" : "rejected";
    product.moderation.reason = action === "reject" ? String(reason).trim() : "";
    product.moderation.reviewedBy = req.user._id;
    product.moderation.reviewedAt = now;
    if (action === "approve") {
      product.moderation.approvedAt = now;
    }

        await product.save();

    await product.populate("seller", "username firstName lastName email shop isVerified");

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin(action === "approve" ? "product_approved" : "product_rejected", {
      header:
        action === "approve"
          ? "🟢 <b>Publicación aprobada</b>"
          : "🔴 <b>Publicación rechazada</b>",
      lines: [
        `${tgEsc(product.name || "")}`,
        `Vendedor: ${tgEsc(product.seller?.shop?.name || product.seller?.username || "")}`,
        action === "reject" ? `Motivo: ${tgEsc(String(reason).trim())}` : "",
      ].filter(Boolean),
      data: { productId: product._id },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message:
        action === "approve"
          ? "PublicaciÃ³n aprobada."
          : "PublicaciÃ³n rechazada.",
      product,
    });
  } catch (error) {
    console.log(error);
        res.status(500).json({ message: "Error al moderar la publicaciÃ³n" });
  }
};

// POST /api/admin/products/moderate-bulk
// Body (opciÃ³n A): { ids: [..], action: "approve"|"reject", reason? }
// Body (opciÃ³n B): { selectAll: true, moderation?: "pending"|..., search?, action, reason? }
//   â†’ aplica a TODOS los productos que matcheen el filtro (carga masiva).
//
// Aprueba/rechaza en bloque. Usa updateMany para que 2000 productos sean UNA
// operaciÃ³n en Mongo en vez de 2000 requests. Devuelve cuÃ¡ntos se modificaron.
export const adminModerateProductsBulk = async (req, res) => {
  try {
    const {
      ids,
      action,
      reason = "",
      selectAll = false,
      moderation,
      search = "",
    } = req.body || {};

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "AcciÃ³n invÃ¡lida. UsÃ¡ 'approve' o 'reject'.",
      });
    }

    if (action === "reject" && !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: "El motivo de rechazo es obligatorio.",
      });
    }

    // Construimos el filtro.
    const match = { status: { $ne: "deleted" } };

    if (selectAll) {
      // Modo "todo lo filtrado": respeta el tab + bÃºsqueda del panel.
      if (moderation && moderation !== "all") {
        match["moderation.status"] = moderation;
      }
      if (search) {
        const reg = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        match.$or = [{ name: reg }, { brand: reg }, { category: reg }];
      }
    } else {
      const idList = Array.isArray(ids) ? ids.filter(Boolean) : [];
      if (idList.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No se enviaron publicaciones para moderar.",
        });
      }
      match._id = { $in: idList };
    }

    const now = new Date();
    const update = {
      $set: {
        "moderation.status": action === "approve" ? "approved" : "rejected",
        "moderation.reason": action === "reject" ? String(reason).trim() : "",
        "moderation.reviewedBy": req.user._id,
        "moderation.reviewedAt": now,
      },
    };
    if (action === "approve") {
      update.$set["moderation.approvedAt"] = now;
    }

    const result = await Product.updateMany(match, update);

    // ── Espejo en TELEGRAM (solo admin) ──
    // El debounce del servicio agrupa: 50 aprobaciones en bloque = UN mensaje.
    const nBulk = result.modifiedCount || 0;
    if (nBulk > 0) {
      notifyAdmin(action === "approve" ? "product_approved" : "product_rejected", {
        header:
          action === "approve"
            ? "🟢 <b>Publicaciones aprobadas</b>"
            : "🔴 <b>Publicaciones rechazadas</b>",
        lines: [
          `${nBulk} publicación(es)${search ? ` (filtro: "${tgEsc(search)}")` : ""}`,
          action === "reject" ? `Motivo: ${tgEsc(String(reason).trim())}` : "",
        ].filter(Boolean),
        data: { modifiedCount: nBulk },
      }).catch(() => {});
    }


    // Contadores actualizados para que el panel refresque las pestaÃ±as.
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      Product.countDocuments({ "moderation.status": "pending", status: { $ne: "deleted" } }),
      Product.countDocuments({ "moderation.status": "approved", status: { $ne: "deleted" } }),
      Product.countDocuments({ "moderation.status": "rejected", status: { $ne: "deleted" } }),
    ]);

    res.status(200).json({
      success: true,
      message:
        action === "approve"
          ? `${result.modifiedCount} publicaciÃ³n(es) aprobada(s).`
          : `${result.modifiedCount} publicaciÃ³n(es) rechazada(s).`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al moderar las publicaciones" });
  }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /api/admin/stats
// Panel de estadÃ­sticas globales de Mercado Nero.
//
// Todo se calcula con agregaciones de Mongo sobre Order, Product y User.
// Las mÃ©tricas de dinero se basan en valores ya guardados por orden
// (financials.*), para que sean auditables y no dependan de configs que
// cambien con el tiempo.
//
// Criterios:
//   - "Ã“rdenes completadas": status === "completed".
//   - "Ã“rdenes abiertas": status en estados activos (ni completada,
//     ni cancelada, ni expirada).
//   - GMV ARS = suma de totalAmount (ARS) de Ã³rdenes COMPLETADAS.
//   - GMV USD = suma de financials.totalUsd (subtotal productos) de
//     COMPLETADAS. Se separa en "crypto" (payment.method === "crypto")
//     vs "transferencia" (el resto).
//   - Ganancia BRUTA = suma de financials.baseFeeUsd (comisiÃ³n 3%).
//   - Reintegros = cashback.earnedUsd (sale de la plataforma).
//   - Ganancia NETA = bruta - cashback.
//
//   NOTA: el reward de referidos (financials.referralFeeUsd) NO se resta de la
//   ganancia. Se descuenta del VENDEDOR on-chain (va sumado al fee) y la
//   plataforma lo recibe en su wallet y lo reparte a los referidos; es un
//   pass-through, no plata propia.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export const getStats = async (req, res) => {
  try {
    const OPEN_STATUSES = [
      "awaiting_collateral",
      "pending_payment",
      "verifying_payment",
      "paid",
      "shipped",
    ];
    const COMPLETED = "completed";

    // MÃ©tricas de dinero y conteos sobre Ã³rdenes (una sola pasada con $facet).
    const [ordersAgg] = await Order.aggregate([
      {
        $facet: {
          statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          completed: [{ $match: { status: COMPLETED } }, { $count: "count" }],
          open: [{ $match: { status: { $in: OPEN_STATUSES } } }, { $count: "count" }],
          disputes: [
            { $match: { "dispute.exists": true, "dispute.status": "open" } },
            { $count: "count" },
          ],
          money: [
            { $match: { status: COMPLETED } },
            {
              $group: {
                _id: null,
                gmvArs: { $sum: "$totalAmount" },
                gmvUsd: { $sum: "$financials.totalUsd" },
                gmvUsdCrypto: {
                  $sum: {
                    $cond: [
                      { $eq: ["$payment.method", "crypto"] },
                      "$financials.totalUsd",
                      0,
                    ],
                  },
                },
                gmvArsCrypto: {
                  $sum: {
                    $cond: [
                      { $eq: ["$payment.method", "crypto"] },
                      "$totalAmount",
                      0,
                    ],
                  },
                },
                feeGrossUsd: { $sum: "$financials.baseFeeUsd" },
                platformFeeUsd: { $sum: "$financials.platformFeeUsd" },
                referralFeeUsd: { $sum: "$financials.referralFeeUsd" },
                cashbackUsd: { $sum: "$cashback.earnedUsd" },
              },
            },
          ],
        },
      },
    ]);

    // Ã“rdenes por mÃ©todo de pago (completadas).
    const paymentMethodAgg = await Order.aggregate([
      { $match: { status: COMPLETED } },
      {
        $group: {
          _id: { $ifNull: ["$payment.method", "bank_transfer"] },
          count: { $sum: 1 },
          gmvUsd: { $sum: "$financials.totalUsd" },
        },
      },
    ]);

    // Top 5 vendedores por GMV (completadas).
    const topSellersAgg = await Order.aggregate([
      { $match: { status: COMPLETED } },
      {
        $group: {
          _id: "$seller",
          gmvUsd: { $sum: "$financials.totalUsd" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { gmvUsd: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "seller",
        },
      },
      {
        $project: {
          _id: 0,
          sellerId: "$_id",
          gmvUsd: 1,
          orders: 1,
          name: {
            $ifNull: [
              { $arrayElemAt: ["$seller.shop.name", 0] },
              { $ifNull: [{ $arrayElemAt: ["$seller.username", 0] }, "â€”"] },
            ],
          },
        },
      },
    ]);

    // Top 5 categorÃ­as por unidades vendidas (completadas).
    const topCategoriesAgg = await Order.aggregate([
      { $match: { status: COMPLETED } },
      { $unwind: "$itemsSnapshot" },
      {
        $group: {
          _id: { $ifNull: ["$itemsSnapshot.category", "Sin categorÃ­a"] },
          gmvUsd: {
            $sum: {
              $multiply: [
                { $ifNull: ["$itemsSnapshot.price", 0] },
                { $ifNull: ["$itemsSnapshot.quantity", 1] },
              ],
            },
          },
          units: { $sum: { $ifNull: ["$itemsSnapshot.quantity", 1] } },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]);

    // Productos: conteos por estado + suma de vistas/ventas.
    const productsAgg = await Product.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          views: { $sum: { $ifNull: ["$views", 0] } },
          sold: { $sum: { $ifNull: ["$sold", 0] } },
        },
      },
    ]);

    // Top 5 productos mÃ¡s vistos.
    const topViewedAgg = await Product.find({ status: { $ne: "deleted" } })
      .sort({ views: -1 })
      .limit(5)
      .select("name views sold _id");

    // Usuarios.
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalSellers,
      newUsers30d,
      newUsersMonth,
      restrictedUsers,
      cashbackBalanceAgg,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ "shop.active": true }),
      User.countDocuments({ createdAt: { $gte: start30d } }),
      User.countDocuments({ createdAt: { $gte: startMonth } }),
      User.countDocuments({ "accounting.restricted": true }),
      User.aggregate([
        {
          $group: {
            _id: null,
            balance: { $sum: "$cashback.balance" },
            earned: { $sum: "$cashback.earned" },
          },
        },
      ]),
    ]);

    // NormalizaciÃ³n.
    const statusMap = {};
    for (const s of ordersAgg?.statusCounts || []) {
      statusMap[s._id] = s.count;
    }

    const money = ordersAgg?.money?.[0] || {};
    const gmvArs = money.gmvArs || 0;
    const gmvUsd = money.gmvUsd || 0;
    const gmvUsdCrypto = money.gmvUsdCrypto || 0;
    const gmvUsdTransfer = gmvUsd - gmvUsdCrypto;

        const feeGrossUsd = money.feeGrossUsd || 0; // 3% bruto (tu comisiÃ³n)
    const cashbackUsd = money.cashbackUsd || 0; // reintegro cashback (sale de tu bolsillo)
    const referralFeeUsd = money.referralFeeUsd || 0; // pass-through a referidos (lo paga el vendedor)
    // Ganancia neta: solo se resta el cashback. El reward de referidos NO es un
    // costo de la plataforma (lo cubre el vendedor), por eso no se descuenta.
    const feeNetUsd = feeGrossUsd - cashbackUsd;

    const completedCount = ordersAgg?.completed?.[0]?.count || 0;
    const openCount = ordersAgg?.open?.[0]?.count || 0;
    const disputesOpen = ordersAgg?.disputes?.[0]?.count || 0;

    let productsActive = 0;
    let productsPaused = 0;
    let productsOutOfStock = 0;
    let productsDeleted = 0;
    let totalViews = 0;
    let totalProductSold = 0;
    for (const p of productsAgg) {
      if (p._id === "active") productsActive = p.count;
      else if (p._id === "paused") productsPaused = p.count;
      else if (p._id === "out_of_stock") productsOutOfStock = p.count;
      else if (p._id === "deleted") productsDeleted = p.count;
      totalViews += p.views || 0;
      totalProductSold += p.sold || 0;
    }
    const totalProducts =
      productsActive + productsPaused + productsOutOfStock + productsDeleted;

        const avgTicketUsd = completedCount > 0 ? gmvUsd / completedCount : 0;
    const closedCount =
      completedCount + (statusMap.cancelled || 0) + (statusMap.expired || 0);
    const completionRate =
      closedCount > 0 ? (completedCount / closedCount) * 100 : 0;

    // Margen efectivo: quÃ© % del GMV en USD termina siendo ganancia neta.
    // Con la polÃ­tica actual (3% fee - 2.5% cashback) ronda el 0.5%.
    const effectiveMarginPct = gmvUsd > 0 ? (feeNetUsd / gmvUsd) * 100 : 0;

        res.status(200).json({
          success: true,
          stats: {
        orders: {
          total: Object.values(statusMap).reduce((a, b) => a + b, 0),
          completed: completedCount,
          open: openCount,
          cancelled: statusMap.cancelled || 0,
          expired: statusMap.expired || 0,
          disputesOpen,
          byStatus: statusMap,
        },
        gmv: {
          ars: Math.round(gmvArs),
          usd: Math.round(gmvUsd * 100) / 100,
          usdCrypto: Math.round(gmvUsdCrypto * 100) / 100,
          usdTransfer: Math.round(gmvUsdTransfer * 100) / 100,
          arsCrypto: Math.round(money.gmvArsCrypto || 0),
        },
        revenue: {
          feeGrossUsd: Math.round(feeGrossUsd * 100) / 100,
          cashbackUsd: Math.round(cashbackUsd * 100) / 100,
          referralFeeUsd: Math.round(referralFeeUsd * 100) / 100,
          feeNetUsd: Math.round(feeNetUsd * 100) / 100,
          platformFeeUsd: Math.round((money.platformFeeUsd || 0) * 100) / 100,
        },
        products: {
          total: totalProducts,
          active: productsActive,
          paused: productsPaused,
          outOfStock: productsOutOfStock,
          views: totalViews,
          sold: totalProductSold,
        },
        users: {
          total: totalUsers,
          sellers: totalSellers,
          newLast30d: newUsers30d,
          newThisMonth: newUsersMonth,
          restricted: restrictedUsers,
          cashbackBalanceUsd:
            Math.round((cashbackBalanceAgg?.[0]?.balance || 0) * 100) / 100,
          cashbackEarnedUsd:
            Math.round((cashbackBalanceAgg?.[0]?.earned || 0) * 100) / 100,
        },
                averages: {
          avgTicketUsd: Math.round(avgTicketUsd * 100) / 100,
          completionRate: Math.round(completionRate * 10) / 10,
          effectiveMarginPct: Math.round(effectiveMarginPct * 100) / 100,
        },
        paymentMethods: paymentMethodAgg.map((p) => ({
          method: p._id,
          count: p.count,
          gmvUsd: Math.round(p.gmvUsd * 100) / 100,
        })),
        topSellers: topSellersAgg.map((s) => ({
          sellerId: s.sellerId,
          name: s.name || "â€”",
          orders: s.orders,
          gmvUsd: Math.round(s.gmvUsd * 100) / 100,
        })),
        topCategories: topCategoriesAgg.map((c) => ({
          category: c._id,
          units: c.units,
          gmvUsd: Math.round(c.gmvUsd * 100) / 100,
        })),
        topProducts: topViewedAgg.map((p) => ({
          _id: p._id,
          name: p.name,
          views: p.views || 0,
          sold: p.sold || 0,
        })),
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error al obtener las estadÃ­sticas" });
  }
};

// --------------------------------------------------------------------
// GET /api/admin/collateral/audit
// Auditorï¿½a del colateral de vendedores: contrasta la DB con la blockchain
// y devuelve las ï¿½rdenes que requieren acciï¿½n del admin (liberar garantï¿½a,
// completar tras el buffer o reconciliar la DB).
//
// Query:
//   ?since=<dï¿½as | ISO date>  Ventana de antigï¿½edad de las ï¿½rdenes (default 60).
//   ?attention=true           Devuelve SOLO las que requieren atenciï¿½n.
//
// Respuesta: { summary, since, count, orders }. Es de SOLO LECTURA: no mueve
// fondos. El admin acciona luego con los endpoints existentes
// (release-guarantee / complete).
// --------------------------------------------------------------------
export const auditCollateralHandler = async (req, res) => {
  try {
    const { since, attention } = req.query;

    // Aceptamos "since" como nï¿½mero de dï¿½as o como fecha ISO.
    let sinceDate;
    if (since && Number.isFinite(Number(since))) {
      sinceDate = new Date(Date.now() - Number(since) * 24 * 60 * 60 * 1000);
    } else if (since) {
      const parsed = new Date(since);
      sinceDate = Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    const { since: sinceDateUsed, orders } = await auditCollateral({
      since: sinceDate,
    });

    const onlyAttention = String(attention || "").toLowerCase() === "true";
    const visible = onlyAttention
      ? orders.filter((o) => o.needsAttention)
      : orders;

    res.status(200).json({
      success: true,
      since: sinceDateUsed,
      count: visible.length,
      summary: summarizeAudit(visible),
      orders: visible,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ success: false, message: "Error al auditar el colateral." });
  }
};
