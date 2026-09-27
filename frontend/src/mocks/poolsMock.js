/**
 * poolsMock.js
 * ──────────────────────────────────────────────────────────────────────
 * Datos mock para el feature de Social Selling (compra en grupo).
 * Reemplazar por llamadas reales a la API cuando el back esté listo.
 *
 * Shapes alineados al modelo previsto en el backend (Pool):
 *   - _id, product, seller, creator
 *   - members: [{ _id, username, avatar, joinedAt }]
 *   - targetBuyers (default 5)
 *   - expiresAt (ISO)
 *   - status: "open" | "filled" | "expired" | "completed"
 * ──────────────────────────────────────────────────────────────────────
 */

// Genera fechas de expiración relativas a "ahora" para que el countdown
// se vea vivo en el mock.
const hoursFromNow = (h) =>
  new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

const avatars = {
  a: "https://i.pravatar.cc/100?img=11",
  b: "https://i.pravatar.cc/100?img=25",
  c: "https://i.pravatar.cc/100?img=32",
  d: "https://i.pravatar.cc/100?img=47",
  e: "https://i.pravatar.cc/100?img=58",
};

/**
 * Devuelve pools mock para un producto dado.
 * @param {string} productId
 * @param {{ tiers?: Record<number, number> }} opts
 */
export function getMockPools(productId, opts = {}) {
  const t = opts.tiers || { 2: 90000, 3: 85000, 4: 80000, 5: 75000 };

  return [
    {
      _id: "pool_001",
      product: productId,
      seller: "seller_001",
      creator: { _id: "u_001", username: "juanperez", avatar: avatars.a },
      members: [
        { _id: "u_001", username: "juanperez", avatar: avatars.a, joinedAt: hoursFromNow(-5) },
        { _id: "u_002", username: "maria_86", avatar: avatars.b, joinedAt: hoursFromNow(-3) },
        { _id: "u_003", username: "tomi", avatar: avatars.c, joinedAt: hoursFromNow(-1) },
      ],
      targetBuyers: 5,
      expiresAt: hoursFromNow(18),
      status: "open",
      // precio objetivo si se llena (tier de 5)
      targetUnitPrice: t[5],
      currentUnitPrice: t[3],
    },
    {
      _id: "pool_002",
      product: productId,
      seller: "seller_001",
      creator: { _id: "u_004", username: "lu_estrada", avatar: avatars.d },
      members: [
        { _id: "u_004", username: "lu_estrada", avatar: avatars.d, joinedAt: hoursFromNow(-2) },
        { _id: "u_005", username: "nico", avatar: avatars.e, joinedAt: hoursFromNow(-1) },
      ],
      targetBuyers: 5,
      expiresAt: hoursFromNow(40),
      status: "open",
      targetUnitPrice: t[5],
      currentUnitPrice: t[2],
    },
  ];
}

/**
 * Devuelve un pool mock por id (para la página de detalle / deep-link).
 * Incluye el producto "poblado" mínimo para poder renderizar la card de
 * producto en la página del pool.
 *
 * @param {string} poolId
 */
export function getMockPoolById(poolId) {
  // Buscamos en los pools conocidos de cualquier producto.
  const all = [...getMockPools("demo-1"), ...getMockPools("demo-2")];
  const found = all.find((p) => p._id === poolId);

  // Pool "genérico" para ids creados desde el mock del ProductDetail
  // (ej: pool_new_...) y que no persisten entre recargas.
  const base =
    found ||
    ({
      ...all[0],
      _id: poolId,
    });

  return {
    ...base,
    // Producto asociado (mock). En el back vendrá poblado desde la ordenanza.
    productData: {
      _id: base.product,
      name: "[Producto del pool]",
      price: 100000,
      currency: "ARS",
      images: [],
      socialSelling: {
        enabled: true,
        durationHours: 48,
        tiers: { 2: 90000, 3: 85000, 4: 80000, 5: 75000 },
      },
    },
  };
}

export default { getMockPools, getMockPoolById };
