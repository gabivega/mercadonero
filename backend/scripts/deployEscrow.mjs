/**
 * Deploy MULTICHAIN del contrato NeroEscrow usando solc-js (mismo enfoque que
 * deployCollateral.mjs; no depende de Hardhat).
 *
 * - Compila contracts/NeroEscrow.sol (una sola vez)
 * - Escribe contracts/NeroEscrowABI.json
 * - Deploya en la RED indicada por argumento, con la wallet del .env
 * - Actualiza las variables de .env correspondientes a esa red
 *
 * El mismo bytecode sirve para las 3 redes: NeroEscrow es agnóstico de red.
 * `fundOrder(orderId, buyer, seller, tokenAddress, amount)` acepta CUALQUIER
 * ERC-20, así que un mismo deploy puede cobrar USDT (BSC), USDC (Base) o USDXM
 * (Polygon). Lo que cambia por red es SOLO qué token usa el comprador.
 *
 * Uso:
 *   node scripts/deployEscrow.mjs                  (default: polygonAmoy)
 *   node scripts/deployEscrow.mjs bscTestnet
 *   node scripts/deployEscrow.mjs baseSepolia
 *   node scripts/deployEscrow.mjs polygonAmoy
 *   node scripts/deployEscrow.mjs 84532            (también acepta chainId)
 *
 * Requiere saldo nativo (POL/ETH/tBNB) en la wallet de deploy en esa red.
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
// `envVars` lista TODAS las variables de .env a setear para esa red:
//   - <contractEnv>       la address del contrato NeroEscrow de esa red
//   - <tokenEnv>          el token de pago de esa red (USDT/USDC/USDXM)
//   - <modeEnv>           "token" (pagar con stablecoin) o "native" (POL/ETH)
//   - <symbolEnv>/<decEnv> símbolo y decimales del token de pago
// ────────────────────────────────────────────────────────────────────────────
const NETWORKS = {
  bscTestnet: {
    chainId: 97,
    key: "bscTestnet",
    rpc: process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
    explorer: "https://testnet.bscscan.com",
    nativeSymbol: "tBNB",
    // Dirección del ERC-20 de pago en esta red (USDT testnet, 18 dec).
    token: {
      address:
        process.env.ESCROW_TOKEN_BSC ||
        process.env.USDT_TOKEN_ADDRESS ||
        process.env.USDT_TESTNET_ADDRESS ||
        "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
      symbol: process.env.ESCROW_TOKEN_SYMBOL_BSC || "USDT",
      decimals: Number(process.env.ESCROW_TOKEN_DECIMALS_BSC || 18),
    },
    envVars: {
      ESCROW_CONTRACT_BSC: "contract",
      ESCROW_TOKEN_BSC: "token",
      ESCROW_TOKEN_SYMBOL_BSC: "symbol",
      ESCROW_TOKEN_DECIMALS_BSC: "decimals",
      // BSC se fondea SIEMPRE por token (legacy); mantenemos el modo explícito.
      ESCROW_FUNDING_MODE_BSC: "__mode:token",
    },
  },
  baseSepolia: {
    chainId: 84532,
    key: "baseSepolia",
    rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    nativeSymbol: "ETH",
    // USDC de Circle en Base Sepolia (6 decimales).
    token: {
      address:
        process.env.ESCROW_TOKEN_BASE ||
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      symbol: process.env.ESCROW_TOKEN_SYMBOL_BASE || "USDC",
      decimals: Number(process.env.ESCROW_TOKEN_DECIMALS_BASE || 6),
    },
    envVars: {
      ESCROW_CONTRACT_BASE: "contract",
      ESCROW_TOKEN_BASE: "token",
      ESCROW_TOKEN_SYMBOL_BASE: "symbol",
      ESCROW_TOKEN_DECIMALS_BASE: "decimals",
      // El comprador paga con USDC (stablecoin), NO con ETH.
      ESCROW_FUNDING_MODE_BASE: "__mode:token",
    },
  },
  polygonAmoy: {
    chainId: 80002,
    key: "polygonAmoy",
    rpc:
      process.env.POLYGON_AMOY_RPC ||
      "https://polygon-amoy-bor-rpc.publicnode.com",
    explorer: "https://amoy.polygonscan.com",
    nativeSymbol: "POL",
    // En Amoy el stable de prueba es USDXM (6 decimales).
    token: {
      address:
        process.env.ESCROW_TOKEN_POLYGON ||
        process.env.COLLATERAL_TOKEN_POLYGON ||
        "0x14196F08a4Fa0B66B7331bC40dd6bCd8A1dEeA9F",
      symbol: process.env.ESCROW_TOKEN_SYMBOL_POLYGON || "USDXM",
      decimals: Number(process.env.ESCROW_TOKEN_DECIMALS_POLYGON || 6),
    },
    envVars: {
      ESCROW_CONTRACT_POLYGON: "contract",
      ESCROW_TOKEN_POLYGON: "token",
      ESCROW_TOKEN_SYMBOL_POLYGON: "symbol",
      ESCROW_TOKEN_DECIMALS_POLYGON: "decimals",
      // El comprador paga con USDXM (stablecoin), NO con POL.
      ESCROW_FUNDING_MODE_POLYGON: "__mode:token",
    },
  },
};

// Resolvemos la red destino desde argv (por key o por chainId).
const argRaw = (process.argv[2] || "polygonAmoy").trim();
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
  output.errors
    .filter((e) => e.severity === "warning")
    .forEach((e) => console.warn("⚠️ ", e.formattedMessage));
}

const contractFile = output.contracts["NeroEscrow.sol"].NeroEscrow;
const abi = contractFile.abi;
const bytecode = "0x" + contractFile.evm.bytecode.object;

// Guardamos / actualizamos el ABI (es el mismo para todas las redes).
const abiPath = path.join(rootDir, "contracts", "NeroEscrowABI.json");
fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2), "utf8");
console.log(
  "✅ ABI guardado en contracts/NeroEscrowABI.json (" + abi.length + " entradas)",
);

// ---------- 2. DEPLOY ----------
if (!PRIVATE_KEY) {
  console.error("❌ Falta WALLET_PK (o PRIVATE_KEY) en .env");
  process.exit(1);
}

console.log(`\n🌐 Red destino: ${netKey} (chainId ${NETWORK.chainId})`);
console.log(`   RPC: ${NETWORK.rpc}`);
console.log(
  `   Token de pago: ${NETWORK.token.symbol} (${NETWORK.token.address}, ${NETWORK.token.decimals} dec)`,
);

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
console.log("🎉 NeroEscrow deployado en:", address);

// ---------- 3. ACTUALIZAR .env ----------
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, "utf8");
  const updated = [];

  // Mapa de valores por tipo de variable.
  const valueFor = (kind) => {
    // Modo de fondeo: el valor se especifica inline como "__mode:<token|native>".
    if (kind.startsWith("__mode:")) return kind.slice("__mode:".length);
    switch (kind) {
      case "contract":
        return address;
      case "token":
        return NETWORK.token.address;
      case "symbol":
        return NETWORK.token.symbol;
      case "decimals":
        return String(NETWORK.token.decimals);
      default:
        return kind;
    }
  };

  for (const [varName, kind] of Object.entries(NETWORK.envVars)) {
    const regex = new RegExp(`^\\s*${varName}\\s*=.*$`, "m");
    const line = `${varName} = "${valueFor(kind)}"`;
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
console.log("Network  :", netKey, "(chainId " + NETWORK.chainId + ")");
console.log("Contract :", address);
console.log("Token    :", NETWORK.token.symbol, NETWORK.token.address);
console.log("Admin    :", wallet.address, "(será el admin del contrato)");
console.log("FeeBps   :", 300, "(3% por defecto, settable por admin)");
console.log(`\nVer en explorer: ${NETWORK.explorer}/address/${address}`);
