/**
 * Deploy MULTICHAIN del contrato NeroCollateral usando solc-js (no depende de
 * Hardhat, que tiene problemas de tooling en este entorno).
 *
 * - Compila contracts/NeroCollateral.sol (una sola vez)
 * - Escribe contracts/NeroCollateralABI.json
 * - Deploya en la RED indicada por argumento, con la wallet del .env
 * - Actualiza la variable de .env correspondiente a esa red
 *
 * Uso:
 *   node scripts/deployCollateral.mjs                  (default: bscTestnet)
 *   node scripts/deployCollateral.mjs bscTestnet
 *   node scripts/deployCollateral.mjs baseSepolia
 *   node scripts/deployCollateral.mjs polygonAmoy
 *   node scripts/deployCollateral.mjs 84532            (también acepta chainId)
 *
 * El mismo bytecode sirve para las 3 redes: el contrato es agnóstico de red.
 * Lo que cambia por red es SOLO el token de colateral (ver config/chains.js).
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

// ────────────────────────────────────────────────────────────────────────────
// MAPA de redes soportadas para el deploy (debe coincidir con config/chains.js).
// `envVars` lista TODAS las variables de .env a setear para esa red.
// ────────────────────────────────────────────────────────────────────────────
const NETWORKS = {
  bscTestnet: {
    chainId: 97,
    rpc: process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
    explorer: "https://testnet.bscscan.com",
    nativeSymbol: "tBNB",
    decimals: 18,
    // Además de la var nueva, mantenemos CONTRACT_ADDRESS (legacy) para no
    // romper el flujo actual que la lee por defecto.
    contractEnvVars: ["COLLATERAL_CONTRACT_BSC", "CONTRACT_ADDRESS"],
  },
  baseSepolia: {
    chainId: 84532,
    rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    nativeSymbol: "ETH",
    decimals: 6, // USDC en Base
    contractEnvVars: ["COLLATERAL_CONTRACT_BASE"],
  },
  polygonAmoy: {
    chainId: 80002,
    rpc: process.env.POLYGON_AMOY_RPC || "https://polygon-amoy-bor-rpc.publicnode.com",
    explorer: "https://amoy.polygonscan.com",
    nativeSymbol: "POL",
    decimals: 6, // USDXM en Amoy
    contractEnvVars: ["COLLATERAL_CONTRACT_POLYGON"],
  },
};

// Resolvemos la red destino desde argv (por key o por chainId).
const argRaw = (process.argv[2] || "bscTestnet").trim();
let netKey = argRaw;
if (!NETWORKS[netKey]) {
  const byId = Object.entries(NETWORKS).find(
    ([, n]) => String(n.chainId) === argRaw,
  );
  if (byId) netKey = byId[0];
}
const NETWORK = NETWORKS[netKey];
if (!NETWORK) {
  console.error(
    `❌ Red desconocida: "${argRaw}". Opciones: ${Object.keys(NETWORKS).join(", ")} ` +
      `(o sus chainId ${Object.values(NETWORKS).map((n) => n.chainId).join(", ")}).`,
  );
  process.exit(1);
}

const PRIVATE_KEY = process.env.WALLET_PK || process.env.PRIVATE_KEY;

// ---------- 1. COMPILAR ----------
const sourcePath = path.join(rootDir, "contracts", "NeroCollateral.sol");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: { "NeroCollateral.sol": { content: source } },
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

const contractFile = output.contracts["NeroCollateral.sol"].NeroCollateral;
const abi = contractFile.abi;
const bytecode = "0x" + contractFile.evm.bytecode.object;

// Guardamos / actualizamos el ABI (es el mismo para todas las redes)
const abiPath = path.join(rootDir, "contracts", "NeroCollateralABI.json");
fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2), "utf8");
console.log("✅ ABI guardado en contracts/NeroCollateralABI.json (" + abi.length + " entradas)");

// ---------- 2. DEPLOY ----------
if (!PRIVATE_KEY) {
  console.error("❌ Falta WALLET_PK (o PRIVATE_KEY) en .env");
  process.exit(1);
}

console.log(`\n🌐 Red destino: ${netKey} (chainId ${NETWORK.chainId})`);
console.log(`   RPC: ${NETWORK.rpc}`);

const provider = new ethers.JsonRpcProvider(NETWORK.rpc, NETWORK.chainId, {
  staticNetwork: true,
});
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log("Deployando desde:", wallet.address);

const balance = await provider.getBalance(wallet.address);
console.log(`Balance ${NETWORK.nativeSymbol}:`, ethers.formatEther(balance));

if (balance < ethers.parseEther("0.001")) {
  console.warn(
    `⚠️  El balance de ${NETWORK.nativeSymbol} es bajo. Asegúrate de tener gas para el deploy.`,
  );
}

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy();
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log("🎉 NeroCollateral deployado en:", address);

// ---------- 3. ACTUALIZAR .env ----------
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, "utf8");
  const updated = [];
  for (const varName of NETWORK.contractEnvVars) {
    const regex = new RegExp(`^\\s*${varName}\\s*=.*$`, "m");
    const line = `${varName} = "${address}"`;
    if (regex.test(env)) {
      env = env.replace(regex, line);
    } else {
      env = env.trimEnd() + "\n" + line + "\n";
    }
    updated.push(varName);
  }
  fs.writeFileSync(envPath, env, "utf8");
  console.log(`✅ Actualizadas en .env: ${updated.join(", ")}`);
} else {
  console.warn("⚠️  No se encontró .env; seteá manualmente la dirección del contrato.");
}

console.log("\n--- RESUMEN ---");
console.log("Contract :", address);
console.log("Admin    :", wallet.address, "(será el admin del contrato)");
console.log("Network  :", netKey, "(chainId " + NETWORK.chainId + ")");
console.log("Decimals :", NETWORK.decimals, "(token de colateral de esta red)");
console.log(`\nVer en explorer: ${NETWORK.explorer}/address/${address}`);
