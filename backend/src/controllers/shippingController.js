// controllers/shippingController.js
import {
  quoteShipment,
  zipnovaConfigStatus,
} from "../services/zipnovaService.js";

/**
 * GET /api/shipping/zipnova/status
 * Chequeo rápido de configuración (NO expone las credenciales, solo si faltan).
 */
export const getZipnovaStatus = async (_req, res) => {
  const status = zipnovaConfigStatus();
  res.status(200).json({
    success: true,
    provider: "zipnova",
    configured: status.ok,
    missing: status.missing,
    base: status.base,
  });
};

/**
 * POST /api/shipping/quote
 * Cotiza un envío. El body es el payload de Zipnova (parcialmente configurable);
 * el backend completa account_id/origin_id/source desde el .env si no vienen.
 *
 * body: { declared_value, destination, items | packages,
 *         type_packaging?, logistic_type?, service_type?, sort_by?,
 *         avoid_rules?, include_dropoff_points?, origin_id?, account_id?, source? }
 */
export const quoteShipping = async (req, res) => {
  try {
    const result = await quoteShipment(req.body || {});

    if (!result.success) {
      // Si Zipnova devolvió un detalle de validación (Laravel `details.errors`),
      // lo exponemos para que el front pueda mostrar el motivo real.
      const details =
        result.details ||
        result.data?.details ||
        null;

      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        details,
      });
    }

    res.status(200).json({
      success: true,
      request: result.request,
      quote: result.data,
    });
  } catch (error) {
    console.error("Error en quoteShipping:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
