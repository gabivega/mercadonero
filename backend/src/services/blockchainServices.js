// backend/src/services/blockchainService.js
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, "../../contracts/NeroCollateralABI.json");
const contractABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

// CONFIGURACIÓN DEL ENTORNO
const PROVIDER_URL = "https://bsc-testnet-rpc.publicnode.com"; 
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Dirección del Pool
const PRIVATE_KEY = process.env.WALLET_PK; // Clave privada de la wallet Admin
const USDT_TESTNET_ADDRESS = process.env.USDT_TESTNET_ADDRESS;

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
// console.log("provider", provider)
const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
// console.log("adminWallet", adminWallet)
const poolContract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, adminWallet);
// console.log("poolContract", poolContract)

/**
 * ACCIÓN 1: BLOQUEAR COLATERAL (Se ejecuta al crearse la orden P2P)
 */
export async function lockVendorCollateral(orderId, vendorAddress, amountInTokens) {
  try {
    console.log(`[Blockchain] Solicitando bloqueo de ${amountInTokens} USDT para Orden: ${orderId}...`);
    
    // Convertimos a Wei (18 decimales para este USDT de testnet)
    const amountInWei = ethers.parseUnits(amountInTokens.toString(), 18);

    // Llamada al método lockOrderCollateral del contrato
    const tx = await poolContract.lockOrderCollateral(orderId, vendorAddress, amountInWei);
    console.log(`[Blockchain] Tx de bloqueo enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Bloqueo confirmado en bloque: ${receipt.blockNumber}`);
    
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al bloquear colateral:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 2: LIBERAR COLATERAL Y COBRAR FEE (Flujo exitoso: comprador confirma o pasan 7 días)
 */
export async function releaseVendorCollateral(orderId, vendorAddress, montoOrden) {
  try {
    console.log(`[Blockchain] Solicitando liberación de la Orden: ${orderId}...`);
    console.log("monto orden:", montoOrden);
    // Llamada al método releaseOrderCollateral del contrato
    const feeAmountInWei = ethers.parseUnits((montoOrden * 0.03).toString(), 18);
    const tx = await poolContract.releaseOrderCollateral(orderId, vendorAddress, USDT_TESTNET_ADDRESS, feeAmountInWei);
    console.log(`[Blockchain] Tx de liberación enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Liberación confirmada en bloque: ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al liberar colateral:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN 3: CANCELAR/DESTRABAR COLATERAL SIN COMISIÓN (Para órdenes expiradas o canceladas)
 */
export async function cancelVendorCollateral(orderId, vendorAddress) {
  try {
    console.log(`[Blockchain] Solicitando desanclaje de colateral (0% fee) para Orden Expirada: ${orderId}...`);

    // Llamada al método de cancelación de tu contrato (ej: unfreezeOrderCollateral o cancelOrderCollateral)
    // Asegurate de poner el nombre exacto de la función de tu contrato que libera sin cobrar fee
    const tx = await poolContract.releaseOrderCollateral(orderId, vendorAddress, USDT_TESTNET_ADDRESS, 0);
    console.log(`[Blockchain] Tx de cancelación enviada: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Blockchain] Colateral liberado (0% fee) en bloque: ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[Blockchain Error] Fallo al cancelar colateral de orden expirada:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}