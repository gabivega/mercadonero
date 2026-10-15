import Product from "../models/Product.js";
import { getVendorCollateralMultiChain } from "./blockchainServices.js";

/**
 * Revisa el colateral disponible real en la blockchain para un vendedor
 * y pausa sus productos si no cuenta con respaldo suficiente.
 *
 * MULTICHAIN: el disponible se calcula como la SUMA del saldo libre del
 * vendedor en TODAS las redes configuradas (ver getVendorCollateralMultiChain).
 * Opcionalmente se puede pasar un `chainId` para evaluar solo una red.
 */
export const verifyAndSyncVendorProducts = async (
  vendorAddress,
  sellerId,
  chainId = null,
) => {
  try {
    console.log(`[Sync] Sincronizando productos para el vendedor: ${vendorAddress}`);

    // 1. Consultamos el estado real del vendedor en la blockchain.
    //    Si se pidió una red puntual, leemos solo esa; si no, sumamos todas.
    let disponibleUSD = 0;
    if (chainId) {
      const { getVendorCollateral } = await import("./blockchainServices.js");
      const vendorData = await getVendorCollateral(vendorAddress, chainId);
      disponibleUSD = vendorData.success ? vendorData.available : 0;
    } else {
      const multi = await getVendorCollateralMultiChain(vendorAddress);
      disponibleUSD = multi.success ? multi.totalAvailable : 0;
    }
    console.log(`[Sync] Vendedor disponible (multichain): $${disponibleUSD}`);

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