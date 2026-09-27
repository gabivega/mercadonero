/**
 * poolAdapter.js
 * ──────────────────────────────────────────────────────────────────────
 * Convierte un Pool del BACKEND (shape anidado) al shape "plano" que ya
 * consumen `PoolCard` y `ComprasGrupales`.
 *
 * Backend (Pool):
 *   { _id, product: {...}, seller: {...}, members: [...], targetBuyers,
 *     expiresAt, status: "open"|"filled"|"expired"|"cancelled",
 *     currentUnitPrice, targetUnitPrice, baseUnitPrice }
 *
 * Front (shape de PoolCard):
 *   { id, title, brand, seller, location, price, image, current, goal,
 *     status: "activo"|"completado"|"expirado"|"cancelado", freeShipping,
 *     expiresAt, unitPrice, targetUnitPrice, _raw }
 * ──────────────────────────────────────────────────────────────────────
 */

const PLACEHOLDER =
  "https://placehold.co/400x300/f3f4f6/9ca3af?text=Pool";

// Mapa backend → front (estados en español que usa PoolCard).
const STATUS_MAP = {
  open: "activo",
  filled: "completado",
  expired: "expirado",
  cancelled: "cancelado",
};

/**
 * Convierte un pool del backend al shape plano del front.
 * @param {object} pool  pool del backend (idealmente con `product` poblado)
 */
export function adaptPool(pool) {
  if (!pool) return null;

  const product =
    pool.product && typeof pool.product === "object" ? pool.product : null;

  const images = product?.images || [];
  const mainImage =
    images.find?.((i) => i?.isMain)?.url || images[0]?.url || PLACEHOLDER;

  const current = pool.members?.length || 0;
  const goal = pool.targetBuyers || 5;

  const sellerName =
    pool.seller?.shop?.name ||
    pool.seller?.username ||
    product?.sellerName ||
    "Vendedor";

  const location =
    [product?.location?.city, product?.location?.province]
      .filter(Boolean)
      .join(", ") || "—";

  return {
    // Identidad
    id: pool._id,
    // Contenido de la card
    title: product?.name || "Producto",
    brand: product?.brand || "Genérico",
    seller: sellerName,
    location,
    price: pool.currentUnitPrice || product?.price || 0,
    image: mainImage,
    current,
    goal,
    status: STATUS_MAP[pool.status] || "activo",
    freeShipping: !!product?.shipping?.free,
    expiresAt: pool.expiresAt,
    // Extras útiles
    unitPrice: pool.currentUnitPrice,
    targetUnitPrice: pool.targetUnitPrice,
    baseUnitPrice: pool.baseUnitPrice,
    // Pool crudo del backend (por si se necesita en el detalle)
    _raw: pool,
  };
}

/** Adapta una lista de pools del backend. */
export function adaptPools(pools = []) {
  return (Array.isArray(pools) ? pools : []).map(adaptPool).filter(Boolean);
}

export default adaptPool;
