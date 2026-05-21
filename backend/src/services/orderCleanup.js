// backend/src/cron/startOrderCleanup.js
import cron from "node-cron";
import Order from "../models/Order.js";
import User from "../models/User.js"; // 👈 Necesitamos buscar al vendedor para saber su wallet
import { transitionToStatus } from "./orderHelpers.js";
import { cancelVendorCollateral } from "./blockchainServices.js"; // 👈 Importamos el servicio

// Se ejecuta cada 15 minutos (según tu schedule)
const startOrderCleanup = () => {
  cron.schedule("*/15 * * * *", async () => {
    console.log("🚀 Ejecutando cron job de limpieza de órdenes...");
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Buscamos órdenes que sigan en 'pending_payment' y tengan más de 1 hora
      const expiredOrders = await Order.find({
        status: "pending_payment",
        createdAt: { $lt: oneHourAgo },
      });

      if (expiredOrders.length === 0) {
        console.log("[Cron] No se encontraron órdenes expiradas en este ciclo.");
        return;
      }

      for (const order of expiredOrders) {
        try {
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
          
          console.log(`[Cron] Orden ${order._id} expirada y colateral devuelto al vendedor con éxito.`);

        } catch (orderError) {
          console.error(`[Cron Error] Error individual procesando orden ${order._id}:`, orderError);
        }
      }
    } catch (error) {
      console.error("Error crítico en el cleanup de órdenes:", error);
    }
  });
};

export default startOrderCleanup;