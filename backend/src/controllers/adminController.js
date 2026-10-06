// controllers/adminController.js

import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/Product.js';

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
    }));

    res.status(200).json({ success: true, orders: data });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Error al obtener las órdenes" });
  }
};

// GET /api/admin/users
// Lista los usuarios con búsqueda, ordenamiento y paginación (server-side).
// Los conteos de ventas/compras se calculan desde la colección Order (siempre al día).
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

    // Filtro de búsqueda (email, privyDid, username, nombre)
    const match = {};
    if (search) {
      const reg = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      match.$or = [
        { email: reg },
        { privyDid: reg },
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
          privyDid: 1,
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

// ════════════════════════════════════════════════════════════════════
// GET /api/admin/stats
// Panel de estadísticas globales de Mercado Nero.
//
// Todo se calcula con agregaciones de Mongo sobre Order, Product y User.
// Las métricas de dinero se basan en valores ya guardados por orden
// (financials.*), para que sean auditables y no dependan de configs que
// cambien con el tiempo.
//
// Criterios:
//   - "Órdenes completadas": status === "completed".
//   - "Órdenes abiertas": status en estados activos (ni completada,
//     ni cancelada, ni expirada).
//   - GMV ARS = suma de totalAmount (ARS) de órdenes COMPLETADAS.
//   - GMV USD = suma de financials.totalUsd (subtotal productos) de
//     COMPLETADAS. Se separa en "crypto" (payment.method === "crypto")
//     vs "transferencia" (el resto).
//   - Ganancia BRUTA = suma de financials.baseFeeUsd (comisión 3%).
//   - Reintegros = cashback.earnedUsd (sale de la plataforma).
//   - Ganancia NETA = bruta - cashback.
//
//   NOTA: el reward de referidos (financials.referralFeeUsd) NO se resta de la
//   ganancia. Se descuenta del VENDEDOR on-chain (va sumado al fee) y la
//   plataforma lo recibe en su wallet y lo reparte a los referidos; es un
//   pass-through, no plata propia.
// ════════════════════════════════════════════════════════════════════
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

    // Métricas de dinero y conteos sobre órdenes (una sola pasada con $facet).
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

    // Órdenes por método de pago (completadas).
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
              { $ifNull: [{ $arrayElemAt: ["$seller.username", 0] }, "—"] },
            ],
          },
        },
      },
    ]);

    // Top 5 categorías por unidades vendidas (completadas).
    const topCategoriesAgg = await Order.aggregate([
      { $match: { status: COMPLETED } },
      { $unwind: "$itemsSnapshot" },
      {
        $group: {
          _id: { $ifNull: ["$itemsSnapshot.category", "Sin categoría"] },
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

    // Top 5 productos más vistos.
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

    // Normalización.
    const statusMap = {};
    for (const s of ordersAgg?.statusCounts || []) {
      statusMap[s._id] = s.count;
    }

    const money = ordersAgg?.money?.[0] || {};
    const gmvArs = money.gmvArs || 0;
    const gmvUsd = money.gmvUsd || 0;
    const gmvUsdCrypto = money.gmvUsdCrypto || 0;
    const gmvUsdTransfer = gmvUsd - gmvUsdCrypto;

        const feeGrossUsd = money.feeGrossUsd || 0; // 3% bruto (tu comisión)
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

    // Margen efectivo: qué % del GMV en USD termina siendo ganancia neta.
    // Con la política actual (3% fee - 2.5% cashback) ronda el 0.5%.
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
          name: s.name || "—",
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
    res.status(500).json({ message: "Error al obtener las estadísticas" });
  }
};
