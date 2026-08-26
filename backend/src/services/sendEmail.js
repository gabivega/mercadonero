import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Remitente predeterminado (cambiar por tu dominio cuando lo verifiques)
const FROM_EMAIL = process.env.EMAIL_FROM || 'Mercado Nero <onboarding@resend.dev>';

/**
 * Notificación: Nueva Orden Creada (al Comprador)
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
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
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
          <h2 style="color: #111;">¡Tu orden fue iniciada!</h2>
          <p>Realizá la transferencia por el monto exacto para completar tu compra de la orden <strong>#${shortOrderId}</strong>:</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
            <p style="margin: 10px 0 8px 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto a pagar:</strong> $${amount} ARS</p>
            <p style="margin: 5px 0;"><strong>Titular:</strong> ${vendorName}</p>
            ${vendorAlias ? `<p style="margin: 5px 0;"><strong>Alias:</strong> <code>${vendorAlias}</code></p>` : ''}
            ${vendorCbu ? `<p style="margin: 5px 0;"><strong>CBU/CVU:</strong> <code>${vendorCbu}</code></p>` : ''}
          </div>

          <p style="font-size: 13px; color: #666;">
            Puedes visualizar los datos completos de la orden en tu panel de usuario, sección <strong>"Mis Compras"</strong>.
          </p>

          <p style="font-size: 13px; color: #666;">
            Una vez transferido, ingresá a la plataforma y hacé clic en <strong>"Marcar Pago Realizado"</strong>.
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
 * 2. NOTIFICACIÓN AL VENDEDOR (Alerta de Orden + Datos de Envío)
 */
export const sendOrderCreatedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
  products = [],
  buyerName,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const productListHtml = Array.isArray(products) && products.length > 0
      ? `<ul style="margin: 10px 0; padding-left: 20px;">
          ${products.map(item => `<li style="margin-bottom: 4px;">${item.title || item.name}</li>`).join('')}
        </ul>`
      : '<p style="margin: 5px 0;">Sin detalle de productos</p>';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `🛒 ¡Nueva solicitud de compra! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tienes una nueva orden de compra!</h2>
          <p>El comprador <strong>${buyerName}</strong> inició la orden <strong>#${shortOrderId}</strong>.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
            <p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto Total:</strong> $${amount} ARS</p>
          </div>

          <p style="font-size: 13px; color: #555;">
            Tus fondos en Escrow están seguros y bloqueados en el Smart Contract. Te avisaremos apenas el comprador confirme la transferencia.
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
 * 3. NOTIFICACIÓN AL VENDEDOR (Comprador Confirma el Pago)
 */
export const sendPaymentConfirmedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `✅ ¡Pago reportado! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">El comprador notificó el pago</h2>
          <p>Te informamos que el comprador confirmó haber realizado la transferencia correspondiente a la orden <strong>#${shortOrderId}</strong>.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe del pago:</strong> $${amount} ARS</p>
          </div>

          <p style="font-size: 13px; color: #555;">
            Recordá ingresar a la plataforma, sección <strong>"Mis Ventas"</strong>, para verificar el pago y coordinar el envío del producto.
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
 * 4. NOTIFICACIÓN AL COMPRADOR (Detalles del Envío)
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
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const providerDisplay = otherProviderDetail || provider || 'No especificado';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `📦 ¡Tu pedido fue enviado! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tu pedido está en camino!</h2>
          <p>El vendedor confirmó el envío de tu orden <strong>#${shortOrderId}</strong>. Acá tenés los datos de seguimiento:</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #333;">Datos de envío:</p>
            <p style="margin: 5px 0;"><strong>Proveedor:</strong> ${providerDisplay}</p>
            ${trackingNumber ? `<p style="margin: 5px 0;"><strong>N° de seguimiento:</strong> <code>${trackingNumber}</code></p>` : ''}
            <p style="margin: 10px 0 5px 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Dirección de entrega:</strong></p>
            <p style="margin: 0; color: #555;">
              ${shippingAddress?.street || ''} ${shippingAddress?.streetNumber || ''}
              ${shippingAddress?.city ? ', ' + shippingAddress.city : ''}
              ${shippingAddress?.province ? ', ' + shippingAddress.province : ''}
              ${shippingAddress?.zipCode ? ' - CP ' + shippingAddress.zipCode : ''}
            </p>
            <p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto de la orden:</strong> $${amount} ARS</p>
          </div>

          <p style="font-size: 13px; color: #666;">
            Recordá que podés darle seguimiento al pedido ingresando a la plataforma, sección <strong>"Mis Compras"</strong>.
          </p>
          <p style="font-size: 13px; color: #666;">
            Cuando recibas tu paquete, no olvides confirmar la recepción para completar la transacción y liberar los fondos al vendedor.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando email de envío al comprador:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Exception en sendShippingDetailsToBuyer:', err);
  }
};

/**
 * 5. NOTIFICACIÓN AL VENDEDOR (Comprador Confirmó Recepción / Fondos Liberados)
 * Solo parámetros básicos; el resto se ve en el dashboard.
 */
export const sendOrderCompletedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `✅ Orden #${shortOrderId} completada - Fondos liberados`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tu venta fue completada!</h2>
          <p>El comprador confirmó la recepción de la orden <strong>#${shortOrderId}</strong>.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            Tus fondos fueron liberados desde el Escrow. Podés ver el detalle completo en tu panel, sección <strong>"Mis Ventas"</strong>.
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
 * 6. NOTIFICACIÓN AL COMPRADOR (Compra Completada)
 * Solo parámetros básicos; el resto se ve en el dashboard.
 */
export const sendOrderCompletedToBuyer = async ({
  buyerEmail,
  orderId,
  amount,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `🎉 ¡Compra completada! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tu compra fue completada!</h2>
          <p>Confirmaste la recepción de la orden <strong>#${shortOrderId}</strong> y la transacción se cerró correctamente.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            Podés ver el detalle completo en tu panel, sección <strong>"Mis Compras"</strong>.
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
 * 7. NOTIFICACIÓN AL VENDEDOR (Comprador solicitó cancelar ya habiendo pagado)
 * El vendedor debe reembolsarle al comprador para completar la cancelación.
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
      subject: `⚠️ Solicitud de cancelación con pago - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">El comprador quiere cancelar la orden</h2>
          <p>El comprador <strong>${buyerName}</strong> ya abonó la orden <strong>#${shortOrderId}</strong> y solicita la cancelación.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe a reembolsar:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            Para completar la cancelación, <strong>deberás reembolsar el importe al comprador</strong>. Sus datos bancarios están disponibles en la plataforma (sección detalle de la orden). Una vez reembolsado, confirmá la devolución para cerrar la operación y liberar tu colateral.
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
 * 8. NOTIFICACIÓN AL COMPRADOR (Cancelación ejecutada / orden cancelada)
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
      subject: `🚫 Orden #${shortOrderId} cancelada`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu orden fue cancelada</h2>
          <p>La orden <strong>#${shortOrderId}</strong> fue cancelada.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          ${withRefund
            ? `<p style="font-size: 13px; color: #555;">Te informamos que el vendedor confirmó el reembolso de tu pago. Verificá que el dinero llegue a tu cuenta en los próximos días hábiles.</p>`
            : `<p style="font-size: 13px; color: #555;">El colateral de la operación fue liberado. No realizaste ningún pago, por lo que no corresponde reembolso.</p>`}
        </div>
      `,
    });
    if (error) console.error('Error email cancelación al comprador:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCancelledToBuyer:', err);
  }
};

/**
 * 9. NOTIFICACIÓN AL VENDEDOR (Cancelación ejecutada / orden cancelada)
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
      subject: `🚫 Orden #${shortOrderId} cancelada`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">La orden fue cancelada</h2>
          <p>La orden <strong>#${shortOrderId}</strong> fue cancelada.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          ${withRefund
            ? `<p style="font-size: 13px; color: #555;">Confirmaste el reembolso al comprador y tu colateral fue liberado desde el Escrow.</p>`
            : `<p style="font-size: 13px; color: #555;">Tu colateral fue liberado desde el Escrow, ya que la orden se canceló sin pago.</p>`}
        </div>
      `,
    });

    if (error) console.error('Error email cancelación al vendedor:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendOrderCancelledToVendor:', err);
  }
};

/**
 * 10. NOTIFICACIÓN AL ADMIN (El vendedor pidió cancelar / liberar garantía).
 * Se envía para que el admin resuelva lo antes posible. La resolución es
 * manual: primero cancela la orden y, tras verificar con el comprador que no
 * hubo pago (o que recibió su reintegro), libera la garantía aparte.
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
      subject: `⚠️ Solicitud de cancelación de orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Nueva solicitud de cancelación</h2>
          <p>El vendedor <strong>${sellerName}</strong> solicitó cancelar la orden <strong>#${shortOrderId}</strong> y liberar los fondos en garantía.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
            <p style="margin: 5px 0 0 0;"><strong>Comprador:</strong> ${buyerName}</p>
            ${reason ? `<p style="margin: 5px 0 0 0;"><strong>Motivo:</strong> ${reason}</p>` : ''}
          </div>
          <p style="font-size: 13px; color: #555;">
            Ingresá al panel de administración para gestionarla. Recordá: primero cancelá la orden manualmente y, tras verificar con el comprador que no hubo pago (o que recibió su reintegro), liberá la garantía.
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

/**
 * 11. NOTIFICACIÓN AL VENDEDOR (Falta depósito de garantía / "awaiting_collateral")
 * Cuando un comprador inicia una orden pero el vendedor no tiene saldo de
 * garantía libre suficiente, la orden entra en espera. Avisamos por mail para
 * que deposite USDT en el plazo y no pierda la venta.
 */
export const sendVendorCollateralHoldRequested = async ({
  vendorEmail,
  orderId,
  amount,
  products = [],
  buyerName,
  minutesLeft,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const productListHtml = Array.isArray(products) && products.length > 0
      ? `<ul style="margin: 10px 0; padding-left: 20px;">
          ${products.map((item) => `<li style="margin-bottom: 4px;">${item.title || item.name}</li>`).join('')}
        </ul>`
      : '<p style="margin: 5px 0;">Sin detalle de productos</p>';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `⏳ ¡Tenés una venta esperando tu garantía! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tenés una compra en espera</h2>
          <p>El comprador <strong>${buyerName}</strong> inició la orden <strong>#${shortOrderId}</strong>, pero no tenés saldo libre de garantía suficiente para cubrirla.</p>

          <div style="background-color: #fffbeb; border: 1px solid #fcd34d; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">💸 Para no perder la venta:</p>
            <p style="margin: 5px 0;"><strong>Depositá tu fondo de garantía</strong> en los próximos <strong>${minutesLeft || 15} minutos</strong>.</p>
          </div>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
            <p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto de garantía requerido:</strong> US$ ${amount || '—'}</p>
          </div>

          <p style="font-size: 13px; color: #555;">
            Ingresá a la plataforma, andá a tu <strong>billetera</strong>, depositá el colateral y luego pulsá <strong>"Deposité, activar orden"</strong> en el detalle de la orden.
          </p>
          <p style="font-size: 13px; color: #b45309;">
            Si no depositás a tiempo, la solicitud se cancelará automáticamente.
          </p>
        </div>
      `,
    });

    if (error) console.error('Error email de garantía al vendedor:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendVendorCollateralHoldRequested:', err);
  }
};
