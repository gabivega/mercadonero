require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
    networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
      chainId: 97,
      accounts: (process.env.WALLET_PK || process.env.PRIVATE_KEY)
        ? [(process.env.WALLET_PK || process.env.PRIVATE_KEY)]
        : [],
    },
    // ── MULTICHAIN (colateral de vendedores) ──
    // Mismas redes que config/chains.js. La misma wallet (WALLET_PK) en todas.
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      chainId: 84532,
      accounts: (process.env.WALLET_PK || process.env.PRIVATE_KEY)
        ? [(process.env.WALLET_PK || process.env.PRIVATE_KEY)]
        : [],
    },
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC || "https://polygon-amoy-bor-rpc.publicnode.com",
      chainId: 80002,
      accounts: (process.env.WALLET_PK || process.env.PRIVATE_KEY)
        ? [(process.env.WALLET_PK || process.env.PRIVATE_KEY)]
        : [],
    },
  },
  etherscan: {
    // El plugin acepta un objeto por red; mantenemos la compat con la var legacy.
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
};