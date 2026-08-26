// controllers/adminController.js

import Order from '../models/Order.js';
import User from '../models/User.js';

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
