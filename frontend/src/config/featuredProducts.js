// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTOS DESTACADOS DEL HOME — LISTA MANUAL
// ═══════════════════════════════════════════════════════════════════════════
// Pegá acá los IDs (_id de Mongo) de los productos que querés en el carousel
// de arriba del Home. El ORDEN de la lista es el orden en que salen.
//
// ¿De dónde saco el ID?
//   - Desde la URL del producto: /producto/<slug>-<sufijo> NO sirve como id.
//   - Lo más fácil: abrir el producto en el panel /publicaciones o /admin y
//     copiar el `_id`, o pegarlo desde la DB.
//
// ⚠️ IMPORTANTE: no es una puerta trasera. Si un id de esta lista corresponde a
// un producto pausado, pendiente de moderación, eliminado, o de un vendedor con
// la tienda desactivada o sin wallet, NO se muestra (se descarta en el backend
// con la misma regla que el catálogo público). Es decir: destacar no revive
// algo invisible, solo le da prioridad a algo que ya se ve.
//
// Cuando la monetización madure, esto se reemplaza por un flag `featured` en el
// modelo Product y el Home no cambia (misma interface de respuesta).

export const featuredProductIds = [
  '6b00b9b5f30fcac0884b7352',
  '6b00b9d2f30fcac0884b7e5d',
  '6b00b9cdf30fcac0884b7cac',
  '6b00b9aaf30fcac0884b6f1c',
  '6b00b9b3f30fcac0884b7299',
  '6b00b9caf30fcac0884b7b83',
  '6b00b9d7f30fcac0884b800c',
  '6b00b9a5f30fcac0884b6cb1',
  '6b00b988f30fcac0884b60f3',
  '6b00b9e7f30fcac0884b854a',
  '6b00b9b2f30fcac0884b7240',
  '6b00b9b1f30fcac0884b71c9',
  '6b00b9b5f30fcac0884b7389',
  '6b00b9d3f30fcac0884b7e9f'
];

// Cantidad máxima a mostrar en el carousel. Si hay menos IDs, muestra menos.
export const FEATURED_LIMIT = 12;
