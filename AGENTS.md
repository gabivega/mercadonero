# AGENTS.md — Guía de contexto para agentes de IA

> **LEÉ ESTO PRIMERO** antes de explorar el repo. Resume la arquitectura, convenciones,
> dominios de negocio y trampas conocidas. Objetivo: ahorrar tokens y evitar errores
> repetidos. Si algo acá contradice al código, **gana el código** y actualizá este archivo.

Proyecto: **Mercado Nero / MVP** — marketplace con escrow cripto on-chain, colateral de
vendedores, compra grupal (pools), referidos y cashback. Mercado argentino (ARS/USD).

---

## 1. Stack

- **Frontend:** React + Vite (`frontend/`). Entry en `src/`, rutas/estilos con Tailwind.
- **Backend:** Node + Express (ESM) + Mongoose (`backend/`). Entry `backend/index.js`.
- **DB:** MongoDB (Atlas).
- **Auth:** **Supabase Auth** (ver §7 sobre Privy).
- **Wallets / on-chain:** **Crossmint** (`@crossmint/wallets-sdk`) para firma de wallet.
- **Blockchain:** BSC (USDT), Base (USDC), Polygon (USDXM) — escrow (`NeroEscrow`) y pools.
- **Envío:** Zipnova (integrado desde backend). **Emails:** Resend.
- **Pagos:** transferencia bancaria (flujo colateral) o cripto (escrow USDT/USDC).

---

## 2. Cómo levantar

```shell
# Backend (puerto 3000)
cd backend && node index.js        # o: npm run dev (nodemon)
# Frontend
cd frontend && npm run dev          # Vite dev server (5173)
```

- El frontend usa `VITE_SERVER_URL=http://localhost:3000` (sin proxy de Vite).
- **CORS** en `backend/index.js` solo permite `localhost:5173` y dominios de prod.
- **Crons** (limpieza de órdenes, sync Elit) están DESACTIVADOS salvo env explícito.

---

## 3. Convenciones de código

- **Idioma:** comentarios, mensajes de UI y de API en **español (es-AR)**. Código
  (variables/funciones) en inglés o español según el dominio; respetá el estilo local.
- **Estilo:** comentarios de bloque **explicativos del "por qué"** (hay mucho comentario
  contextual valioso; mantené ese estilo, no lo borres).
- **Comentarios de sección:** usan separadores `// ═══...` en bloques importantes.
- **Mensajes al usuario:** en español, tono cercano/rioplatense ("tenés", "usá", "revisá").
- **API:** respuestas `{ success, message, ...data }`. No rompas ese contrato.
- **Errores:** devolvé `status` + `message` en español. Códigos de bloqueo con `blocked`
  (ej `blocked: "approval"`, `blocked: "wallet"`, `blocked: "onboarding"`).
- **Ediciones:** NO uses `read_file` a ciegas si sospechás desincronización (ver §9).

---

## 4. Arquitectura backend

### Rutas → `backend/src/routes/*.js`
Cada dominio: `product`, `order`, `cart`, `user`, `auth`, `admin`, `pool`, `shipping`,
`elit`, `flaming`, `directcar`, `tiendanube`, `my-store`, `cashback`, `referral`,
`rewards`, `review`, `notification`, `message`, `redirect`, `test-auth` (temporal, borrar).

Montaje en `index.js`. **`/api/admin`** tiene dos routers: el principal y
`adminStoreRoutes` montado aparte en `/api/admin/store-connections`.

### Middlewares y ORDEN CRÍTICO
- `verifyAuth` → inyecta `req.user = { did, email, authSource }` (dual Supabase/Privy).
- `attachUser` → busca el User de Mongo (por `supabaseId`/`privyDid`/email) e inyecta
  `req.user._id`, `req.user.role`, `req.user.walletAddress`.
- `isAdmin` → `req.user.role === "admin"`. **Requiere `attachUser` ANTES.**
- `requireSellerOnboarding` → para CREAR/importar publicaciones (TODAS). Bloquea si:
  `blocked:"onboarding"` (falta onboarding), `blocked:"approval"` (tienda en lista de
  espera, sin aprobar) o `blocked:"wallet"` (producto de pago sin wallet). Aplica a
  `POST /create` y `POST /bulk-import`. Ver §5b (waiting list).

Orden típico en admin: `verifyAuth, attachUser, isAdmin, handler`.

### Modelos (`backend/src/models/`)
`User`, `Product`, `Order`, `Pool`, más configs (`ReferralConfig`, escrow, etc.).
- **User:** `privyDid` (opcional, sparse) + `supabaseId` (opcional, sparse) + `role`.
- **Product:** ver §5 (moderación) y `moderation`, `sale`, `socialSelling`, `referral`,
  `payment`, `shipping.delivery`, `providerRef`, virtual `availableStock`.
- **Order:** estados y campos de colateral/escrow/disputa (ver §6).

---

## 5. Aprobación en DOS niveles (CRÍTICO para visibilidad)

Hay **dos aprobaciones independientes** que NO hay que confundir:

| Nivel | Campo | Quién | Efecto |
|---|---|---|---|
| **Tienda** | `user.shop.approved` | Admin (`PATCH /api/admin/users/:id/shop`) | Permite al vendedor **PUBLICAR** |
| **Publicación** | `product.moderation.status` | Admin (`POST/PATCH /api/admin/products/...`) | Permite que **SE VEA** en catálogo |

- La aprobación de tienda exige onboarding (`shop.active === true`) para aprobar.
- Al **desactivar tienda** o **suspender cuenta**, se pausan sus productos `active→paused`.

### 5b. WAITING LIST (lista de espera) — flujo de acceso a vender
En esta etapa **vender es por invitación**. `shop.active=true` + `shop.approved=false`
se interpreta como **"en lista de espera"**. Reglas vigentes:
- **El onboarding es un MURO DE ENTRADA**, no un gate de submit: `CreateProduct` abre el
  modal `SellerOnboarding` automáticamente si `!shop.active`, y **NO muestra ningún
  formulario ni el selector de tipo** hasta `shop.approved === true`. Aplica a TODOS los
  tipos (productos, vehículos, inmuebles, servicios).
- **Onboarding = 2 pasos** (datos de usuario + datos de tienda). **YA NO pide datos
  bancarios** (se administran en el Perfil / `BankAccountSection`). Ver
  `completeSellerOnboarding` en `userController.js` y `requireSellerOnboarding.js`.
- Al completar: queda en lista de espera, mensaje *"Serás notificado cuando estés
  habilitado para vender"*. **No se reintenta publicar** (el draft/`force` se eliminó).
- **Wallet**: se sigue exigiendo, pero **solo para Productos de pago** (no clasificados)
  y recién al publicar (post-aprobación). Es manual desde "Mi Billetera".
- `requireSellerOnboarding` bloquea: `onboarding` (falta `shop.active`) → `approval`
  (hay `active` pero no `approved`) → `wallet` (producto de pago sin `walletAddress`).
- Modo `SellerOnboarding mode="edit"` (`SellerDashboard`): edita solo pasos 1-2, sin tocar
  bancarios (sin cambios de comportamiento).
- Publicación "editable": si un producto `approved` se edita, **vuelve a `pending`**.
- Visibilidad pública: `getProducts`/`getProductById` exigen
  `status:"active"` **Y** `moderation.status:"approved"` (y vendedor `accountStatus:"active"`).
- Nace en `pending` por defecto → los productos nuevos NO se ven hasta aprobarse.
- **Excepción:** los importadores de scraping (`importDirectcarToUser.mjs`, etc.) pueden
  crear con `moderation: { status: 'approved' }` deliberadamente (datos de test).

> **Ticket pendiente (ver §10):** el blindaje "tienda NO aprobada ⇒ nada visible" hoy NO
> se revalida en `getProducts`/`getProductById` (solo al crear). Formalmente correcto
> igual porque un producto sólo llega a `approved` por acción del admin.

---

## 6. Flujo de órdenes / pagos

- Estados (aprox.): `pending_payment`, `verifying_payment`, `paid`, `shipped`,
  `reception_confirmed`, `completed`, `cancelled`, `expired` (+ `awaiting_collateral`).
- **Colateral:** el vendedor bloquea garantía on-chain (BSC custom); su liberación exige
  verificar on-chain (`collateral-status`) y el buffer de seguridad antes de completar.
- **Escrow crypto:** el comprador fondea el contrato; fondos retenidos hasta
  `reception_confirmed`. Liberación manual (`release-escrow`) o cancelación/reembolso
  (`cancel-escrow`).
- **Buffer de seguridad:** `reception_confirmed` → `releaseEligibleAt`; `adminCompleteOrder`
  exige buffer cumplido salvo `force:true` (registra en auditoría).
- **Disputas:** `dispute.exists/status`; resolver con `resolve-payment-dispute`,
  `open-dispute`, `close-dispute`. Cerrar disputa NO mueve fondos (se hace aparte).
- **Grupos de compra (pools):** `createPool`/`joinPool` exigen wallet + saldo (fondeo
  on-chain). `closePool` crea órdenes; con 1 solo member → refund. `reservedStock` reserva
  unidades; `availableStock = stock - reservedStock` (virtual).

---

## 7. AUTH: Supabase (y estado de Privy) — IMPORTANTE

**Migración Privy → Supabase: completada en backend (auth dual durante transición).**
- `verifyAuth` intenta Supabase y cae a Privy como fallback (`authSource`).
- `privateDid`/`supabaseId` NUNCA deben persistirse en `null` (dejar AUSENTES). Si aparecen
  colisiones `E11000 ... privyDid null`, correr `cd backend && node scripts/fixUserIndexes.mjs`
  (recrea índices `unique+sparse`). **Correr en cada entorno nuevo.**

**Sobre `@privy-io/react-auth` (lo que preguntó el usuario):**
- **La auth de Privy está ABANDONADA.** El paquete **sigue en `frontend/package.json`**
  pero **NO tiene imports reales** (solo aparece en COMENTARIOS de `Utils/authClient.jsx`).
- El frontend usa una **capa de compatibilidad** `frontend/src/Utils/authClient.jsx` que
  **expone la MISMA API de Privy** (`usePrivy`, `useWallets`, `useCreateWallet`,
  `PrivyProvider`→`AuthProvider`) pero por debajo usa **Supabase**. 71 archivos importan
  `authClient`. **NO reescribas esos imports**; es intencional (evita tocar 60+ componentes).
- **La FIRMA de wallet on-chain NO usa Privy:** hoy pasa por **Crossmint**
  (`frontend/src/Utils/crossmintWallet.js`, `@crossmint/wallets-sdk`). Privy quedó sólo
  como "forma" de API compatible.
- **Limpieza posible (no urgente):** se podría desinstalar `@privy-io/react-auth` del
  `package.json` porque no hay imports reales. Verificar antes con
  `grep -r "@privy-io" --include=*.jsx --include=*.js` (hoy sólo matches en comentarios).

---

## 7b. GAS PATROCINADO (drip multi-chain) — leer antes de tocar wallets

**La plataforma paga el gas** de las smart wallets Crossmint (firma EVM 100% client-side).
NO hay gas sponsorship premium (Crossmint lo exige en plan pago, sin pricing público) y
**el pago de fee en USDC propio sólo existe en Solana smart wallets**, no en EVM.

- **Modelo:** DRIP. `backend/src/services/gasDripService.js` transfiere moneda nativa
  (BNB/POL/ETH) desde `WALLET_PK` (wallet admin) al user, just-in-time, si su balance
  nativo < `GAS_DRIP_MIN_NATIVE`. Es **multi-chain** (resuelve provider+admin por
  `chainId` vía `getEscrowChainConfig`). Anti-abuso propio: `GAS_DRIP_MAX_PER_DAY`
  (default 5) + auditoría en el modelo `GasDrip`.
- **Endpoint puente:** `POST /api/gas/ensure` (`backend/src/routes/gasRoutes.js`, montado
  en `/api/gas`). Body `{ chain: "polygon-amoy"|"base-sepolia"|"bsc-testnet", opType }`.
  **Idempotente** (si ya tiene gas → `skipped`). 429 si superó el límite diario.
  Existe porque las tx NO pasan por el backend: el frontend pide el gas ANTES de firmar.
- **Frontend:** `Utils/ensureGas.js` (llama al endpoint), `config/opPolicy.js` (cuotas/hora
  + mínimos: send 2/h & mín US$1 · withdraw_collateral 2/h & mín US$5 · deposit_collateral
  5/h & mín US$20 · funding 15/h), `Utils/opRateLimit.js` (ventana deslizante 1h en
  localStorage por `address:chain:opType`).
- **Flujos enganchados:** `WalletPage.handleSend`, `CollateralManager.handleDeposit` y
  `handleWithdraw`. Patrón: mínimo → rate limit → `ensureGas` → firmar → `registerOp`.
- **⚠️ `OP_POLICY.enforce = false` HOY:** las cuotas solo AVISAN (no bloquean) en testnet.
  En producción → `true`. La barrera DURA actual es el **drip** + `GAS_DRIP_MAX_PER_DAY`.
- **NO** "se puede pagar el gas de otra persona" firmando una tx propia: en ERC-4337 el
  `msg.sender` de la UserOp es la smart wallet del user. La única forma es **pre-drip**.
- Migración a producción: Base + USDC único; evaluar paymaster con spend cap
  (Pimlico/Alchemy); rate limit al backend. Ver `pendientes.txt` (sección ANTI-ABUSO).

---

## 8. Frontend

- Auth: importá siempre desde `Utils/authClient` (NO desde `@privy-io/...`).
- Wallet/firma: `Utils/crossmintWallet.js` (o las utilidades de wallet del proyecto).
- Gas (pre-firma): `Utils/ensureGas.js` + `config/opPolicy.js` + `Utils/opRateLimit.js`.
- `Utils/axiosAuth.js`: manejo global de 401 (refresca token Supabase / maneja expiración).
- `store/useUserStore.js`: estado de usuario; admin según `role` del backend + `VITE_ADMIN_EMAILS`.
- Panel admin: `components/Admin*.jsx` (tablas de usuarios, órdenes, productos, etc.).
  Tablas usan scroll interno + sticky header + paginación (patrón replicado en
  `AdminOrdersTable.jsx`, `AdminUsersTable.jsx`).

---

## 9. Trampas conocidas (leer antes de editar)

- **⚠️ OneDrive (mientras el repo esté en `OneDrive/Desktop/Diseño Web/...`):** se detectó
  que `read_file` puede devolver una versión **desincronizada** del archivo real en disco
  (archivos "on-demand"/deshidratados). Síntoma: editás algo que "existe" pero Node ejecuta
  otra cosa → p.ej. **404 en una ruta aunque "se ve" en el editor**. Diagnóstico: verificar
  con `Select-String`/`Get-Content` en PowerShell o listar `router.stack`. **Mitigación:
  mover el repo FUERA de OneDrive** (recomendado). Ver §11 para el flujo de mudanza.
- **404 silencioso por import faltante:** si una ruta usa un handler que **no está
  exportado/importado**, Express registra `undefined` y responde **404** (no 500). Si una
  ruta "no existe" pero el código la tiene, revisá exports/imports.
- **Encoding:** algunos archivos tienen acentos rotos (`moderaci屈n`) por el entorno. Evitá
  re-guardar con otro encoding que rompa más; usá UTF-8.
- **Slug:** se genera en hook `pre-save` (`buildProductSlug`). En `updateProduct` (usa
  `findByIdAndUpdate`, NO dispara pre-save) se regenera a mano si cambia el `name`.
- **Duplicados de índice:** `Product` declara `views`/`sold` con default (hay `views`
  repetido en el schema; ojo al tocarlo). Hay warning de índice duplicado en `SellerCredit`.

---

## 10. Pendientes técnicos (backlog relevante)

- [ ] **Blindaje extra tienda→producto:** revalidar `shop.approved` en `getProducts`/
      `getProductById`/moderación (hoy sólo al crear). No urgente.
- [ ] **Paginación server-side de órdenes admin:** `/api/admin/orders` devuelve TODAS las
      órdenes; la tabla pagina en cliente (50/100). Migrar a `page`/`limit` si el volumen crece.
- [ ] **Fase 2 auth:** limpiar `testAuthRoutes.js` (temporal), setear `role="admin"` real,
      y opcionalmente desinstalar `@privy-io/react-auth`.
- [ ] Ver `pendientes.txt` en la raíz para el backlog funcional completo (es la fuente viva).

---

## 11. Mudanza fuera de OneDrive (flujo recomendado)

```shell
# 1) En la carpeta vieja (OneDrive): commitear estado estable
git add -A && git commit -m "wip: estado estable" && git push
# 2) Clonar fresco fuera de OneDrive
git clone <repo> C:\dev\MVP
# 3) Copiar los .env A MANO (git no los trae; deben estar en .gitignore)
#    backend/.env  y  frontend/.env
# 4) Instalar deps (node_modules no se clona)
cd C:\dev\MVP\backend && npm install
cd C:\dev\MVP\frontend && npm install
# 5) Verificar que levante y funcione; recién después borrar la carpeta vieja.
```
Comprobar lo no versionado que falte: `git status --ignored` en la carpeta vieja.

---

## 12. Reglas de oro para el agente

1. **Leé este archivo y el código real antes de asumir.** Si `read_file` parece raro,
   contrastá con PowerShell (`Select-String`, `Get-Content`).
2. **No rompas contratos de API** (`{success, message, ...}`) ni el shape compat de auth.
3. **No expongas secretos** (`.env`, claves, wallets privadas) en el cliente ni en logs.
4. **Comentá el "por qué"** en español, manteniendo el estilo del repo.
5. **Al mover/editar, verificá que el cambio quedó en disco** (node --check / relanzar).
6. **Si encontrás una trampa nueva, agregala a §9.** Este archivo es memoria compartida.
