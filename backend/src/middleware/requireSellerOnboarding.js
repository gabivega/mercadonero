import User from "../models/User.js";

/**
 * Middleware que SIEMPRE aplica a la creación de publicaciones, tanto single
 * como masiva (bulk).
 *
 * Lógica (MVP):
 *  - Si la publicación es de pago / envolucra escrow (listingType === 'product'),
 *    el vendedor DEBE haber completado el onboarding vendedor (shop.active === true).
 *    Si no, rechazamos con 403 para que no se pueda hacer bypass por API.
 *  - Si es un clasificado (listingType !== 'product'), NO exigimos onboarding
 *    vendedor completo (no interviene el pago). Todo lo demás se resuelve
 *    igual que el checkout (datos básicos), pero eso no bloquea la creación.
 *
 * AddOn futuro: las cuentas verificadas premium podrán activar validaciones
 * más exigentes (titularidad bancaria real), que van en el completion (KYC).
 */
export default async function requireSellerOnboarding(req, res, next) {
  try {
    // 1. Determinar qué listingType intenta publicar.
    //    - En single: viene req.body.listingType.
    //    - En bulk: son TODOS productos de pago (listingType 'product').
    const isBulk = Boolean(req.body?.products);
    let listingType = req.body?.listingType;

    if (isBulk) {
      listingType = "product"; // la carga masiva siempre es de productos de pago
    }

    // 1b. Si no pudimos determinar el tipo, no bloqueamos de forma estricta
    //     (lo validará el controller con la lógica normal). Protegemos solo
    //     cuando sabemos que es un producto de pago.
    if (listingType !== "product") {
      return next();
    }

    // 2. Comprobar el onboarding vendedor del usuario autenticado.
    //    La fuente de verdad de cuentas bancarias es user.bankAccounts (el
    //    perfil), no shop.bankAccounts. Se mantiene shop como fallback de
    //    migración para vendedores antiguos.
    const user = await User.findById(req.user._id).select(
      "shop.active bankAccounts shop.bankAccounts walletAddress",
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    const shopActive = Boolean(user.shop?.active);
    const hasBankAccount =
      Array.isArray(user.bankAccounts) && user.bankAccounts.length > 0;
    const hasLegacyShopBank =
      Array.isArray(user.shop?.bankAccounts) && user.shop.bankAccounts.length > 0;

    if (!shopActive || (!hasBankAccount && !hasLegacyShopBank)) {
      return res.status(403).json({
        success: false,
        blocked: "onboarding",
        message:
          "Para poder publicar necesitamos que completes algunos datos. No compartiremos tus datos con nadie, ofrecemos una plataforma segura para todos los usuarios.",
      });
    }

    // 3. WALLET WEB3: el vendedor debe tener una wallet vinculada. La garantía
    //    (colateral) se gestiona on-chain con la wallet del vendedor, y sin ella
    //    el comprador no puede finalizar la compra. Lo exigimos ANTES de publicar
    //    para evitar el error "El vendedor no tiene una wallet válida".
    if (!user.walletAddress) {
      return res.status(403).json({
        success: false,
        blocked: "wallet",
        message:
          "Para publicar y recibir pagos necesitás tener una wallet Web3 vinculada. Creá o conectá tu billetera desde 'Mi Billetera' y volvé a intentar.",
      });
    }

    next();
  } catch (error) {
    console.error("Error en requireSellerOnboarding:", error);
    res.status(500).json({ success: false, message: "Error interno al verificar el onboarding." });
  }
}
