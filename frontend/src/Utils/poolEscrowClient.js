import { ethers } from "ethers";

/**
 * poolEscrowClient
 * ──────────────────────────────────────────────────────────────────────
 * Cliente de firma del fondeo ON-CHAIN de un pool de Compra Grupal
 * (contrato NeroGroupBuy en BSC Testnet).
 *
 * Flujo completo (lo orquesta `fundPoolMember`):
 *   1. POST /api/pool/:id/prepare-funding  → backend calcula todo + gas drip.
 *   2. approve(USDT → contrato)            → el comprador firma (1ª tx).
 *   3. createGroup / joinGroup             → el comprador firma (2ª tx).
 *   4. POST /api/pool/:id/escrow/fund      → backend verifica on-chain + stock.
 *
 * Requiere `WalletProvider` de Privy (embedded wallet o externa).
 * ──────────────────────────────────────────────────────────────────────
 */

const BSC_TESTNET_CHAIN_ID = 97;

// ⚠️ Debe coincidir con VITE_GROUP_BUY_CONTRACT_ADDRESS del .env.
const GROUP_BUY_CONTRACT_ADDRESS =
  import.meta.env.VITE_GROUP_BUY_CONTRACT_ADDRESS;

// ABI mínimo del contrato NeroGroupBuy (solo lo que el front usa).
const GROUP_BUY_ABI = [
  "function createGroup(string _groupId, address _seller, address _tokenAddress, uint8 _targetBuyers, uint256 _units, uint256 _amount, uint256 _priceArs, uint256 _rateAtLock) external",
  "function joinGroup(string _groupId, uint256 _units, uint256 _amount, uint256 _priceArs, uint256 _rateAtLock) external",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/** Configuración de la red BSC Testnet. */
const bscTestnet = {
  id: BSC_TESTNET_CHAIN_ID,
  name: "BSC Testnet",
  network: "bsc-testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://bsc-testnet-rpc.publicnode.com"] },
    public: { http: ["https://bsc-testnet-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "BscScan", url: "https://testnet.bscscan.com" },
  },
};

/**
 * Fondea la porción de un miembro en el pool (firma on-chain).
 *
 * @param {object} opts
 * @param {object} opts.wallet         wallet de Privy (useWallets → wallets[0])
 * @param {object} opts.funding        respuesta de prepare-funding (`data.funding`)
 * @param {function} opts.onStatus     callback(estadoTexto) para UI
 * @param {function} opts.confirmOnChain async (txHash) => pool  [POST escrow/fund]
 * @returns {Promise<{txHash:string, pool:object}>}
 */
export async function fundPoolMember({
  wallet,
  funding,
  onStatus = () => {},
  confirmOnChain,
}) {
  if (!wallet) throw new Error("No hay wallet disponible para firmar.");
  if (!GROUP_BUY_CONTRACT_ADDRESS) {
    throw new Error(
      "La dirección del contrato de compra grupal no está configurada (VITE_GROUP_BUY_CONTRACT_ADDRESS).",
    );
  }
  if (!funding) throw new Error("Faltan los datos de fondeo.");

  const {
    groupId,
    tokenAddress,
    sellerWallet,
    targetBuyers,
    isCreator,
    units,
    priceUnitArs,
    tdc,
    lockedWei,
  } = funding;

  if (!/^0x[a-fA-F0-9]{40}$/.test(sellerWallet || "")) {
    throw new Error(
      "La wallet del vendedor es inválida. Contactá a soporte.",
    );
  }

  // ── 1. Cambiar a BSC Testnet ──
  onStatus("Cambiando a BSC Testnet...");
  await wallet.switchChain(bscTestnet.id);
  await new Promise((r) => setTimeout(r, 800));

  const ethereumProvider = await wallet.getEthereumProvider();
  const provider = new ethers.BrowserProvider(ethereumProvider);
  const signer = await provider.getSigner();

  // Verificamos que estemos en la red correcta.
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== bscTestnet.id) {
    throw new Error(
      `Tu wallet está en la red ${net.chainId} y debe estar en BSC Testnet (${bscTestnet.id}).`,
    );
  }

  const buyerAddress = wallet.address;
  const amountWei = BigInt(lockedWei);

  // ── 2. approve si hace falta ──
  const usdt = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  let allowance = 0n;
  try {
    allowance = await usdt.allowance(
      buyerAddress,
      GROUP_BUY_CONTRACT_ADDRESS,
    );
  } catch {
    allowance = 0n;
  }

  if (allowance < amountWei) {
    onStatus("Autorizando el uso de USDT (1/2)...");
    const approveTx = await usdt.approve(
      GROUP_BUY_CONTRACT_ADDRESS,
      ethers.MaxUint256,
    );
    await approveTx.wait();
  }

  // ── 3. createGroup / joinGroup ──
  const groupContract = new ethers.Contract(
    GROUP_BUY_CONTRACT_ADDRESS,
    GROUP_BUY_ABI,
    signer,
  );

  let tx;
  if (isCreator) {
    onStatus("Creando el grupo on-chain (2/2)...");
    tx = await groupContract.createGroup(
      groupId,
      sellerWallet,
      tokenAddress,
      Number(targetBuyers),
      BigInt(units),
      amountWei,
      BigInt(Math.round(priceUnitArs)),
      BigInt(Math.round(tdc)),
    );
  } else {
    onStatus("Uniéndote al grupo on-chain (2/2)...");
    tx = await groupContract.joinGroup(
      groupId,
      BigInt(units),
      amountWei,
      BigInt(Math.round(priceUnitArs)),
      BigInt(Math.round(tdc)),
    );
  }

  onStatus("Esperando confirmación de la red...");
  const receipt = await tx.wait();
  const txHash = receipt?.hash || tx.hash;

  // ── 4. Confirmar en el backend (verifica on-chain + reserva stock) ──
  onStatus("Confirmando tu fondeo...");
  const pool = await confirmOnChain(txHash);

  return { txHash, pool };
}

export default fundPoolMember;
