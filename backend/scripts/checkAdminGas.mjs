// backend/scripts/checkAdminGas.mjs
// ────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO: balance de gas (moneda nativa) de la wallet ADMIN del backend
// en cada red configurada.
//
// CONTEXTO: el congelamiento/liberación de colateral lo firma la wallet ADMIN
// (WALLET_PK del backend) — NO la wallet del usuario. Si esa wallet no tiene
// gas nativo (POL/ETH/BNB) en la red elegida, el lock falla con:
//   "insufficient funds for gas * price + value"
//
// Uso:
//   node scripts/checkAdminGas.mjs
//
// Requiere las mismas env del backend (.env): WALLET_PK / PRIVATE_KEY y los
// RPC de cada red.
// ────────────────────────────────────────────────────────────────────────────

import { ethers } from "ethers";
import dotenv from "dotenv";
import { CHAINS, SUPPORTED_CHAIN_IDS } from "../src/config/chains.js";

dotenv.config();

const PRIVATE_KEY = process.env.WALLET_PK || process.env.PRIVATE_KEY;

async function main() {
  if (!PRIVATE_KEY) {
    console.error("❌ Falta WALLET_PK (o PRIVATE_KEY) en el .env del backend.");
    process.exit(1);
  }

  let adminAddress;
  try {
    adminAddress = new ethers.Wallet(PRIVATE_KEY).address;
  } catch (e) {
    console.error("❌ WALLET_PK inválida:", e.message);
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("DIAGNÓSTICO DE GAS — WALLET ADMIN DEL BACKEND");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Admin (WALLET_PK):", adminAddress);
  console.log("");

  for (const chainId of SUPPORTED_CHAIN_IDS) {
    const chain = CHAINS[chainId];
    const line = `• ${chain.name} (${chain.chainId}) [${chain.nativeCurrency}]`;
    try {
      const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, {
        staticNetwork: true,
      });
      const balanceWei = await provider.getBalance(adminAddress);
      const balance = ethers.formatEther(balanceWei);
      // Un lock típico ronda ~0.001–0.02 en testnets. Avisamos si es muy bajo.
      const low = Number(balance) < 0.01;
      console.log(`${line}`);
      console.log(`   RPC      : ${chain.rpc}`);
      console.log(`   Balance  : ${balance} ${chain.nativeCurrency}${low ? "  ⚠️ MUY BAJO (puede fallar por gas)" : "  ✅"}`);
      console.log(
        `   Guard    : ${chain.contractAddress ? chain.contractAddress : "(sin contrato configurado)"}`,
      );
      console.log("");
    } catch (error) {
      console.log(`${line}`);
      console.log(`   ❌ Error consultando balance: ${error.message}`);
      console.log("");
    }
  }

  console.log("Si la red elegida por el backend (bestChain) no tiene gas nativo,");
  console.log("fondeá la wallet admin con la moneda nativa de esa red, p.ej.:");
  console.log("  - Polygon Amoy → POL (antes MATIC): faucet https://faucet.polygon.technology/");
  console.log("  - Base Sepolia → ETH: https://www.alchemy.com/faucets/base-sepolia");
  console.log("  - BSC Testnet  → tBNB: https://www.bnbchain.org/en/testnet-faucet");
}

main().catch((e) => {
  console.error("Error inesperado:", e);
  process.exit(1);
});
