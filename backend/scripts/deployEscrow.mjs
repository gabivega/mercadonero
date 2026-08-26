/**
 * Deploy del contrato NeroEscrow usando solc-js (mismo enfoque que deployCollateral).
 *
 * - Compila contracts/NeroEscrow.sol
 * - Escribe contracts/NeroEscrowABI.json
 * - Deploya en BSC Testnet con la wallet del .env
 * - Actualiza ESCROW_CONTRACT_ADDRESS en .env
 *
 * Uso:
 *   node scripts/deployEscrow.mjs
 */
import solc from "solc";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const PROVIDER_URL = process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const PRIVATE_KEY = process.env.WALLET_PK || process.env.PRIVATE_KEY;
const chainId = 97;

// ---------- 1. COMPILAR ----------
const sourcePath = path.join(rootDir, "contracts", "NeroEscrow.sol");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: { "NeroEscrow.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === "error");
  if (errors.length) {
    console.error("❌ Errores de compilación:");
    errors.forEach((e) => console.error("   ", e.formattedMessage));
    throw new Error("Compilación fallida");
  }
  // warnings
  output.errors
    .filter((e) => e.severity === "warning")
    .forEach((e) => console.warn("⚠️ ", e.formattedMessage));
}

const contractFile = output.contracts["NeroEscrow.sol"].NeroEscrow;
const abi = contractFile.abi;
const bytecode = "0x" + contractFile.evm.bytecode.object;

// Guardamos / actualizamos el ABI
const abiPath = path.join(rootDir, "contracts", "NeroEscrowABI.json");
fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2), "utf8");
console.log("✅ ABI guardado en contracts/NeroEscrowABI.json (" + abi.length + " entradas)");

// ---------- 2. DEPLOY ----------
if (!PRIVATE_KEY) {
  console.error("❌ Falta WALLET_PK (o PRIVATE_KEY) en .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log("Deployando desde:", wallet.address);

const balance = await provider.getBalance(wallet.address);
console.log("Balance BNB (tBNB):", ethers.formatEther(balance));

if (balance < ethers.parseEther("0.01")) {
  console.warn("⚠️  El balance de tBNB es bajo. Asegúrate de que la wallet tenga tBNB para el gas.");
}

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy();
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log("🎉 NeroEscrow deployado en:", address);

// ---------- 3. ACTUALIZAR .env ----------
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, "utf8");
  // ESCROW_CONTRACT_ADDRESS
  const escrowRegex = /^ESCROW_CONTRACT_ADDRESS\s*=.*$/m;
  const escrowLine = `ESCROW_CONTRACT_ADDRESS = "${address}"`;
  env = escrowRegex.test(env) ? env.replace(escrowRegex, escrowLine) : env + "\n" + escrowLine;

  // feeBps predeterminado (3%) por claridad
  const feeRegex = /^ESCROW_FEE_BPS\s*=.*$/m;
  const feeLine = `ESCROW_FEE_BPS = 300`;
  env = feeRegex.test(env) ? env.replace(feeRegex, feeLine) : env + "\n" + feeLine;

  fs.writeFileSync(envPath, env, "utf8");
  console.log("✅ ESCROW_CONTRACT_ADDRESS actualizada en .env");
}

console.log("\n--- RESUMEN ---");
console.log("Contract :", address);
console.log("Admin    :", wallet.address, "(será el admin del contrato)");
console.log("FeeBps   :", 300, "(3% por defecto)");
console.log("Network  : BSC Testnet (chainId " + chainId + ")");
console.log("\nVer en explorer: https://testnet.bscscan.com/address/" + address);
console.log("\n⚠️  El frontend debe usar VITE_ESCROW_CONTRACT_ADDRESS apuntando a este contrato.");
