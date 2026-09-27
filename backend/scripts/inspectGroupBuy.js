// scripts/inspectGroupBuy.js — inspector on-chain de NeroGroupBuy.
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const provider = new ethers.JsonRpcProvider(
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
);
const addr = process.env.GROUP_BUY_CONTRACT_ADDRESS;
const abi = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../contracts/NeroGroupBuyABI.json"), "utf8"),
);
const c = new ethers.Contract(addr, abi, provider);

const groupId = process.argv[2];
if (!groupId) {
  console.error("Uso: node scripts/inspectGroupBuy.js <groupId>");
  process.exit(1);
}

const g = await c.getGroup(groupId);
console.log("getGroup:", {
  seller: g.seller,
  creator: g.creator,
  targetBuyers: Number(g.targetBuyers),
  memberCount: Number(g.memberCount),
  priceFinalUsd: ethers.formatUnits(g.priceFinalUsd, 18),
  closed: g.closed,
  executed: g.executed,
  refunded: g.refunded,
});

const n = Number(g.memberCount);
for (let i = 0; i < n; i++) {
  const thisMember = await c.getMember(groupId, i);
  console.log(`member[${i}]:`, {
    buyer: thisMember.buyer,
    lockedAmount: ethers.formatUnits(thisMember.lockedAmount, 18),
    priceArs: thisMember.priceArs.toString(),
    rateAtLock: thisMember.rateAtLock.toString(),
    funded: thisMember.funded,
    released: thisMember.released,
  });
}

// Eventos MemberReleased (rango amplio, paginado)
const iface = c.interface;
const topic = iface.getEvent("MemberReleased").topicHash;
const latest = await provider.getBlockNumber();
let all = [];
for (let chunk = 0; chunk < 15; chunk++) {
  const to = latest - chunk * 3000;
  const from = to - 2999;
  try {
    const logs = await provider.getLogs({ address: addr, fromBlock: from, toBlock: to, topics: [topic] });
    all = all.concat(logs);
  } catch (e) {
    // provider puede limitar rangos; seguimos
  }
  if (all.length >= 10) break;
}
console.log(`\nMemberReleased events (${all.length}):`);
all.forEach((l) => {
  const p = iface.parseLog(l);
  if (p.args.groupId !== groupId) return;
  console.log(
    `  buyer ${p.args.buyer} | sellerNet ${ethers.formatUnits(p.args.sellerNet, 18)} | fee ${ethers.formatUnits(p.args.fee, 18)} | refund ${ethers.formatUnits(p.args.refund, 18)}`,
  );
});
