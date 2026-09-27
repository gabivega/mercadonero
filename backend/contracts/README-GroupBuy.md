# NeroGroupBuy — Escrow de Compras Grupales

Contrato de escrow en USDT para compras grupales ("Social Selling") en **BSC Testnet**.
Sigue el mismo estilo/patrón que `NeroEscrow.sol` y `NeroCollateral.sol`.

## Flujo

1. **`createGroup`** — el creador (primer comprador) congela su saldo con `approve` + transferencia.
2. **`joinGroup`** — cada comprador nuevo congela su saldo (monto calculado por el backend con el TDC del momento).
3. **`closeGroup`** (admin) — se llena o vence el plazo con ≥2 compradores: fija el **precio final en USDT**.
4. **`releaseMember`** (admin) — por cada confirmación de recepción: paga al vendedor `priceFinal - fee`, cobra el fee y **reintegra** al comprador `lockedAmount - priceFinal`.
5. **`refundCreator`** (admin) — expiró con 1 comprador: devuelve el 100% sin fee.

## Decisión de TDC (opción A confirmada)

- Cada comprador congela con el **TDC del momento en que entra**.
- Al cerrar el grupo se fija **un único `priceFinalUsd`** = precio final ARS ÷ TDC de cierre.
- El reintegro de cada comprador = `congelado − priceFinalUsd`.

## Decimales

- On-chain: **18 decimales** (USDT en BSC mainnet y testnet usa 18).
- El redondeo a **2 decimales** es responsabilidad del frontend/backend, no del contrato.

## Config del backend (.env)

```
BSC_TESTNET_RPC="https://bsc-testnet-rpc.publicnode.com"
WALLET_PK="<wallet admin>"
GROUP_BUY_CONTRACT_ADDRESS = "<address tras deploy>"
GROUP_BUY_FEE_BPS = 300
```

Frontend (`frontend/.env`):
```
VITE_GROUP_BUY_CONTRACT_ADDRESS="<address tras deploy>"
```

## Comandos

```powershell
# 1) Compilar
Set-Location backend
node scripts/compileGroupBuy.js

# 2) Desplegar en BSC Testnet (actualiza GROUP_BUY_CONTRACT_ADDRESS en .env)
node scripts/deployGroupBuy.js
```

## Servicio backend

`backend/src/services/groupBuyEscrowService.js` expone:
- `getGroupOnChain(groupId)` / `getMemberOnChain(groupId, buyer)` — lecturas
- `closeGroupOnChain(groupId, priceFinalUsd)` — cierre
- `releaseMemberOnChain(groupId, buyer)` — liberación parcial + reintegro
- `refundGroupOnChain(groupId)` — reembolso por expiración
- `getGroupFeeBps()` / `setGroupFeeBps(bps)` — fee

Todas las acciones admin hacen **verificación on-chain real** post-tx (no confían solo en que la tx se minó).
