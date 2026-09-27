// scripts/testGroupBuyFlow.js
//
// TEST END-TO-END del contrato NeroGroupBuy (v2, MULTI-UNIDAD) en BSC Testnet.
//
// Reproduce el EJEMPLO NUMÉRICO de negocio:
//   - Precio base 100.000 ARS, TDC 1600 → unitario ≈ 62.5 USDT (buyer 1)
//   - Tiers (por PERSONAS): 2→95.000, 3→90.000, 4→85.000, 5→80.000 (ARS)
//   - Cada buyer congela (unidades × precioTier / TDC) USDT.
//   - Cierra con 5 personas → priceFinalUnitUsd = 80.000/1600 = 50 USDT.
//   - Libera cada porción: seller recibe (unitFinal × units − 3%) y buyer refund.
//
// MULTI-UNIDAD: cada buyer pide una CANTIDAD DISTINTA de unidades (1..N), igual
//   que en producción. El contrato liquida seller/refund por `units`.
//
// MODELO DE GAS (igual al de producción):
//   - Los buyers NO tienen BNB. La plataforma les entrega un "gas drip" de
//     BNB just-in-time (gasDripService), y ellos firman sus txs con ese gas.
//   - El USDT lo financia el admin solo para el test.
//
// APPROVE REUTILIZABLE: a cada buyer se le hace UN approve grande al contrato
//   una sola vez; en adelante solo firman createGroup/joinGroup (1 tx).
//
// Usa 5 wallets BUYER deterministas. NO usar en mainnet.
// Uso:  node scripts/testGroupBuyFlow.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import mongoose from "mongoose";
import { dripGas } from "../src/services/gasDripService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROVIDER_URL =
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const GROUP_BUY_ADDRESS = process.env.GROUP_BUY_CONTRACT_ADDRESS;
const USDT = process.env.USDT_TESTNET_ADDRESS || "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
const PRIVATE_KEY = process.env.WALLET_PK;

if (!GROUP_BUY_ADDRESS) {
  console.error("Falta GROUP_BUY_CONTRACT_ADDRESS en el .env.");
  process.exit(1);
}
if (!PRIVATE_KEY) {
  console.error("Falta WALLET_PK en el .env.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const admin = new ethers.Wallet(PRIVATE_KEY, provider);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const GROUP_ABI = [
  "function createGroup(string _groupId, address _seller, address _tokenAddress, uint8 _targetBuyers, uint256 _units, uint256 _amount, uint256 _priceArs, uint256 _rateAtLock) external",
  "function joinGroup(string _groupId, uint256 _units, uint256 _amount, uint256 _priceArs, uint256 _rateAtLock) external",
  "function closeGroup(string _groupId, uint256 _priceFinalUnitUsd) external",
  "function releaseMember(string _groupId, address _buyer) external",
  "function refundCreator(string _groupId) external",
  "function getGroup(string _groupId) external view returns (address seller, address creator, address token, uint8 targetBuyers, uint8 memberCount, uint256 priceFinalUnitUsd, bool closed, bool executed, bool refunded)",
  "function getMemberByAddress(string _groupId, address _buyer) external view returns (bool exists, uint256 lockedAmount, uint256 units, bool released)",
];

const usdtAdmin = new ethers.Contract(USDT, ERC20_ABI, admin);
const groupAdmin = new ethers.Contract(GROUP_BUY_ADDRESS, GROUP_ABI, admin);

const fmt = (n) => Number(n).toFixed(6);

async function usdtBal(addr) {
  return Number(ethers.formatUnits(await usdtAdmin.balanceOf(addr), 18));
}
async function bnbBal(addr) {
  return Number(ethers.formatEther(await provider.getBalance(addr)));
}

async function main() {
  // Conexión a Mongo (necesaria para el tracking de gas drip).
  if (process.env.MONGODB_URI && mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected (para gas drip tracking)");
  }

  console.log("▶ Contrato NeroGroupBuy :", GROUP_BUY_ADDRESS);
  console.log("▶ USDT testnet          :", USDT);
  console.log("▶ Admin                 :", admin.address);
  const adminUsdt = await usdtBal(admin.address);
  const adminBnb = await bnbBal(admin.address);
  console.log("  USDT admin            :", fmt(adminUsdt));
  console.log("  BNB admin             :", fmt(adminBnb));
  console.log("");

  // ── 1) 5 wallets buyer deterministas ──
  const buyers = [1, 2, 3, 4, 5].map(
    (i) =>
      new ethers.Wallet(
        ethers.keccak256(ethers.toUtf8Bytes(`nerogroup-test-${i}-${admin.address}`)),
      ),
  );
  console.log("Buyers:");
  buyers.forEach((b, i) => console.log(`  #${i + 1} ${b.address}`));
  console.log("");

  // ── 2) Unidades por buyer + precios del ejemplo (ARS) con escala automática ──
  //
  // UNIDADES distintas por comprador (clave de multi-unidad): uno pide 3, otro
  // 1, otro 5, etc. El precio UNITARIO baja por PERSONAS (tier); el monto
  // congelado = unidades × precioUnitario / TDC.
  const UNITS = [3, 1, 5, 2, 1]; // buyer #1..#5
  const TDC = 1600;
  // Tier por cantidad de PERSONAS (el que entra define su tier = personas acumuladas).
  const precioArsPorPersona = [100000, 95000, 90000, 85000, 80000];
  // precio unitario al entrar cada buyer (buyer i entra como persona i+1).
  const priceUnitArsAtEntry = precioArsPorPersona;
  const priceUnitFinalArs = precioArsPorPersona[4]; // 80000 (5 personas)

  // USDT a congelar por buyer = units × priceUnitArsAtEntry / TDC
  const congelarFull = UNITS.map(
    (u, i) => (u * priceUnitArsAtEntry[i]) / TDC,
  );
  const totalFull = congelarFull.reduce((a, b) => a + b, 0);
  const budget = adminUsdt * 0.7; // margen para USDT + remanentes
  const scale = Math.min(1, budget / totalFull);
  const congelarUsd = congelarFull.map((v) => v * scale);
  const priceFinalUnitUsd = (priceUnitFinalArs / TDC) * scale;
  const precioArs = priceUnitArsAtEntry; // informativo

  const totalNeeded = congelarUsd.reduce((a, b) => a + b, 0);
  console.log(`Unidades por buyer: [${UNITS.join(", ")}]`);
  console.log(`Escala aplicada: ${scale.toFixed(6)}`);
  console.log(`Total USDT a congelar: ${fmt(totalNeeded)}`);
  if (totalNeeded <= 0 || adminUsdt < totalNeeded) {
    console.error(`✗ Admin sin USDT suficiente (${fmt(adminUsdt)} < ${fmt(totalNeeded)}).`);
    process.exit(1);
  }
  const GROUP_ID = `test-${Date.now()}`;

  // ── 3) Fondeo+ de cada buyer: USDT + gas drip + UN approve grande ──
  const APPROVE_INFINITE = ethers.MaxUint256;
  console.log("\nPreparando buyers (USDT + gas drip + approve único):");
  for (let i = 0; i < buyers.length; i++) {
    // 3a) USDT para el test (en prod es el saldo propio del comprador).
    const amountWei = ethers.parseUnits(String(congelarUsd[i]), 18);
    await (await usdtAdmin.transfer(buyers[i].address, amountWei)).wait();

    // 3b) Gas drip (la plataforma paga el gas del comprador).
    const drip = await dripGas({
      userId: new mongoose.Types.ObjectId(), // ObjectId válido para el tracking
      walletAddress: buyers[i].address,
      reason: i === 0 ? "create_group" : "join_group",
    });
    if (!drip.success && !drip.skipped) {
      console.error(`  ✗ Falló el gas drip para buyer #${i + 1}:`, drip.error);
      process.exit(1);
    }
    const gasInfo = drip.delivered
      ? `drip ${drip.amountBnb} BNB (${String(drip.txHash).slice(0, 10)}...)`
      : "ya tenía gas";

    // 3c) UN approve grande al contrato (1 sola firma por token de por vida).
    const usdtBuyer = new ethers.Contract(USDT, ERC20_ABI, buyers[i].connect(provider));
    await (await usdtBuyer.approve(GROUP_BUY_ADDRESS, APPROVE_INFINITE)).wait();

    console.log(
      `  Buyer #${i + 1} (${UNITS[i]}u): +${fmt(congelarUsd[i])} USDT | gas: ${gasInfo} | approve ∞ | BNB ahora ${fmt(
        await bnbBal(buyers[i].address),
      )}`,
    );
  }
  console.log("");

  // ── 4) Buyer 1 crea el grupo ──
  {
    const g1 = new ethers.Contract(GROUP_BUY_ADDRESS, GROUP_ABI, buyers[0].connect(provider));
    const tx = await g1.createGroup(
      GROUP_ID,
      admin.address, // seller = admin (para verificar recepción)
      USDT,
      5,
      BigInt(UNITS[0]),
      ethers.parseUnits(String(congelarUsd[0]), 18),
      BigInt(precioArs[0]),
      BigInt(TDC),
    );
    await tx.wait();
    console.log(`✔ createGroup tx: ${tx.hash}`);
  }

  // ── 5) Buyers 2..5 se suman (solo joinGroup, sin approve extra) ──
  for (let i = 1; i < buyers.length; i++) {
    const g = new ethers.Contract(GROUP_BUY_ADDRESS, GROUP_ABI, buyers[i].connect(provider));
    const tx = await g.joinGroup(
      GROUP_ID,
      BigInt(UNITS[i]),
      ethers.parseUnits(String(congelarUsd[i]), 18),
      BigInt(precioArs[i]),
      BigInt(TDC),
    );
    await tx.wait();
    console.log(`✔ joinGroup buyer #${i + 1} (${UNITS[i]}u) tx: ${tx.hash}`);
  }
  console.log("");

  // ── 6) Admin cierra con precio final UNITARIO ──
  {
    const tx = await groupAdmin.closeGroup(
      GROUP_ID,
      ethers.parseUnits(String(priceFinalUnitUsd), 18),
    );
    await tx.wait();
    console.log(`✔ closeGroup (${priceFinalUnitUsd.toFixed(6)} USDT/unidad) tx: ${tx.hash}`);
  }

  const sellerBefore = await usdtBal(admin.address);

  // ── 7) Liberar cada porción y verificar refunds (multi-unidad) ──
  console.log("\nLiberaciones:");
  let totalSellerNet = 0;
  for (let i = 0; i < buyers.length; i++) {
    const balBefore = await usdtBal(buyers[i].address);
    await (await groupAdmin.releaseMember(GROUP_ID, buyers[i].address)).wait();
    const balAfter = await usdtBal(buyers[i].address);

    const totalFinal = UNITS[i] * priceFinalUnitUsd; // porción final del buyer
    const expectedRefund = congelarUsd[i] - totalFinal;
    const sellerNet = totalFinal * 0.97;
    totalSellerNet += sellerNet;
    const refundReal = balAfter - balBefore;
    console.log(
      `  Buyer #${i + 1} (${UNITS[i]}u): congeló ${fmt(congelarUsd[i])} | totalFinal ${fmt(
        totalFinal,
      )} | refund esp ${fmt(expectedRefund)} | real ${fmt(refundReal)}`,
    );
  }

  const sellerAfter = await usdtBal(admin.address);
  console.log(`\nSeller (admin): antes ${fmt(sellerBefore)} → después ${fmt(sellerAfter)}`);
  // El Δ del admin incluye sellerNet + fee (admin==feeWallet en este test).
  console.log(`  Δ recibido: ${fmt(sellerAfter - sellerBefore)}`);
  console.log(`  esperado (suma sellerNet, 5 × units × unitFinal × 0.97): ${fmt(totalSellerNet)} + fee`);

  // ── 8) Caso expiración (1 buyer → refundCreator) ──
  console.log("\n── Test expiración (1 buyer → refundCreator) ──");
  const GROUP_ID2 = `test-refund-${Date.now()}`;
  const units2 = 4n;
  const amount2 = ethers.parseUnits(String((Number(units2) * 100000) / TDC * scale), 18);
  {
    await (await usdtAdmin.transfer(buyers[0].address, amount2)).wait();
    // Ya tiene approve ∞ + gas del paso anterior → firma directo.
    const g = new ethers.Contract(GROUP_BUY_ADDRESS, GROUP_ABI, buyers[0].connect(provider));
    await (
      await g.createGroup(
        GROUP_ID2,
        admin.address,
        USDT,
        5,
        units2,
        amount2,
        BigInt(100000),
        BigInt(TDC),
      )
    ).wait();
    console.log("✔ createGroup (solo, 4u) confirmada");
  }
  const refundBefore = await usdtBal(buyers[0].address);
  await (await groupAdmin.refundCreator(GROUP_ID2)).wait();
  const refundAfter = await usdtBal(buyers[0].address);
  console.log(
    `  refund esp ${fmt(Number(amount2) / 1e18)} | real ${fmt(refundAfter - refundBefore)}`,
  );

  console.log("\n✅ Test end-to-end completado.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Error global:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
