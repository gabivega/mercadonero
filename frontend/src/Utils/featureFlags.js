// frontend/src/Utils/featureFlags.js
//
// Flags de funcionalidades. Sirven para prender/apagar features sin tocar la
// lógica repartida por todo el código (un solo lugar de verdad).
//
// SOCIAL_SELLING_ENABLED:
//   Compra en grupo / "Social Selling". Se deja APAGADO para el lanzamiento
//   hasta definir el manejo de envío por grupo. El backend y el modelo de datos
//   ya están listos; al reactivar esto, la sección y las rutas vuelven solas.
export const SOCIAL_SELLING_ENABLED = false;
