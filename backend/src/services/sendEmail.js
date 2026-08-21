import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Remitente predeterminado (cambiar por tu dominio cuando lo verifiques)
const FROM_EMAIL = process.env.EMAIL_FROM || 'Mercado Nero <onboarding@resend.dev>';

/**
 * NotificaciÃ³n: Nueva Orden Creada (al Vendedor)
 */
export const sendOrderCreatedToBuyer = async ({
  buyerEmail,
  orderId,
  amount,
  products = [],
  vendorAlias,
  vendorName,
    vendorCbu,
}) => {
  try {
        // NÂ° de orden corto (Ãºltimos 6 caracteres, en mayÃºsculas) para mostrar en los templates
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    // Generar la lista HTML de productos
    const productListHtml = Array.isArray(products) && products.length > 0
      ? `<ul style="margin: 10px 0; padding-left: 20px;">
          ${products.map(item => `<li style="margin-bottom: 4px;">${item.title || item.name}</li>`).join('')}
        </ul>`
      : '<p style="margin: 5px 0;">Sin detalle de productos</p>';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `[Mercado Nero] Orden #${shortOrderId} - Datos para realizar la transferencia`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Â¡Tu orden fue iniciada!</h2>
          <p>RealizÃ¡ la transferencia por el monto exacto para completar tu compra de la orden <strong>#${shortOrderId}</strong>:</p>
          
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
            <p style="margin: 10px 0 8px 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto a pagar:</strong> $${amount} ARS</p>
            <p style="margin: 5px 0;"><strong>Titular:</strong> ${vendorName}</p>
            ${vendorAlias ? `<p style="margin: 5px 0;"><strong>Alias:</strong> <code>${vendorAlias}</code></p>` : ''}
            ${vendorCbu ? `<p style="margin: 5px 0;"><strong>CBU/CVU:</strong> <code>${vendorCbu}</code></p>` : ''}
          </div>

          <p style="font-size: 13px; color: #666;">
            Puedes visualizar los datos completos de la orden en tu panel de usuario, secciÃ³n <strong>"Mis Compras"</strong>.
          </p>
          
          <p style="font-size: 13px; color: #666;">
            Una vez transferido, ingresÃ¡ a la plataforma y hacÃ© clic en <strong>"Marcar Pago Realizado"</strong>.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando email al comprador:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCreatedToBuyer:', err);
  }
};

/**
 * 2. NOTIFICACIÃ“N AL VENDEDOR (Alerta de Orden + Datos de EnvÃ­o)
 */
export const sendOrderCreatedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
    products = [],
  buyerName,
}) => {
  try {
        // NÂ° de orden corto (Ãºltimos 6 caracteres, en mayÃºsculas) para mostrar en los templates
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    // Generar la lista HTML de productos
    const productListHtml = Array.isArray(products) && products.length > 0
      ? `<ul style="margin: 10px 0; padding-left: 20px;">
          ${products.map(item => `<li style="margin-bottom: 4px;">${item.title || item.name}</li>`).join('')}
        </ul>`
      : '<p style="margin: 5px 0;">Sin detalle de productos</p>';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `ðŸ›’ Â¡Nueva solicitud de compra! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Â¡Tienes una nueva orden de compra!</h2>
          <p>El comprador <strong>${buyerName}</strong> iniciÃ³ la orden <strong>#${shortOrderId}</strong>.</p>
          
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-[13px]; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
            <p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto Total:</strong> $${amount} ARS</p>
          </div>

          <p style="font-size: 13px; color: #555;">
            Tus fondos en Escrow estÃ¡n seguros y bloqueados en el Smart Contract. Te avisaremos apenas el comprador confirme la transferencia.
          </p>
        </div>
      `,
    });

        if (error) {
      console.error('Error enviando email al vendedor:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCreatedToVendor:', err);
  }
};

/**
 * 3. NOTIFICACIÃ“N AL VENDEDOR (Comprador Confirma el Pago)
 */
export const sendPaymentConfirmedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
}) => {
  try {
        // NÂ° de orden corto (Ãºltimos 6 caracteres, en mayÃºsculas) para mostrar en los templates
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `âœ… Â¡Pago reportado! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">El comprador notificÃ³ el pago</h2>
          <p>Te informamos que el comprador confirmÃ³ haber realizado la transferencia correspondiente a la orden <strong>#${shortOrderId}</strong>.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe del pago:</strong> $${amount} ARS</p>
          </div>

          <p style="font-size: 13px; color: #555;">
            RecordÃ¡ ingresar a la plataforma, secciÃ³n <strong>"Mis Ventas"</strong>, para verificar el pago y coordinar el envÃ­o del producto.
          </p>
        </div>
      `,
    });








        if (error) {
      console.error('Error enviando email de pago al vendedor:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendPaymentConfirmedToVendor:', err);
  }
};

/**
 * 4. NOTIFICACIÃ“N AL COMPRADOR (Detalles del EnvÃ­o)
 */
export const sendShippingDetailsToBuyer = async ({
  buyerEmail,
  orderId,
  provider,
  trackingNumber,
  otherProviderDetail,
    amount,
  shippingAddress,
}) => {
  try {
        // NÂ° de orden corto (Ãºltimos 6 caracteres, en mayÃºsculas) para mostrar en los templates
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    // Determinar el proveedor a mostrar (si viene un proveedor custom, usar otherProviderDetail)
    const providerDisplay = otherProviderDetail || provider || 'No especificado';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `ðŸ“¦ Â¡Tu pedido fue enviado! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Â¡Tu pedido estÃ¡ en camino!</h2>
          <p>El vendedor confirmÃ³ el envÃ­o de tu orden <strong>#${shortOrderId}</strong>. AcÃ¡ tenÃ©s los datos de seguimiento:</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #333;">Datos de envÃ­o:</p>
            <p style="margin: 5px 0;"><strong>Proveedor:</strong> ${providerDisplay}</p>
            ${trackingNumber ? `<p style="margin: 5px 0;"><strong>NÂ° de seguimiento:</strong> <code>${trackingNumber}</code></p>` : ''}
            <p style="margin: 10px 0 5px 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>DirecciÃ³n de entrega:</strong></p>
            <p style="margin: 0; color: #555;">
              ${shippingAddress?.street || ''} ${shippingAddress?.streetNumber || ''}
              ${shippingAddress?.city ? ', ' + shippingAddress.city : ''}
              ${shippingAddress?.province ? ', ' + shippingAddress.province : ''}
              ${shippingAddress?.zipCode ? ' - CP ' + shippingAddress.zipCode : ''}
            </p>
            <p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto de la orden:</strong> $${amount} ARS</p>
          </div>

          <p style="font-size: 13px; color: #666;">
            RecordÃ¡ que podÃ©s darle seguimiento al pedido ingresando a la plataforma, secciÃ³n <strong>"Mis Compras"</strong>.
          </p>
          <p style="font-size: 13px; color: #666;">
            Cuando recibas tu paquete, no olvides confirmar la recepciÃ³n para completar la transacciÃ³n y liberar los fondos al vendedor.
          </p>
        </div>
      `,
    });

        if (error) {
      console.error('Error enviando email de envÃ­o al comprador:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendShippingDetailsToBuyer:', err);
  }
};

/**
 * 5. NOTIFICACIÃ“N AL VENDEDOR (Comprador ConfirmÃ³ RecepciÃ³n / Fondos Liberados)
 * Solo parÃ¡metros bÃ¡sicos; el resto se ve en el dashboard.
 */
export const sendOrderCompletedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
}) => {
  try {
        // NÂ° de orden corto (Ãºltimos 6 caracteres, en mayÃºsculas) para mostrar en los templates
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `âœ… Orden #${shortOrderId} completada - Fondos liberados`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Â¡Tu venta fue completada!</h2>
          <p>El comprador confirmÃ³ la recepciÃ³n de la orden <strong>#${shortOrderId}</strong>.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            Tus fondos fueron liberados desde el Escrow. PodÃ©s ver el detalle completo en tu panel, secciÃ³n <strong>"Mis Ventas"</strong>.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando email de orden completada al vendedor:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCompletedToVendor:', err);
  }
};

/**
 * 6. NOTIFICACIÃ“N AL COMPRADOR (Compra Completada)
 * Solo parÃ¡metros bÃ¡sicos; el resto se ve en el dashboard.
 */
export const sendOrderCompletedToBuyer = async ({
  buyerEmail,
  orderId,
  amount,
}) => {
  try {
        // NÂ° de orden corto (Ãºltimos 6 caracteres, en mayÃºsculas) para mostrar en los templates
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `ðŸŽ‰ Â¡Compra completada! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Â¡Tu compra fue completada!</h2>
          <p>Confirmaste la recepciÃ³n de la orden <strong>#${shortOrderId}</strong> y la transacciÃ³n se cerrÃ³ correctamente.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            PodÃ©s ver el detalle completo en tu panel, secciÃ³n <strong>"Mis Compras"</strong>.
          </p>
        </div>
      `,
    });

        if (error) {
      console.error('Error enviando email de compra completada al comprador:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCompletedToBuyer:', err);
  }
};

/**
 * 7. NOTIFICACIÃ“N AL VENDEDOR (Comprador solicitÃ³ cancelar ya habiendo pagado)
 * El vendedor debe reembolsarle al comprador para completar la cancelaciÃ³n.
 */
export const sendRefundRequestedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
  buyerName,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `âš ï¸ Solicitud de cancelaciÃ³n con pago - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">El comprador quiere cancelar la orden</h2>
          <p>El comprador <strong>${buyerName}</strong> ya abonÃ³ la orden <strong>#${shortOrderId}</strong> y solicita la cancelaciÃ³n.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe a reembolsar:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            Para completar la cancelaciÃ³n, <strong>deberÃ¡s reembolsar el importe al comprador</strong>. Sus datos bancarios estÃ¡n disponibles en la plataforma (secciÃ³n detalle de la orden). Una vez reembolsado, confirmÃ¡ la devoluciÃ³n para cerrar la operaciÃ³n y liberar tu colateral.
          </p>
        </div>
      `,
    });
    if (error) console.error('Error email reembolso al vendedor:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendRefundRequestedToVendor:', err);
  }
};

/**
 * 8. NOTIFICACIÃ“N AL COMPRADOR (CancelaciÃ³n ejecutada / orden cancelada)
 */
export const sendOrderCancelledToBuyer = async ({
  buyerEmail,
  orderId,
  amount,
  withRefund,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `ðŸš« Orden #${shortOrderId} cancelada`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu orden fue cancelada</h2>
          <p>La orden <strong>#${shortOrderId}</strong> fue cancelada.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          ${withRefund
            ? `<p style="font-size: 13px; color: #555;">Te informamos que el vendedor confirmÃ³ el reembolso de tu pago. VerificÃ¡ que el dinero llegue a tu cuenta en los prÃ³ximos dÃ­as hÃ¡biles.</p>`
            : `<p style="font-size: 13px; color: #555;">El colateral de la operaciÃ³n fue liberado. No realizaste ningÃºn pago, por lo que no corresponde reembolso.</p>`}
        </div>
      `,
    });
    if (error) console.error('Error email cancelaciÃ³n al comprador:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCancelledToBuyer:', err);
  }
};

/**
 * 9. NOTIFICACIÃ“N AL VENDEDOR (CancelaciÃ³n ejecutada / orden cancelada)
 */
export const sendOrderCancelledToVendor = async ({
  vendorEmail,
  orderId,
  amount,
  withRefund,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `ðŸš« Orden #${shortOrderId} cancelada`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">La orden fue cancelada</h2>
          <p>La orden <strong>#${shortOrderId}</strong> fue cancelada.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          ${withRefund
            ? `<p style="font-size: 13px; color: #555;">Confirmaste el reembolso al comprador y tu colateral fue liberado desde el Escrow.</p>`
            : `<p style="font-size: 13px; color: #555;">Tu colateral fue liberado desde el Escrow, ya que la orden se cancelÃ³ sin pago.</p>`}
        </div>
      `,
    });





        if (error) console.error('Error email cancelaciÃ³n al vendedor:', error);
        return { data, error };
  } catch (err) {
        console.error('Exception en sendOrderCancelledToVendor:', err);
  }
};

/**
 * 10. NOTIFICACIÃ“N AL ADMIN (El vendedor pidiÃ³ cancelar / liberar garantÃ­a).
 * Se envÃ­a para que el admin resuelva lo antes posible. La resoluciÃ³n es
 * manual: primero cancela la orden y, tras verificar con el comprador que no
 * hubo pago (o que recibiÃ³ su reintegro), libera la garantÃ­a aparte.
 */
export const sendAdminCancellationRequest = async ({
  adminEmail,
  orderId,
  amount,
  sellerName,
  buyerName,
  reason,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [adminEmail],
      subject: `âš ï¸ Solicitud de cancelaciÃ³n de orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Nueva solicitud de cancelaciÃ³n</h2>
          <p>El vendedor <strong>${sellerName}</strong> solicitÃ³ cancelar la orden <strong>#${shortOrderId}</strong> y liberar los fondos en garantÃ­a.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>NÃºmero de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
            <p style="margin: 5px 0 0 0;"><strong>Comprador:</strong> ${buyerName}</p>
            ${reason ? `<p style="margin: 5px 0 0 0;"><strong>Motivo:</strong> ${reason}</p>` : ''}
          </div>
          <p style="font-size: 13px; color: #555;">
            IngresÃ¡ al panel de administraciÃ³n para gestionarla. RecordÃ¡: primero cancelÃ¡ la orden manualmente y, tras verificar con el comprador que no hubo pago (o que recibiÃ³ su reintegro), liberÃ¡ la garantÃ­a.
          </p>
        </div>
      `,
    });
    if (error) console.error('Error email al admin:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendAdminCancellationRequest:', err);
  }
};
