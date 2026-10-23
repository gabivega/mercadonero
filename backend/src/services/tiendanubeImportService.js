import Product from '../models/Product.js';
import User from '../models/User.js';
import { tiendanubeToProduct } from './tiendanubeAdapter.js';
// import { v2 as cloudinary } from 'cloudinary'; // ← para la estrategia futura

// ─────────────────────────────────────────────────────────────────────────────
// Import helper COMPARTIDO para las conexiones de usuario (StoreConnection).
//
// Centraliza "crear producto desde un item de Tiendanube" para no duplicar la
// lógica entre import individual, masivo y sync.
//
// ── ESTRATEGIA DE IMÁGENES (MVP) ──
// IMAGE_STRATEGY = 'hotlink'  → guardamos la URL original (acdn...), 1 imagen.
// IMAGE_STRATEGY = 'cloudinary' → (futuro) la copiamos y guardamos la URL de
//                                 Cloudinary. Función `uploadImageToCloudinary`
//                                 ya dejada lista (comentada más abajo).
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_STRATEGY = 'hotlink'; // 'hotlink' | 'cloudinary'

/**
 * (FUTURO / PREMIUM) Sube una imagen remota a Cloudinary y devuelve la URL
 * segura. Requiere configurar CLOUDINARY_URL en el entorno.
 * NO se usa por ahora (estrategia 'hotlink'); queda pronta para enchufar.
 *
 * @param {string} imageUrl
 * @param {string} folder
 * @returns {Promise<string>}
 */
// async function uploadImageToCloudinary(imageUrl, folder = 'mercado-nero/tiendanube') {
//   const res = await cloudinary.uploader.upload(imageUrl, {
//     folder,
//     resource_type: 'image',
//   });
//   return res.secure_url;
// }

/**
 * Resuelve la imagen (una sola) según la estrategia configurada.
 * @param {string} imageUrl
 * @returns {Promise<string>}
 */
async function resolveImage(imageUrl) {
  if (!imageUrl) return '';
  if (IMAGE_STRATEGY === 'cloudinary') {
    // try { return await uploadImageToCloudinary(imageUrl); } catch { return imageUrl; }
    return imageUrl; // fallback mientras no esté habilitado
  }
  return imageUrl; // hotlink
}

/**
 * Arma el `providerRef` para trazabilidad + sync.
 * Incluye `domain` para saber a qué tienda re-sincronizar sin ambigüedad.
 *
 * @param {Object} item           Producto normalizado de Tiendanube.
 * @param {Object} connection     StoreConnection.
 * @returns {Object}
 */
export function buildProviderRef(item, connection) {
  const hasSale =
    item.onSale && Number(item.listPrice) > Number(item.price) && Number(item.price) > 0;
  return {
    provider: 'tiendanube',
    id: Number(item.id) || null,
    codigo_producto: item.sku || '',
    codigo_alfa: '',
    costPvpArs: Number(item.price) || 0,
    // Guardamos el precio de lista para poder distinguir oferta en el sync.
    listPriceArs: hasSale ? Number(item.listPrice) : 0,
    sourceUrl: item.permalink || item.url || '',
    storeName: connection?.domain || '',
    domain: connection?.domain || '',
    connectionId: connection?._id ? String(connection._id) : '',
    lastSyncAt: new Date(),
  };
}

/**
 * Crea (o actualiza si `existing` se pasa) un producto a partir de un item de
 * Tiendanube, para la tienda de `userId`.
 *
 * @param {Object} params
 * @param {Object} params.item         Item normalizado de Tiendanube.
 * @param {Object} params.connection   StoreConnection.
 * @param {Object} params.userProfile  Doc del User (con shop/addresses/isVerified).
 * @param {Object} [params.existing]   Product existente (para sync/update).
 * @returns {Promise<Object>} El producto guardado.
 */
export async function upsertProductFromTiendanube({ item, connection, userProfile, existing = null }) {
  // 1 sola imagen (hotlink).
  const rawImage = item.images?.[0]?.src || '';
  if (!rawImage) {
    const err = new Error('El producto no tiene imágenes.');
    err.code = 'NO_IMAGE';
    throw err;
  }
  const finalImage = await resolveImage(rawImage);
  const images = [{ url: finalImage, isMain: true }];

  const shopLocation = userProfile?.shop?.location || {};
  const defaultAddress =
    userProfile?.addresses?.find((a) => a.isDefault) || userProfile?.addresses?.[0] || {};
  const sellerLocation = {
    city: shopLocation.city || defaultAddress.city || '',
    province: shopLocation.province || defaultAddress.province || '',
  };

  const mapped = tiendanubeToProduct(item, { images });
  const providerRef = buildProviderRef(item, connection);

  if (existing) {
    // Update (usado por SYNC): sólo actualizamos campos volátiles.
    existing.price = mapped.price;
    existing.sale = mapped.sale;
    existing.stock = mapped.stock;
    existing.images = images; // refresca la imagen principal (hotlink puede cambiar)
    existing.providerRef = { ...(existing.providerRef?.toObject?.() || existing.providerRef || {}), ...providerRef };
    return existing.save();
  }

  // Create.
  const newProduct = new Product({
    ...mapped,
    seller: userProfile._id,
    sellerName: userProfile?.shop?.name || userProfile?.username,
    sellerIsVerified: userProfile?.isVerified || false,
    location: sellerLocation,
    status: 'active',
    providerRef,
  });

  const saved = await newProduct.save();
  await User.findByIdAndUpdate(userProfile._id, { $push: { products: saved._id } });
  return saved;
}
