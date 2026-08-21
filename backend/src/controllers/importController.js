import Product from "../models/Product.js";
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import {
  scrapeMercadoLibreProduct,
  httpErrorStatus,
} from "../services/mercadoLibreScraper.js";

const MAX_IMAGES_PER_PRODUCT = 3;

/**
 * Sube una imagen remota (URL de ML) a Cloudinary y devuelve su URL segura.
 */
const uploadImageToCloudinary = async (imageUrl, isMain) => {
  const result = await cloudinary.uploader.upload(imageUrl, {
    folder: "mercado-nero/products",
    resource_type: "image",
  });
  return { url: result.secure_url, isMain };
};

/**
 * POST /api/product/import-mercadolibre
 * CARGA MASIVA DESHABILITADA (temporalmente).
 * El scraping/API de Mercado Libre está sujeto a bloqueos y políticas de
 * seguridad que hacen el feature inestable. Se desactiva hasta definir
 * una solución (Puppeteer/servicio separado/API oficial con acceso).
 */
export const importFromMercadoLibre = async (req, res) => {
  return res.status(501).json({
        success: false,
    code: "IMPORT_DISABLED",
          message:
      "La importación desde Mercado Libre está temporalmente deshabilitada. " +
      "Estamos trabajando para habilitarla nuevamente. Disculpá las molestias.",
        });
    };

