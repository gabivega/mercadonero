/**
 * Diagnóstico MULTI-CONTRATO en Polygon Amoy (chain 80002).
 *
 * Sirve para descubrir en CUÁL de los contratos candidatos quedó el depósito
 * de garantía del vendedor, ya que hoy el frontend y el backend apuntan a
 * contratos distintos (ver .env front vs back).
 *
 * Uso:
 *   node scripts/checkPolygonVendor.mjs <walletDelVendedor>
 *
 * Consulta, para cada contrato candidato:
 *   - vendors(wallet) → totalCollateral / lockedCollateral (decimales 6)
 *   - admin()          → quién es el admin on-chain (debe ser el WALLET_PK del back)
 *   - balanceOf(wallet) del token colateral (cuánto tiene el vendedor en la wallet)
 */
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const wallet = process.argv[2];
if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
  console.error("➡️  Uso: node scripts/checkPolygonVendor.mjs <walletDelVendedor>");
  process.exit(1);
}

// ── Config Polygon Amoy ────────────────────────────────────────────────────
const RPC =
  process.env.POLYGON_AMOY_RPC || "https://polygon-amoy-bor-rpc.publicnode.com";
const CHAIN_ID = 80002;
const DECIMALS = Number(process.env.COLLATERAL_DECIMALS_POLYGON || 6);

// Token colateral (USDXM en Amoy por defecto).
const TOKEN = process.env.COLLATERAL_TOKEN_POLYGON || "";

// Contratos candidatos: los que aparecen hoy en los .env (front y back) + el
// que el script viejo mencionaba. Se deduplican.
const CANDIDATES = [
  process.env.COLLATERAL_CONTRACT_POLYGON,
  "0xe8Af73236b5376d1256BE406249401A89a133CF3", // front VITE_COLLATERAL_CONTRACT_ADDRESS
  "0x4bDceCAa9bD92eE82EF9571c8940cd736Be9696a", // back COLLATERAL_CONTRACT_POLYGON viejo
].filter((a) => a && /^0x[a-fA-F0-9]{40}$/.test(a));

const uniq = [...new Set(CANDIDATES.map((a) => a.toLowerCase()))];

const abi = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../contracts/NeroCollateralABI.json"),
    "utf8",
  ),
);
const erc20Abi = ["function balanceOf(address) view returns (uint256)"];

const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, {
  staticNetwork: true,
});

// ¿El WALLET_PK del backend es el admin?
let adminAddress = null;
try {
  const pk = process.env.WALLET_PK || process.env.PRIVATE_KEY;
  if (pk) adminAddress = new ethers.Wallet(pk).address;
} catch {
  /* noop */
}

console.log("━ Diagnóstico Polygon Amoy (chain 80002) ━");
console.log("RPC       :", RPC);
console.log("Vendedor  :", wallet);
console.log("Admin (WALLET_PK del back):", adminAddress || "(sin WALLET_PK)");
console.log("");

if (TOKEN) {
  try {
    const tk = new ethers.Contract(TOKEN, erc20Abi, provider);
    const bal = await tk.balanceOf(wallet);
    console.log(
      `Wallet del vendedor → saldo del token colateral (${TOKEN}):`,
      ethers.formatUnits(bal, DECIMALS),
    );
  } catch (e) {
    console.log("No se pudo leer balanceOf del token:", e.reason || e.message);
  }
  console.log("");
}

for (const addr of uniq) {
  console.log(`── Contrato candidato: ${addr} ──`);
  const contract = new ethers.Contract(addr, abi, provider);
  try {
    // ¿Existe contrato en esa dirección?
    const code = await provider.getCode(addr);
    if (code === "0x") {
      console.log("  ⚠️  NO hay contrato desplegado en esa dirección.");
      console.log("");
      continue;
    }

    let admin = "(no expone admin())";
    try {
      admin = await contract.admin();
      console.log("  admin        :", admin);
      if (adminAddress && admin.toLowerCase() === adminAddress.toLowerCase()) {
        console.log("  ✅ admin == WALLET_PK del backend (puede bloquear)");
      } else if (adminAddress) {
        console.log("  ❌ admin != WALLET_PK → lockOrderCollateral revertiría 'Solo Admin'");
      }
    } catch {
      /* contrato sin admin() */
    }

    const v = await contract.vendors(wallet);
    console.log(
      "  totalCollateral :",
      ethers.formatUnits(v.totalCollateral, DECIMALS),
    );
    console.log(
      "  lockedCollateral:",
      ethers.formatUnits(v.lockedCollateral, DECIMALS),
    );
    console.log(
      "  disponible      :",
      ethers.formatUnits(v.totalCollateral - v.lockedCollateral, DECIMALS),
    );
  } catch (e) {
    console.log("  ❌ Error al leer vendors():", e.reason || e.message);
  }
  console.log("");
}

console.log("👉 El contrato con totalCollateral > 0 es donde el frontend depositó.");
console.log("   Unificá VITE_COLLATERAL_CONTRACT_ADDRESS y COLLATERAL_CONTRACT_POLYGON");
console.log("   a ESE address y poné DEFAULT_CHAIN_ID=80002 en el backend.");
