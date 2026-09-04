// scripts/deployCollateral.js
// Despliega el NeroCollateral CORREGIDO en BSC Testnet usando ethers + WALLET_PK.
// Después actualiza CONTRACT_ADDRESS en backend/.env.
// Precondición: correr antes scripts/compileCollateral.js (genera build/NeroCollateral.json).
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const buildPath = path.resolve(__dirname, "../build/NeroCollateral.json");
if (!fs.existsSync(buildPath)) {
  console.error("No existe build/NeroCollateral.json. Corré primero: node scripts/compileCollateral.js");
  process.exit(1);
}
const { abi, bytecode } = JSON.parse(fs.readFileSync(buildPath, "utf8"));

const PROVIDER_URL = process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const PRIVATE_KEY = process.env.WALLET_PK || process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Falta WALLET_PK / PRIVATE_KEY en el .env.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

async function main() {
  const deployerAddress = wallet.address;
  const bal = await provider.getBalance(deployerAddress);
  console.log("▶ Desplegando con cuenta :", deployerAddress);
  console.log("  BNB testnet disponible  :", ethers.formatEther(bal));
  console.log("");

  if (bal === 0n) {
    console.error("✗ La wallet no tiene BNB en testnet. No se puede pagar gas.");
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log("  Desplegando NeroCollateral ...");
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  console.log("  Tx de deploy             :", tx.hash);
  const receipt = await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("✔ Desplegado en           :", addr);
  console.log("  Gas usado (bloque)       :", receipt.blockNumber ?? "n/a");

  // ---- Actualizar CONTRACT_ADDRESS en backend/.env ----
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    const re = /^CONTRACT_ADDRESS\s*=.*$/m;
    const line = `CONTRACT_ADDRESS = "${addr}"`;
    env = re.test(env) ? env.replace(re, line) : env.trimEnd() + "\n" + line + "\n";
    fs.writeFileSync(envPath, env, "utf8");
    console.log("✔ CONTRACT_ADDRESS actualizada en .env del backend.");
  } else {
    console.warn("⚠ No se halló .env del backend para actualizar CONTRACT_ADDRESS.");
  }

  console.log("");
  console.log("✅ Listo. NUEVO NeroCollateral:", addr);
  console.log("⚠ Actualizá también en frontend/.env la variable");
  console.log("   VITE_COLLATERAL_CONTRACT_ADDRESS = " + addr);
  return addr;
}

main().catch((err) => {
  console.error("Error global:", err);
  process.exit(1);
});
