/**
 * Diagnóstico: consulta el saldo real de garantía de un vendedor en el contrato
 * actual (el del .env del backend) y lo contrasta con lo que una orden
 * intentaría congelar.
 *
 * Uso:
 *   node scripts/checkVendorBalance.mjs <walletDelVendedor> [montoARevisar]
 *
 * Ejemplo:
 *   node scripts/checkVendorBalance.mjs 0xabc... 50
 */
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const wallet = process.argv[2];
const amountToCheck = process.argv[3];

if (!wallet) {
  console.error("➡️  Uso: node scripts/checkVendorBalance.mjs <walletDelVendedor> [montoARevisar]");
  process.exit(1);
}

const contractAddress = process.env.CONTRACT_ADDRESS;
const abi = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../contracts/NeroCollateralABI.json"), "utf8")
);
const provider = new ethers.JsonRpcProvider(
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com"
);
const contract = new ethers.Contract(contractAddress, abi, provider);

console.log("━ Diagnóstico de garantía de vendedor ━");
console.log("Contrato   :", contractAddress);
console.log("Vendedor   :", wallet);
console.log("");

try {
  const vendor = await contract.vendors(wallet);
  const total = ethers.formatUnits(vendor.totalCollateral, 18);
  const locked = ethers.formatUnits(vendor.lockedCollateral, 18);
  const available = Number(total) - Number(locked);

  console.log("totalCollateral :", total, "USDT");
  console.log("lockedCollateral:", locked, "USDT");
  console.log("AVAILABLE       :", available.toFixed(6), "USDT");
  console.log("");

  if (amountToCheck) {
    const enough = available >= Number(amountToCheck);
    console.log(`Monto a congelar: ${amountToCheck} USDT`);
    console.log(enough ? "✅ ALCANZA" : "❌ NO ALCANZA (saldo disponible insuficiente)");
  }
} catch (error) {
  console.error("❌ Error al leer vendors() del contrato:", error.reason || error.message);
  console.error("POSIBLE CAUSA: el ABI no coincide con el contrato desplegado,");
  console.error("o la dirección del contrato no es la esperada.");
}
console.log("");
console.log("Recordá: el backend usa CONTRACT_ADDRESS del .env del BACKEND.");
console.log("El front usa VITE_COLLATERAL_CONTRACT_ADDRESS del .env del FRONT.");
console.log("⚠️  Ambos deben apuntar al MISMO contrato (0xD45f0E57C501A8fa234F5d9357b30F7cf7B46E5d).");
console.log("");
console.log("También verificá que seller.walletAddress en la DB sea IGUAL a la wallet");
console.log("de Privy que depositó la garantía (la que ve el CollateralManager).");
