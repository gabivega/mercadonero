import { createPublicClient, http, formatUnits } from "viem";
import { polygonAmoy, bscTestnet, baseSepolia } from "viem/chains";

// RPC público por red. Replicado de WalletPage.jsx: leemos con un public client
// de cada chain (INDEPENDIENTE de dónde esté conectada la wallet) para que el
// saldo sea correcto en TODAS las redes a la vez.
export const RPC_BY_CHAIN = {
  [polygonAmoy.id]:
    import.meta.env.VITE_POLYGON_AMOY_RPC ||
    "https://polygon-amoy-bor-rpc.publicnode.com",
  [bscTestnet.id]: "https://bsc-testnet-rpc.publicnode.com",
  [baseSepolia.id]: "https://sepolia.base.org",
};

export const VIEM_CHAIN_BY_ID = {
  [polygonAmoy.id]: polygonAmoy,
  [bscTestnet.id]: bscTestnet,
  [baseSepolia.id]: baseSepolia,
};

const publicClientByChain = {};
export function getPublicClient(chainId) {
  if (!publicClientByChain[chainId]) {
    const chain = VIEM_CHAIN_BY_ID[chainId];
    if (!chain) throw new Error(`Red no soportada: ${chainId}`);
    publicClientByChain[chainId] = createPublicClient({
      chain,
      transport: http(RPC_BY_CHAIN[chainId]),
    });
  }
  return publicClientByChain[chainId];
}

const BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
];

/**
 * Lee el saldo de pago de una opción (red + token) para una address dada.
 * Sirve tanto para modo nativo (getBalance) como ERC-20 (balanceOf).
 *
 * @param {{chainId:number, fundingMode?:string, tokenAddress?:string, tokenDecimals?:number}} option
 * @param {string} address  wallet del comprador
 * @returns {Promise<number>} saldo formateado (en unidades del token)
 */
export async function readPaymentBalance(option, address) {
  if (!option || !address) return 0;
  const client = getPublicClient(option.chainId);
  const decimals = Number(option.tokenDecimals ?? 18);
  const isNative =
    option.fundingMode === "native" || option.isNativeFunding === true;

  try {
    if (isNative) {
      const balWei = await client.getBalance({ address });
      return parseFloat(formatUnits(balWei, decimals));
    }
    if (!option.tokenAddress) return 0;
    const data = await client.readContract({
      address: option.tokenAddress,
      abi: BALANCE_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return parseFloat(formatUnits(data, decimals));
  } catch (err) {
    console.error(
      `Error leyendo balance (chain ${option.chainId}):`,
      err?.message || err,
    );
    return 0;
  }
}

/**
 * Lee en paralelo el saldo de varias opciones de pago.
 * Devuelve un mapa { [chainId]: saldo }.
 *
 * @param {Array} options  lista de opciones (payment-options)
 * @param {string} address wallet del comprador
 */
export async function readAllPaymentBalances(options, address) {
  const entries = await Promise.all(
    (options || []).map(async (opt) => {
      const bal = await readPaymentBalance(opt, address);
      return [opt.chainId, bal];
    }),
  );
  return Object.fromEntries(entries);
}
