import Product from "../models/Product.js";
import { poolContract } from "./blockchainService.js"; // Tu instancia de ethers conectada al contrato
import ethers from "ethers";

/**
 * Revisa el colateral disponible real en la blockchain para un vendedor
 * y pausa sus productos si no cuenta con respaldo suficiente.
 */
export const verifyAndSyncVendorProducts = async (vendorAddress, sellerId) => {
  try {
    console.log(`[Sync] Sincronizando productos para el vendedor: ${vendorAddress}`);

    // 1. Consultamos el estado real del vendedor DIRECTO en la blockchain
    const vendorData = await poolContract.vendors(vendorAddress);
    
    // Convertimos los BigInt de la blockchain a números legibles (USDT)
    const totalCollateral = parseFloat(ethers.formatUnits(vendorData.totalCollateral, 18));
    const lockedCollateral = parseFloat(ethers.formatUnits(vendorData.lockedCollateral, 18));
    
    const disponibleUSD = totalCollateral - lockedCollateral;
    console.log(`[Sync] Vendedor disponible: $${disponibleUSD} USDT (Total: ${totalCollateral}, Bloqueado: ${lockedCollateral})`);

    // 2. Buscamos todos los productos ACTIVOS de este vendedor
    const activeProducts = await Product.find({ seller: sellerId, status: "active" });

    for (const product of activeProducts) {
      // Si el precio del producto es mayor a lo que el vendedor tiene libre de colateral...
      if (product.price > disponibleUSD) {
        console.warn(`[Sync] Pausando producto "${product.name}" ($${product.price}) por falta de colateral del vendedor.`);
        
        product.status = "paused";
        // Opcional: Podés agregar una propiedad oculta para saber por qué se pausó
        product.pauseReason = "insufficient_collateral"; 
        await product.save();
      }
    }

    // 3. [Opcional] Lógica inversa: Si el tipo depositó más plata, reactivar lo que estaba pausado por colateral
    const pausedProducts = await Product.find({ seller: sellerId, status: "paused", pauseReason: "insufficient_collateral" });
    for (const product of pausedProducts) {
      if (product.price <= disponibleUSD) {
        console.log(`[Sync] Reactivando producto "${product.name}". El vendedor vuelve a tener colateral.`);
        product.status = "active";
        product.pauseReason = undefined;
        await product.save();
      }
    }

  } catch (error) {
    console.error(`[Sync Error] Error al sincronizar colateral/productos para ${vendorAddress}:`, error.message);
  }
};