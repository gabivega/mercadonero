import { Resend } from 'resend';
import { notifyAdmin, escapeTelegramHtml as tgEsc } from './telegramService.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Remitente predeterminado (cambiar por tu dominio cuando lo verifiques)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL; 
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

    // ── Espejo en TELEGRAM (solo admin) ──
    // Mandamos la MISMA alerta al admin por Telegram, además del mail al
    // comprador. Internamente respeta el catálogo de eventos: si el admin
    // apagó `order_created`, no se envía nada. No se espera (fire-and-forget).
    notifyAdmin("order_created", {
      header: "🛒 <b>Nueva orden (transferencia)</b>",
      lines: [
        `#${shortOrderId} · $${amount} ARS`,
        `Comprador: ${tgEsc(buyerName)}`,
        `Vendedor: ${tgEsc(vendorName)}`,
      ],
      data: { orderId },
    }).catch(() => {});

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
            Se ha bloqueado el importe equivalente al monto de la orden. Estate atento a la transferencia bancaria por parte del comprador.
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

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin("order_paid", {
      header: "💰 <b>El comprador notificó el pago</b>",
      lines: [`#${shortOrderId} · $${amount} ARS`],
      data: { orderId },
    }).catch(() => {});

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

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin("order_shipped", {
      header: "📦 <b>Pedido enviado</b>",
      lines: [
        `#${shortOrderId}`,
        `Proveedor: ${tgEsc(providerDisplay)}${trackingNumber ? ` · ${tgEsc(trackingNumber)}` : ""}`,
      ],
      data: { orderId },
    }).catch(() => {});

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
      subject: `✅ Orden #${shortOrderId} completada`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tu venta fue completada!</h2>
          <p>El comprador confirmó la recepción de la orden <strong>#${shortOrderId}</strong>.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>
          </div>
          <p style="font-size: 13px; color: #555;">
            Tus fondos en garantía permanecen bloqueados por proteccion al comprador durante al menos 24 hs. Podés ver el detalle completo en tu panel, sección <strong>"Mis Ordenes"</strong>.
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

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin("refund_requested", {
      header: "↩️ <b>Reembolso solicitado</b>",
      lines: [`#${shortOrderId} · $${amount} ARS`, `Comprador: ${tgEsc(buyerName)}`],
      data: { orderId },
    }).catch(() => {});

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

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin("order_cancelled", {
      header: "🚫 <b>Orden cancelada</b>",
      lines: [`#${shortOrderId} · $${amount} ARS${withRefund ? " · con reembolso" : ""}`],
      data: { orderId },
    }).catch(() => {});

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
 * 1b. Notificación: Nueva Orden Creada con PAGO EN CRIPTO (al Comprador).
 * Se usa por separado de sendOrderCreatedToBuyer (transferencia bancaria): en
 * cripto NO se mandan CBU/alias/titular ni instrucciones de transferir; el
 * comprador debe fondear su escrow desde la plataforma firmando una tx.
 */
export const sendOrderCreatedToBuyerEscrow = async ({
  buyerEmail,
  orderId,
  products = [],
  amountUsdt,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const productListHtml =
      Array.isArray(products) && products.length > 0
        ? `<ul style="margin: 10px 0; padding-left: 20px;">${products
              .map((item) => `<li style="margin-bottom: 4px;">${item.title || item.name}</li>`)
              .join("")}</ul>`
        : '<p style="margin: 5px 0;">Sin detalle de productos</p>';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `🔒 Orden #${shortOrderId} creada - Fondéa tu escrow USDT`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tu orden en cripto fue iniciada!</h2>
          <p>Tu compra <strong>#${shortOrderId}</strong> pagará con USDT. Tus fondos quedan <strong>100% protegidos en el contrato escrow</strong> y se liberan al vendedor recién cuando confirmes la recepción del pedido.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
          </div>
          <div style="background-color: #fff7ed; border: 1px solid #fdba74; padding: 14px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #9a3412;">✋ IMPORTANTE</p>
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #7c2d12;">
              Para completar la compra ingresá a la plataforma, abrí la orden y <strong>firmá la transacción para fondear el escrow</strong> con
              ${amountUsdt != null ? `<strong>US$ ${amountUsdt} USDT</strong>` : ""} desde tu billetera.
            </p>
            <p style="margin: 0; font-size: 12px; color: #9a3412;">La orden no se despacha hasta que los USDT estén depositados en el escrow.</p>
          </div>
        </div>
      `,
    });

    if (error) console.error("Error enviando email de escrow al comprador:", error);

    // ── Espejo en TELEGRAM (solo admin) ──
    notifyAdmin("order_created", {
      header: "🔒 <b>Nueva orden (cripto / escrow)</b>",
      lines: [
        `#${shortOrderId}${amountUsdt != null ? ` · US$ ${amountUsdt}` : ""}`,
        "Esperando fondeo del escrow por el comprador.",
      ],
      data: { orderId },
    }).catch(() => {});

    return { data, error };
  } catch (err) {
    console.error("Exception en sendOrderCreatedToBuyerEscrow:", err);
  }
};

/**
 * 3b. NOTIFICACIÓN AL VENDEDOR (Comprador PAGÓ con cripto — email ÚNICO).
 * En órdenes crypto NO se avisa al vendedor al crear la orden (el comprador
 * puede cerrar el modal sin pagar y la orden se descarta). Recién cuando el
 * comprador fondea el escrow on-chain se envía este ÚNICO email que resume
 * todo: qué se vendió, quién compró y que el pago ya está retenido en el
 * Smart Contract. Reemplaza a la dupla "orden creada" + "pago confirmado".
 */
export const sendVendorCryptoPaid = async ({
  vendorEmail,
  orderId,
  amount,
  amountUsdt,
  products = [],
  buyerName,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const productListHtml =
      Array.isArray(products) && products.length > 0
        ? `<ul style="margin: 10px 0; padding-left: 20px;">${products
            .map((item) => `<li style="margin-bottom: 4px;">${item.title || item.name}</li>`)
            .join("")}</ul>`
        : '<p style="margin: 5px 0;">Sin detalle de productos</p>';

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `🛒 ¡Vendiste! Orden #${shortOrderId} pagada con cripto`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tenés una nueva venta pagada!</h2>
          <p>El comprador <strong>${buyerName}</strong> ya abonó la orden <strong>#${shortOrderId}</strong> con cripto. El pago quedó <strong>retenido y protegido en el Smart Contract</strong>. Se acreditará en tu billetera luego de
          que el comprador reciba el producto en las condiciones correctas.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">Productos:</p>
            ${productListHtml}
            ${
              amountUsdt != null
                ? `<p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Cobrarás:</strong> US$ ${amountUsdt} USD</p>`
                : amount != null
                  ? `<p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Monto Total:</strong> $${amount} ARS</p>`
                  : ""
            }
          </div>

          <div style="background-color: #ecfdf5; border: 1px solid #6ee7b7; padding: 14px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #065f46;">✅ Podés despachar</p>
            <p style="margin: 0; font-size: 13px; color: #065f46;">
              Los USD del comprador ya están depositados en el contrato inteligente. Ingresá a la plataforma, sección <strong>"Mis Ordenes"</strong>, para avanzar el envío del producto.
            </p>
          </div>

          <p style="font-size: 13px; color: #555;">
            Tus fondos se liberan a tu billetera cuando el comprador confirme la recepción.
          </p>
        </div>
      `,
    });

    if (error) console.error("Error enviando email de venta crypto al vendedor:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendVendorCryptoPaid:", err);
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

/**
 * NOTIFICACIÓN AL COMPRADOR (El vendedor reportó "pago no recibido").
 * Se invoca cuando el vendedor abre una disputa de pago no ingresado
 * (transferencia bancaria). Se le pide al comprador que suba su comprobante
 * de la transferencia para que el admin pueda resolver el caso.
 */
export const sendBuyerPaymentDisputeAskProof = async ({
  buyerEmail,
  orderId,
  amount,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `Alerta de pago no registrado - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu pago no fue registrado</h2>
          <p>El vendedor de la orden <strong>#${shortOrderId}</strong> reportó que aun no recibio tu transferencia.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Numero de orden:</strong> #${shortOrderId}</p>
            ${amount != null ? `<p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>` : ''}
          </div>
          <p style="font-size: 13px; color: #555;">
            Si <strong>si realizaste la transferencia</strong>, ingresá a la plataforma, abri la orden y <strong>subi el comprobante</strong> (imagen o PDF) lo antes posible. Nuestro equipo lo revisara para confirmar la operacion y que se encause el envio.
          </p>
          <p style="font-size: 13px; color: #b45309;">
            Aviso legal: reportar un pago sin haberlo hecho es una falta grave y puede derivar en la suspension de tu cuenta.
          </p>
        </div>
      `,
    });
    if (error) console.error('Error email de pago no recibido al comprador:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendBuyerPaymentDisputeAskProof:', err);
  }
};

/**
 * NOTIFICACIÓN AL VENDEDOR / ADMIN (El comprador subió el comprobante).
 */
export const sendPaymentProofUploaded = async ({
  email,
  orderId,
  amount,
  roleLabel,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: `Comprobante adjuntado - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">El comprador adjunto el comprobante</h2>
          <p>El comprador cargo su comprobante de transferencia para la orden <strong>#${shortOrderId}</strong>${
            roleLabel ? ` (destinatario: ${roleLabel})` : ''
          }.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Numero de orden:</strong> #${shortOrderId}</p>
            ${amount != null ? `<p style="margin: 5px 0 0 0;"><strong>Importe:</strong> $${amount} ARS</p>` : ''}
          </div>
          <p style="font-size: 13px; color: #555;">
            Ingresa a la plataforma y revisa el comprobante en el detalle de la orden.
          </p>
        </div>
      `,
    });
    if (error) console.error('Error email de comprobante adjuntado:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendPaymentProofUploaded:', err);
  }
};

/**
 * NOTIFICACIÓN AL COMPRADOR (Resultado de la disputa de pago no recibido a favor).
 */
export const sendPaymentDisputeResolvedInBuyerFavor = async ({
  buyerEmail,
  orderId,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `Compra confirmada - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu pago fue validado</h2>
          <p>Tras revisar el comprobante de la orden <strong>#${shortOrderId}</strong>, confirmamos la operacion. El vendedor sera notificado para que verifique su cuenta y continue con el envio de tu pedido.</p>
          <p style="font-size: 13px; color: #555;">
            Segui el estado de tu compra en la plataforma, seccion <strong>"Mis Compras"</strong>.
          </p>
        </div>
      `,
    });
    if (error) console.error('Error email de pago validado al comprador:', error);
    return { data, error };
  } catch (err) {
    console.error('Exception en sendPaymentDisputeResolvedInBuyerFavor:', err);
  }
};


/**
 * 12. NOTIFICACIÓN AL VENDEDOR (Compra en Grupo).
 * Aviso simple cuando un comprador crea un grupo o se suma a uno existente
 * para un producto del vendedor. No es una orden todavía: sólo visibilidad.
 */
export const sendPoolActivityToVendor = async ({
  vendorEmail,
  action = "created",
  productName,
  buyerName,
  membersCount,
  targetBuyers,
  currentUnitPrice,
}) => {
  try {
    const isCreated = action === "created";
    const actionText = isCreated
      ? "creó un grupo de compra"
      : "se sumó a un grupo de compra";
    const subject = isCreated
      ? `👥 Nuevo grupo de compra: ${productName || "tu producto"}`
      : `👥 Se sumó un comprador a un grupo: ${productName || "tu producto"}`;

    const progressText =
      membersCount != null && targetBuyers
        ? `${membersCount}/${targetBuyers} compradores`
        : null;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Actividad en Compra en Grupo</h2>
          <p>Un comprador <strong>${actionText}</strong> para tu producto <strong>${productName || ""}</strong>.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            ${buyerName ? `<p style="margin: 0 0 6px 0;"><strong>Comprador:</strong> ${buyerName}</p>` : ""}
            ${progressText ? `<p style="margin: 0 0 6px 0;"><strong>Integrantes:</strong> ${progressText}</p>` : ""}
            ${currentUnitPrice != null ? `<p style="margin: 0;"><strong>Precio unitario actual:</strong> $${currentUnitPrice} ARS</p>` : ""}
          </div>

          <p style="font-size: 13px; color: #555;">
            Recordá: el grupo <strong>todavía no es una orden</strong>. Recién se convierte en compra cuando se completa y los pagos quedan en garantía. Podés ver todos tus grupos activos en tu panel, sección <strong>"Mis Órdenes" » Grupos activos</strong>.
          </p>
        </div>
      `,
    });

        if (error) console.error("Error email de grupo al vendedor:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendPoolActivityToVendor:", err);
  }
};

/**
 * 13. NOTIFICACIÓN AL COMPRADOR (Recordatorio para confirmar recepción de una
 * orden con escrow crypto que lleva N días fondeada sin confirmar).
 * Se dispara desde el panel de admin (botón "Notificar al comprador").
 */
export const sendEscrowReleaseReminderToBuyer = async ({
  buyerEmail,
  orderId,
  amountUsdt,
  daysSinceFunded,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `Recordatorio: confirmá la recepción de tu orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu pago sigue retenido en garantía</h2>
          <p>Tu orden <strong>#${shortOrderId}</strong> fue pagada con USD y los fondos siguen retenidos en el escrow${daysSinceFunded ? ` desde hace ${daysSinceFunded} días` : ""}.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            ${amountUsdt != null ? `<p style="margin: 5px 0 0 0;"><strong>Monto retenido:</strong> US$ ${amountUsdt} USD</p>` : ""}
          </div>
          <p style="font-size: 13px; color: #555;">
            Si ya recibiste tu producto, ingresá a la plataforma y pulsá <strong>"Recibí el producto"</strong> para liberar los fondos al vendedor.
          </p>
          <p style="font-size: 13px; color: #b45309;">
            Si no confirmás la recepción, la plataforma podrá liberar los fondos al vendedor luego de la verificación correspondiente.
          </p>
        </div>
      `,
    });
    if (error) console.error("Error email recordatorio escrow al comprador:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendEscrowReleaseReminderToBuyer:", err);
  }
};

/**
 * 14. NOTIFICACIÓN AL VENDEDOR (El escrow fue liberado / el comprador confirmó
 * la recepción). Fondos enviados a su wallet.
 */
export const sendEscrowReleasedToVendor = async ({
  vendorEmail,
  orderId,
  sellerNetUsd,
  txHash,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `Escrow liberado - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tus fondos fueron liberados!</h2>
          <p>El escrow de la orden <strong>#${shortOrderId}</strong> fue liberado y los USD ya fueron enviados a tu billetera.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            ${sellerNetUsd != null ? `<p style="margin: 5px 0 0 0;"><strong>Monto recibido (neto):</strong> US$ ${sellerNetUsd} USD</p>` : ""}
            ${txHash ? `<p style="margin: 5px 0 0 0; font-size: 12px;"><strong>Tx:</strong> <code>${txHash}</code></p>` : ""}
          </div>
          <p style="font-size: 13px; color: #555;">Podés ver el detalle completo en tu panel, sección <strong>"Mis Ventas"</strong>.</p>
        </div>
      `,
    });
    if (error) console.error("Error email escrow liberado al vendedor:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendEscrowReleasedToVendor:", err);
  }
};

/**
 * 15. NOTIFICACIÓN AL COMPRADOR (El escrow fue reembolsado a su billetera).
 */
export const sendEscrowRefundedToBuyer = async ({
  buyerEmail,
  orderId,
  amountUsdt,
  txHash,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `Reembolso procesado - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu reembolso fue enviado</h2>
          <p>La orden <strong>#${shortOrderId}</strong> fue cancelada y los USD del escrow fueron devueltos a tu billetera.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            ${amountUsdt != null ? `<p style="margin: 5px 0 0 0;"><strong>Monto reembolsado:</strong> US$ ${amountUsdt} USD</p>` : ""}
            ${txHash ? `<p style="margin: 5px 0 0 0; font-size: 12px;"><strong>Tx:</strong> <code>${txHash}</code></p>` : ""}
          </div>
        </div>
      `,
    });
    if (error) console.error("Error email reembolso escrow al comprador:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendEscrowRefundedToBuyer:", err);
  }
};

/**
 * 16. NOTIFICACIÓN AL COMPRADOR (El pedido está listo para retirar en sucursal).
 */
export const sendPickupReadyToBuyer = async ({
  buyerEmail,
  orderId,
  pickupLocation = {},
  note,
  amount,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const loc = pickupLocation || {};
    const addressLine = [loc.street, loc.streetNumber].filter(Boolean).join(" ");
    const cityLine = [loc.city, loc.state].filter(Boolean).join(", ");
    const where = loc.name || addressLine || "la sucursal del vendedor";

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `🎉 ¡Tu pedido está listo para retirar! Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">¡Tu pedido te espera!</h2>
          <p>El vendedor marcó la orden <strong>#${shortOrderId}</strong> como lista para retirar en sucursal.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #333;">Punto de retiro:</p>
            <p style="margin: 5px 0;"><strong>${where}</strong></p>
            ${addressLine ? `<p style="margin: 3px 0; color: #555;">${addressLine}${cityLine ? ` — ${cityLine}` : ""}</p>` : ""}
            ${loc.zipcode ? `<p style="margin: 3px 0; color: #555;">CP ${loc.zipcode}</p>` : ""}
            ${loc.hours ? `<p style="margin: 8px 0 3px 0;"><strong>Horarios:</strong> ${loc.hours}</p>` : ""}
            ${loc.references ? `<p style="margin: 3px 0;"><strong>Referencias:</strong> ${loc.references}</p>` : ""}
            ${note ? `<p style="margin: 10px 0 0 0; border-top: 1px solid #e4e4e7; padding-top: 8px;"><strong>Nota del vendedor:</strong> ${note}</p>` : ""}
          </div>

          <p>Cuando retires tu pedido, confirmá la recepción desde la plataforma para completar la compra.</p>
          ${amount != null ? `<p style="color: #555; font-size: 13px;">Total de la orden: <strong>$${amount}</strong></p>` : ""}
        </div>
      `,
    });
    if (error) console.error("Error email pickup-ready al comprador:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendPickupReadyToBuyer:", err);
  }
};

/**
 * 17. NOTIFICACIÓN AL COMPRADOR (El vendedor confirmó la entrega en sucursal).
 */
export const sendPickupConfirmedToBuyer = async ({
  buyerEmail,
  orderId,
  amount,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `✅ Entrega registrada - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Entrega registrada</h2>
          <p>El vendedor registró la entrega de la orden <strong>#${shortOrderId}</strong> en la sucursal.</p>
          <p>Si ya retiraste tu pedido, confirmá la recepción desde la plataforma para completar la compra y liberar los fondos.</p>
          ${amount != null ? `<p style="color: #555; font-size: 13px;">Total de la orden: <strong>$${amount}</strong></p>` : ""}
        </div>
      `,
    });
                if (error) console.error("Error email pickup-confirmed al comprador:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendPickupConfirmedToBuyer:", err);
  }
};

/**
 * 18. NOTIFICACIÓN AL ADMIN (Un usuario reportó un problema en una orden).
 * El comprador o el vendedor describen el inconveniente libremente desde el
 * detalle de la orden. NO cambia el estado de la orden ni toca el colateral:
 * sólo avisa al admin para que catalogue el caso (disputa) y lo resuelva a
 * mano. El mensaje completo del usuario se incluye en el correo.
 */
export const sendAdminOrderIssueReport = async ({
  adminEmail,
  orderId,
  reporterRole,
  reporterName,
  orderStatus,
  amount,
  message,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const safeMessage = String(message || "").slice(0, 2000);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [adminEmail],
      subject: `Problema reportado - Orden #${shortOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Un usuario reportó un problema</h2>
          <p>El <strong>${reporterRole}</strong>${reporterName ? ` <strong>${reporterName}</strong>` : ""} reportó un inconveniente en la orden <strong>#${shortOrderId}</strong>.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 6px 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            <p style="margin: 0 0 6px 0;"><strong>Estado actual:</strong> ${orderStatus || "—"}</p>
            ${amount != null ? `<p style="margin: 0 0 6px 0;"><strong>Importe:</strong> $${amount} ARS</p>` : ""}
            <p style="margin: 0 0 6px 0;"><strong>Reportado por:</strong> ${reporterRole}</p>
          </div>

          <div style="background-color: #fffbeb; border: 1px solid #fcd34d; padding: 14px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #92400e;">Mensaje del usuario:</p>
            <p style="margin: 0; font-size: 13px; color: #7c2d12; white-space: pre-wrap;">${safeMessage}</p>
          </div>

          <p style="font-size: 13px; color: #555;">
            Ingresá al panel de administración, revisá la orden y, si corresponde, marcala
            como disputa y resolvé el caso manualmente.
          </p>
        </div>
      `,
    });
    if (error) console.error("Error email de reporte de problema al admin:", error);

    // ── Espejo en TELEGRAM (solo admin) ──
    // Reporte libre de un usuario: el admin debe leerlo antes de que escale.
    // Recortamos el mensaje para no pasarnos del límite de Telegram.
    notifyAdmin("issue_reported", {
      header: "⚠️ <b>Problema reportado en una orden</b>",
      lines: [
        `#${shortOrderId} · estado: ${tgEsc(orderStatus || "—")}`,
        `Reportado por: ${tgEsc(reporterRole)}${reporterName ? ` (${tgEsc(reporterName)})` : ""}`,
        `Mensaje: ${tgEsc(String(message || "").slice(0, 500))}`,
      ],
      data: { orderId },
    }).catch(() => {});

    return { data, error };
  } catch (err) {
    console.error("Exception en sendAdminOrderIssueReport:", err);
  }
};


/**
 * 19. NOTIFICACIÓN AL COMPRADOR (El admin abrió una disputa en la orden).
 * Avisa que el equipo de soporte puso la orden en revisión y que se resolverá
 * a la brevedad. No mueve fondos: es solo comunicación del estado de disputa.
 */
export const sendDisputeOpenedToBuyer = async ({
  buyerEmail,
  orderId,
  amount,
  description,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const safeDesc = String(description || "").slice(0, 2000);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [buyerEmail],
      subject: `Tu orden #${shortOrderId} está en revisión (disputa)`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Tu orden está en revisión</h2>
          <p>El equipo de soporte puso la orden <strong>#${shortOrderId}</strong> en <strong>disputa</strong> para revisarla en detalle.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 6px 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            ${amount != null ? `<p style="margin: 0 0 6px 0;"><strong>Importe:</strong> $${amount} ARS</p>` : ""}
            ${safeDesc ? `<p style="margin: 0;"><strong>Motivo:</strong> ${safeDesc}</p>` : ""}
          </div>

          <p style="font-size: 13px; color: #555;">
            Durante la revisión, un operador analizará el caso y se contactará con vos si
            necesita más información. No es necesario que hagas nada por ahora.
          </p>
          <p style="font-size: 13px; color: #555;">
            Podés seguir el estado en tu panel, sección <strong>"Mis Compras"</strong>.
          </p>
        </div>
      `,
    });
    if (error) console.error("Error email disputa abierta al comprador:", error);

    // ── Espejo en TELEGRAM (solo admin) ──
    // Se manda desde el espejo del COMPRADOR (el doc llama a los dos helpers en
    // adminOpenDispute), así no duplicamos: el de vendedor NO notifica.
    notifyAdmin("dispute_opened", {
      header: "⚖️ <b>Disputa abierta</b>",
      lines: [
        `#${shortOrderId}${amount != null ? ` · $${amount} ARS` : ""}`,
        safeDesc ? `Motivo: ${tgEsc(safeDesc.slice(0, 400))}` : "Sin descripción.",
      ].filter(Boolean),
      data: { orderId },
    }).catch(() => {});

    return { data, error };
  } catch (err) {
    console.error("Exception en sendDisputeOpenedToBuyer:", err);
  }
};

/**
 * 20. NOTIFICACIÓN AL VENDEDOR (El admin abrió una disputa en la orden).
 */
export const sendDisputeOpenedToVendor = async ({
  vendorEmail,
  orderId,
  amount,
  description,
}) => {
  try {
    const shortOrderId = String(orderId).slice(-6).toUpperCase();
    const safeDesc = String(description || "").slice(0, 2000);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [vendorEmail],
      subject: `Una de tus ventas #${shortOrderId} está en revisión (disputa)`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #111;">Una venta está en revisión</h2>
          <p>El equipo de soporte puso la orden <strong>#${shortOrderId}</strong> en <strong>disputa</strong> para revisarla en detalle.</p>

          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 0 0 6px 0;"><strong>Número de orden:</strong> #${shortOrderId}</p>
            ${amount != null ? `<p style="margin: 0 0 6px 0;"><strong>Importe:</strong> $${amount} ARS</p>` : ""}
            ${safeDesc ? `<p style="margin: 0;"><strong>Motivo:</strong> ${safeDesc}</p>` : ""}
          </div>

          <p style="font-size: 13px; color: #555;">
            Durante la revisión, un operador analizará el caso y se contactará con vos si
            necesita más información. No es necesario que hagas nada por ahora.
          </p>
          <p style="font-size: 13px; color: #555;">
            Podés seguir el estado en tu panel, sección <strong>"Mis Ventas"</strong>.
          </p>
        </div>
      `,
    });
    if (error) console.error("Error email disputa abierta al vendedor:", error);
    return { data, error };
  } catch (err) {
    console.error("Exception en sendDisputeOpenedToVendor:", err);
  }
};
