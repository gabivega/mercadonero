import cron from "node-cron";
import Order from "../models/Order.js";
import { transitionToStatus } from "./orderHelpers.js";

// Se ejecuta cada 5 minutos
const startOrderCleanup = () => {
  cron.schedule("*/15 * * * *", async () => {
    console.log("ejecutando cron job ");
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Buscamos órdenes que sigan en 'pending' y tengan más de 1 hora
      const expiredOrders = await Order.find({
        status: "pending_payment",
        createdAt: { $lt: oneHourAgo },
      });

      for (const order of expiredOrders) {
        await transitionToStatus(
          order,
          "expired",
          "Cancelación automática por falta de pago tras 60 minutos.",
        );
      }
    } catch (error) {
      console.error("Error en el cleanup de órdenes:", error);
    }
  });
};

export default startOrderCleanup;
