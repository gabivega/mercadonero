// backend/src/cron/startOrderCleanup.js
import cron from "node-cron";
import Order from "../models/Order.js";
import User from "../models/User.js"; // 👈 Necesitamos buscar al vendedor para saber su wallet
import { transitionToStatus } from "./orderHelpers.js";
import { cancelVendorCollateral } from "./blockchainServices.js"; // 👈 Importamos el servicio
import { expireCollateralHold } from "./collateralHoldService.js"; // 👈 Expiración de holds de colateral
import { verifyOrderFunded } from "./escrowServices.js"; // 👈 Verificamos fondeo on-chain de escrow crypto

// Se ejecuta cada 15 minutos (según tu schedule)
const startOrderCleanup = () => {
  cron.schedule("*/15 * * * *", async () => {
    console.log("🚀 Ejecutando cron job de limpieza de órdenes...");
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            // Buscamos órdenes que sigan en 'pending_payment', tengan más de 1 hora
            // y NO tengan una solicitud de cancelación o de liberación de garantía
            // pendiente (para no interferir con flujos que requieren acción manual).
            const expiredOrders = await Order.find({
              status: "pending_payment",
              createdAt: { $lt: oneHourAgo },
              "pendingRequest.exists": { $ne: true },
              "releaseRequest.exists": { $ne: true },
            });

      if (expiredOrders.length === 0) {
        console.log("[Cron] No se encontraron órdenes expiradas en este ciclo.");
        return;
      }

            for (const order of expiredOrders) {
        try {
          // ═══════════════════════════════════════════════════════
          // GUARDIA PARA PAGO CRIPTO:
          // Si la orden es de pago en criptomonedas, primero verificamos
          // on-chain si el comprador YA fondeó el escrow (aunque no haya
          // reportado el txHash al backend). En ese caso la orden NO debe
          // expirar: los USDT están retenidos en el contrato y esperan la
          // confirmación del comprador.
          // ═══════════════════════════════════════════════════════
          if (order.payment?.method === "crypto") {
            const fundedCheck = await verifyOrderFunded(order._id.toString());
            if (fundedCheck.success && fundedCheck.funded) {
              console.log(
                `[Cron] Orden crypto ${order._id} YA está fondeada on-chain (aunque no reportada). No se expira; queda al flujo de confirmación del comprador.`,
              );
              continue;
            }
            // Si el escrow NO está fondeado on-chain (comprador no abonó),
            // la orden puede expirar normalmente. (Cae al flujo de abajo.)
          }

          console.log(`[Cron] Procesando expiración para la orden: ${order._id}`);

          // 1. Buscar la wallet del vendedor de la orden
          const seller = await User.findById(order.seller);
          if (!seller || !seller.walletAddress) {
            console.error(`[Cron Error] No se pudo expirar la orden ${order._id}: Vendedor sin walletAddress en DB.`);
            continue; // Salta a la siguiente orden para no trabar el bucle
          }

          // 2. Ejecutar la liberación del colateral en Blockchain (0% Fee)
          const blockchainResult = await cancelVendorCollateral(order._id.toString(), seller.walletAddress);

          if (!blockchainResult.success) {
            console.error(`[Cron Error] Falló la transacción en blockchain para la orden ${order._id}. Se reintentará en el próximo ciclo.`);
            continue; // No hacemos la transición de estado en la DB, así el próximo cron lo vuelve a intentar
          }

          // 3. Si la blockchain dio el OK, recién ahí guardamos el estado y adjuntamos el hash
          order.releaseTxHash = blockchainResult.txHash; // Guardamos el hash de la liberación por seguridad
          
                    await transitionToStatus(
            order,
            "expired",
            "Cancelación automática por falta de pago tras 60 minutos.",
          );

          // PUNTO 5: registramos la expiración en el accounting del comprador
          // (contador de órdenes generadas pero nunca pagadas que expiraron).
          await User.findByIdAndUpdate(order.buyer, {
            $inc: { "accounting.expiredOrdersAsBuyer": 1 },
          });

                    console.log(`[Cron] Orden ${order._id} expirada y colateral devuelto al vendedor con éxito.`);

        } catch (orderError) {
          console.error(`[Cron Error] Error individual procesando orden ${order._id}:`, orderError);
        }
      }

      // ---------------------------------------------------------------
      // EXPIRACIÓN DE HOLDS DE COLATERAL ("awaiting_collateral")
      // Órdenes que quedaron esperando que el vendedor deposite colateral y
      // cuyo plazo (15 min) ya venció. No hay colateral on-chain congelado en
      // este estado, así que solo se marca la orden expirada y se registra la
      // penalización al vendedor (vía expireCollateralHold).
      // ---------------------------------------------------------------
      const expiredHolds = await Order.find({
        status: "awaiting_collateral",
        "collateralHold.status": "pending",
        "collateralHold.expiresAt": { $lt: new Date() },
      });

      for (const holdOrder of expiredHolds) {
        await expireCollateralHold(holdOrder).catch((err) =>
          console.error(`[Cron Error] Falló expirar hold ${holdOrder._id}:`, err),
        );
      }
      if (expiredHolds.length > 0) {
        console.log(`[Cron] ${expiredHolds.length} hold(s) de colateral vencidos y expirados.`);
      }
    } catch (error) {
      console.error("Error crítico en el cleanup de órdenes:", error);
    }
  });
};

export default startOrderCleanup;