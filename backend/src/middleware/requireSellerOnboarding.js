import User from "../models/User.js";

/**
 * Middleware que SIEMPRE aplica a la creación de publicaciones, tanto single
 * como masiva (bulk).
 *
 * Lógica (WAITING LIST / MVP de tiendas invitadas):
 *  - TODA publicación (productos de pago Y clasificados) exige que el vendedor
 *    haya completado el onboarding (shop.active === true) y que su tienda esté
 *    APROBADA por un admin (shop.approved === true). Mientras la tienda esté en
 *    lista de espera (active && !approved) se rechaza con blocked:"approval".
 *  - El onboarding YA NO exige cuenta bancaria: se administra desde el perfil.
 *  - Los productos de pago (listingType 'product') además exigen wallet Web3.
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

    // 2. Comprobar el onboarding vendedor del usuario autenticado.
    //    En esta etapa TODA publicación (productos de pago y clasificados) requiere
    //    onboarding completo (shop.active) + aprobación del admin (shop.approved):
    //    el acceso a vender está limitado a tiendas invitadas (waiting list).
    const user = await User.findById(req.user._id).select(
      "shop.active shop.approved shop.approvalReason walletAddress",
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    const shopActive = Boolean(user.shop?.active);
    const shopApproved = Boolean(user.shop?.approved);

    // 2a. Falta completar el onboarding (datos básicos + tienda).
    if (!shopActive) {
      return res.status(403).json({
        success: false,
        blocked: "onboarding",
        message:
          "Para poder publicar necesitamos que completes algunos datos de tu cuenta y de tu tienda.",
      });
    }

    // 2b. Onboarding completo, pero la tienda aún está en LISTA DE ESPERA
    //     (no aprobada por un admin). No hay nada más que completar: el
    //     front muestra "serás notificado cuando estés habilitado".
    if (!shopApproved) {
      return res.status(403).json({
        success: false,
        blocked: "approval",
        message:
          user.shop?.approvalReason?.trim()
            ? `Tu tienda todavía no está habilitada para publicar: ${user.shop.approvalReason.trim()}`
            : "Estás en la lista de espera. Serás notificado cuando estés habilitado para vender en Mercado Nero.",
      });
    }

        // 3. WALLET WEB3: YA NO se exige para CREAR la publicación.
    //    Antes bloqueábamos con blocked:"wallet" y eso cortaba el flujo: el
    //    vendedor perdía todo el formulario para ir a crear la billetera. Ahora
    //    permitimos crear el producto SIEMPRE (tienda aprobada) y, si el
    //    vendedor no tiene wallet, el producto queda PUBLICADO pero OCULTO al
    //    público: `getProducts`/`getProductById` ya filtran los productos de
    //    pago de vendedores sin `walletAddress` (ver productController). Así el
    //    vendedor no pierde su trabajo y aparece en el catálogo en cuanto
    //    vincule la billetera (sin re-publicar).
    next();
  } catch (error) {
    console.error("Error en requireSellerOnboarding:", error);
    res.status(500).json({ success: false, message: "Error interno al verificar el onboarding." });
  }
}
