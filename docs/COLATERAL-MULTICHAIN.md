# Colateral Multichain — Configuración y Deploy

Documentación de la **FASE A** del sistema de colateral multichain (garantía de
vendedores). Antes todo estaba hardcodeado a BSC testnet; ahora el backend es
agnóstico de red y soporta BSC testnet, Base Sepolia y Polygon Amoy.

## Redes soportadas (testnet)

| Red          | chainId | Token colateral | Decimales | Explorer              |
|--------------|---------|-----------------|-----------|-----------------------|
| BSC testnet  | 97      | USDT            | 18        | testnet.bscscan.com   |
| Base Sepolia | 84532   | USDC            | 6         | sepolia.basescan.org  |
| Polygon Amoy | 80002   | USDXM           | 6         | amoy.polygonscan.com  |

> ⚠️ **Polygon Amoy usa USDXM** (no USDC/USDT mainnet). **Base Sepolia usa USDC**
> y tiene **6 decimales**, no 18. Nunca hardcodear decimales: se leen de la config.

## Variables de entorno por red

```env
# Red por defecto
DEFAULT_CHAIN_ID=97

# BSC testnet
BSC_TESTNET_RPC=https://bsc-testnet-rpc.publicnode.com
COLLATERAL_CONTRACT_BSC=
COLLATERAL_TOKEN_BSC=
COLLATERAL_SYMBOL_BSC=USDT
COLLATERAL_DECIMALS_BSC=18

# Base Sepolia
BASE_SEPOLIA_RPC=https://sepolia.base.org
COLLATERAL_CONTRACT_BASE=
COLLATERAL_TOKEN_BASE=
COLLATERAL_SYMBOL_BASE=USDC
COLLATERAL_DECIMALS_BASE=6

# Polygon Amoy
POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology
COLLATERAL_CONTRACT_POLYGON=
COLLATERAL_TOKEN_POLYGON=
COLLATERAL_SYMBOL_POLYGON=USDXM
COLLATERAL_DECIMALS_POLYGON=6
```

**Compatibilidad legacy:** para BSC testnet se siguen leyendo (como fallback)
`CONTRACT_ADDRESS` y `USDT_TESTNET_ADDRESS` si las nuevas no están seteadas.

## Deploy del contrato de colateral

El mismo bytecode `NeroCollateral.sol` sirve para las 3 redes (es agnóstico de
red). Solo cambia el token de colateral por red.

```bash
# BSC testnet (default)
node scripts/deployCollateral.mjs

# Base Sepolia
node scripts/deployCollateral.mjs baseSepolia

# Polygon Amoy
node scripts/deployCollateral.mjs polygonAmoy

# Por chainId también:
node scripts/deployCollateral.mjs 84532
```

El script **escribe automáticamente** la dirección desplegada en la variable
`.env` correspondiente (`COLLATERAL_CONTRACT_BASE`, etc.). La wallet admin
(`WALLET_PK`) es la misma en todas las redes.

## Arquitectura del código

### `src/config/chains.js` — fuente única de verdad

Registro de redes (`CHAINS`). Expone:
- `getChainConfig(chainId)` → config de una red (lanza si no soportada).
- `getConfiguredChains()` → solo redes con contrato + token seteados.
- `serializeChain(chain)` → info pública para el frontend.
- `DEFAULT_CHAIN_ID`, `SUPPORTED_CHAIN_IDS`.

### `src/services/blockchainServices.js` — fábrica per-chain

Refactor de single-chain a multichain con **cachés por red** (provider, signer,
contrato). Todas las funciones aceptan un `chainId` **opcional al final**:

```js
getOrderLock(orderId, chainId?)
getVendorCollateral(vendorAddress, chainId?)
getVendorCollateralMultiChain(vendorAddress)     // ⭐ detección multichain
verifyOrderReleased(orderId, chainId?)
getPoolLiquidityDiagnostic(vendorAddress, chainId?)
lockVendorCollateral(orderId, vendorAddress, amountInTokens, chainId?)
releaseVendorCollateral(orderId, vendorAddress, feeAmountUsd, chainId?)
triggerOrderDispute(orderId, chainId?)
cancelVendorCollateral(orderId, vendorAddress, chainId?)
```

**Retrocompatibilidad:** si no se pasa `chainId`, usa `DEFAULT_CHAIN_ID`
(BSC testnet), por lo que el flujo actual no cambia.

### ⭐ `getVendorCollateralMultiChain(walletAddress)`

El corazón de la detección multichain. Recorre todas las redes configuradas en
paralelo, lee el saldo del vendedor en cada contrato y devuelve:

```js
{
  success: true,
  walletAddress,
  byChain: { 97: {...}, 84532: {...}, 80002: {...} },
  totalAvailable,   // suma de saldo libre en todas las redes
  totalLocked,
  totalCollateral,
  bestChain,        // chainId con mayor saldo libre (auto-selección)
  bestAvailable,
}
```

## Modelo conceptual

El colateral vive **por red**. La address EVM del vendedor es la misma en todas
las redes, pero cada red tiene su propio `vendors[address]` en su propio
contrato. Por eso:

```
Colateral efectivo total = Σ (por red) [saldo libre en esa red]
```

- **Red preferida:** por defecto se auto-selecciona la de **mayor saldo**
  (`bestChain`). El vendedor podrá cambiarla manualmente (FASE B/C).
- El lock/release/cancel/dispute de una orden se hace **en la red donde se
  congeló** el colateral de esa orden (`Order.collateralChainId`, FASE B).

## Próximas fases

- **FASE B:** agregar `collateral.preferredChainId` a `User` y
  `collateralChainId` a `Order`.
- **FASE C:** endpoint backend que exponga `getVendorCollateralMultiChain` al
  front (pantalla "Mi Billetera" con desglose por red + selector de red preferida).
- **FASE E:** checkout/orden deciden la red de colateral según saldo del vendedor.
