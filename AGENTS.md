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
- **Auth:** **Supabase Auth** — ÚNICA fuente (Privy ELIMINADO, ver §7).
- **Wallets / on-chain:** **Crossmint** (`@crossmint/wallets-sdk`) para firma de wallet.
- **Blockchain:** BSC, Base, Polygon — escrow (`NeroEscrow`), colateral (`NeroCollateral`)
  y compra grupal (`NeroGroupBuy`). ABIs en `backend/contracts/`.
- **Envío:** Zipnova (integrado desde backend). **Emails:** Resend.
- **Pagos:** transferencia bancaria (flujo colateral) o cripto (escrow USDT/USDC).

> ⚠️ **DOCS vs CÓDIGO.** Ver `backend/PENDIENTES_FINAL.TXT` (fuente viva del backlog).
> Ojo: `featureFlags.js` tiene `SOCIAL_SELLING_ENABLED = false` **y** `BannerCarousel.jsx`
> navega a **`/compras-grupales`**: si esa ruta redirige, esos banners (desktop y mobile)
> son callejones sin salida. Revisar antes de lanzar.

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
`rewards`, `review`, `notification`, `message`, `redirect`.

Montaje en `index.js`. **`/api/admin`** tiene dos routers: el principal y
`adminStoreRoutes` montado aparte en `/api/admin/store-connections`.

### Middlewares y ORDEN CRÍTICO
- `verifyAuth` → valida SOLO contra Supabase e inyecta `req.user = { did, email, authSource:"supabase" }`.
- `attachUser` → busca el User de Mongo (por `supabaseId`, fallback `email`) e inyecta
  `req.user._id`, `req.user.role`, `req.user.walletAddress`.
- `isAdmin` → `req.user.role === "admin"` o email en `ADMIN_EMAILS`. **Requiere `attachUser` ANTES.**
- `requireSellerOnboarding` → para CREAR/importar publicaciones (TODAS). Bloquea si:
  `blocked:"onboarding"` (falta onboarding), `blocked:"approval"` (tienda en lista de
  espera, sin aprobar) o `blocked:"wallet"` (producto de pago sin wallet). Aplica a
  `POST /create` y `POST /bulk-import`. Ver §5b (waiting list).

Orden típico en admin: `verifyAuth, attachUser, isAdmin, handler`.

- `requireElitAccess` → gate del CATÁLOGO DE PROVEEDORES (Elit). Deja pasar a
admins (`role` o `ADMIN_EMAILS`) **o** a emails en `ELIT_ALLOWED_EMAILS`
(`.env`, separados por coma, minúsculas). Se monta como
`[verifyAuth, attachUser, requireElitAccess]` en `elitRoutes.js`. Cierra la
brecha de que antes CUALQUIER user logueado podía pegarle a `/api/elit/*`.
En el front, `useUserStore.canUseElitCatalog` (admin o email en
`VITE_ELIT_ALLOWED_EMAILS`) muestra el link "Proveedor" y gatea la ruta.
⚠️ Compara contra el email de la JWT de Supabase (`req.user.email`), no el
del perfil. Cuenta habilitada hoy: `atomichardware@protonmail.com`.

### Modelos (`backend/src/models/`)
`User`, `Product`, `Order`, `Pool`, más configs (`ReferralConfig`, escrow, etc.).
- **User:** `supabaseId` (opcional, sparse) + `role`. El campo `privyDid` fue **eliminado**.
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

> **Blindaje resuelto:** la regla "tienda NO habilitada ⇒ nada visible" se REVALIDA
> en `getProducts`, `getProductById` y `getPublicUserProfile` mediante el helper
> `sellerCanSellPublicly` (`productController.js`). Exige `accountStatus:"active"` **Y**
> `shop.active` **Y** `shop.approved`. Es la segunda barrera: `PATCH /api/admin/users/:id/shop`
> ya pausa los productos (`active→paused`) al desactivar la tienda, pero así no depende de
> que nadie se acuerde de pausarlos (cubre scripts, importadores y bugs futuros).

### 5c. MENÚ DE CATEGORÍAS: derivado de PRODUCTOS EXISTENTES (no lista fija)

> **Regla:** si no hay productos visibles de la categoría X, **X no aparece en el menú**.
> No tiene sentido permitir navegar a una página que dice "todavía no hay productos".

- **Fuente de verdad del MENÚ = productos existentes.** `GET /api/product/categories`
  (`getVisibleCategories` en `productController.js`) devuelve los slugs de categoría con
  al menos un producto **visible**, aplicando la MISMA regla que `getProducts`
  (`status:"active"` + `moderation.status:"approved"` + `sellerCanSellPublicly` + wallet
  si es producto de pago). Devuelve solo slugs; el front los traduce a nombre con
  `data/allCategories.js`.
  - **Por qué no un `distinct` solo:** la visibilidad depende del vendedor (tienda/wallet),
    que no se puede evaluar en un `distinct`. Se usa `distinct` para acotar candidatas
    (≤32) y luego se valida por categoría con proyección mínima.
- **Front:** `Utils/useVisibleCategories.js` (hook con cache en módulo + suscriptores).
  Usado por `Header.jsx` (desktop y mobile). Muestra **spinner** mientras carga y un
  mensaje explícito si no hay ninguna categoría (nunca un dropdown vacío).
- **`frontend/src/data/categories.js` FUE BORRADO.** Era una lista fija con slugs que no
  existen en el catálogo (`supermercado`, `hogar-y-muebles`, `televisores`, `moda`,
  `para-tu-negocio`, `mas-vendidos`, `tiendas-oficiales`) → todos callejones sin salida a
  "Sin resultados". **No la resurrectes.**
- **⚠️ NO confundir las dos fuentes:** el menú es dinámico (productos), pero el **selector
  del formulario de publicación** sigue siendo `config/launchCategories.js` (lista FIJA).
  Si el selector se derivara de productos, un vendedor nuevo vería un dropdown vacío
  (problema del huevo y la gallina). Ver §5b.
- **Solo Productos** habilitado: Vehículos, Inmuebles y Servicios están con candado
  (`ListingTypeSelector`) y no deben aparecer en el menú. Como la regla es "sin productos
  no hay entrada", desaparecen solos.
- **⚠️ ORDEN DE RUTAS:** `GET /categories` va **antes** de `GET /:id` en `productRoutes.js`,
  si no Express lo matchea como un id y devuelve 404.
- **Cache:** es por sesión (módulo). Si se aprueba/publica un producto y querés ver la
  categoría nueva sin recargar, llamá `invalidateVisibleCategories()`.

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

## 7. AUTH: Supabase (Privy ELIMINADO) — IMPORTANTE

**TODO EL RESIDUO DE PRIVY FUE LIMPIADO.** Detalle de lo que se hizo y por qué:

- **`verifyAuth`** valida SOLO contra Supabase. Se quitó el fallback a Privy.
  Inyecta `req.user = { did, email, authSource:"supabase" }`. El campo `did` se
  conserva como NOMBRE (es el uuid de Supabase) porque decenas de handlers hacen
  `req.user.did`; renombrarlo obligaría a tocar todo el backend sin ganar nada.
- **`supabaseId` NUNCA debe persistirse en `null`** (dejar AUSENTE): `sparse` excluye
  campos ausentes, pero `null` SÍ colisionaría en el índice único. Para asegurar los
  índices corré `cd backend && node scripts/fixUserIndexes.mjs` (**en cada entorno nuevo**).
- **`middleware/auth.js` fue BORRADO.** Era un `verifyPrivyToken` que NADIE importaba
  (0 usos). Si lo ves referenciado en algún doc viejo, está mal.
- **`@privy-io/server-auth` y `@privy-io/react-auth` fueron DESINSTALADOS** de ambos
  `package.json` y del `node_modules`. No los reinstales.
- **Modelo `User`:** el campo `privyDid` se **eliminó del schema**. El índice
  `privyDid_1` se borra de la DB con `fixUserIndexes.mjs`.
- **`ADMIN_PRIVY_ID` eliminado** de `isAdmin.js`. Admin = `role === "admin"` o email
  en `ADMIN_EMAILS`.

**Qué SE CONSERVA a propósito (NO lo borres):**

- `frontend/src/Utils/authClient.jsx`: es una capa de compatibilidad con la FORMA de
  la API de Privy (`usePrivy`, `AuthProvider`). Por debajo usa Supabase. **68 archivos**
  importan `authClient`. Reescribir esos imports no aporta nada y arriesga romper.
- `frontend/src/Utils/authWallets.jsx`: expone **solo `useWallets()`**, que 5 componentes
  usan y de donde leen `wallets?.[0]?.address`. **`useCreateWallet()` se borró** (era un
  no-op que nadie llamaba).

**La firma de wallet on-chain NUNCA usó Privy:** pasa por **Crossmint**
(`frontend/src/Utils/crossmintWallet.js`, `@crossmint/wallets-sdk`). Crear wallet =
`createUserWallet` / `ensureUserWallet`, NO `useCreateWallet`.

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
  OJO: el rate limit vive en `localStorage` del navegador → es UX, NO seguridad; un script
  lo borra y lo saltea. Lo infalsificable hoy es el tope de drips del backend. Para cerrarlo
  de verdad, mover el conteo al backend (el `opType` YA llega a `/api/gas/ensure` y se
  descarta) contando por tipo en la colección `GasDrip`.
- **Sección "Garantías de Vendedor"** (`CollateralManager` en `WalletPage`): gateada por
  `isSeller && shopEnabled`, donde `shopEnabled = shop.active && shop.approved`. NO alcanza
  con `isSeller`/tener productos: un vendedor en lista de espera o con tienda desactivada
  puede conservar publicaciones viejas y NO debe ver la sección.
- **NO** "se puede pagar el gas de otra persona" firmando una tx propia: en ERC-4337 el
  `msg.sender` de la UserOp es la smart wallet del user. La única forma es **pre-drip**.
- Migración a producción: Base + USDC único; evaluar paymaster con spend cap
  (Pimlico/Alchemy); rate limit al backend. Ver `pendientes.txt` (sección ANTI-ABUSO).

---

## 8. Frontend

- Auth: importá siempre desde `Utils/authClient` (NO existe `@privy-io/...`, fue desinstalado).
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
- **`escape` de strings multilínea:** NUNCA metas el string de búsqueda dentro del
  `new_string` al usar `single_find_and_replace` con bloques de varias líneas: si el
  `old_string` corta a mitad de línea, se pierde el resto del texto. Después de CUALQUIER
  edición multilínea, verificar con `git diff -- <archivo>` antes de seguir.
- **Reemplazar una cadena que TERMINA en `);`:** si hacés `X(...).select("-campo");` →
  `X(...);` hay riesgo de comerse un `)` o una línea del bloque siguiente. Después de
  tocar cadenas de query, correr SIEMPRE `node --check <archivo>` (no alcanza con mirar).
- **Migrar un campo de la DB:** antes de borrar un campo del schema, contar cuántos docs
  lo usan y si son la ÚNICA identidad de alguno (`db.users.countDocuments({campo:{$exists:true}})`).
  Si nadie depende de él, se borra; si hay docs que solo tienen ese id, se migran primero.
- **⚠️ `walletAddress` JAMÁS se escribe desde `sync-user`** (bug crítico 2026-11). El
  endpoint `POST /api/auth/sync-user` aceptaba `walletAddress` del body y la guardaba si el
  campo estaba vacío. Como `useSyncUser` mandaba `user.wallet.address` —que `authClient`
  arma desde `dbUser.walletAddress` del store de Zustand **persistido en localStorage**—
  un cambio de sesión SIN `logout()` (otra pestaña, magic link con otro mail, expiración +
  re-login) hacía que el usuario NUEVO heredara la wallet del ANTERIOR. Incidente real:
  `atomichardware@protonmail.com` quedó con la address del admin. FIX aplicado en 3 capas:
  1. **backend `authRoutes.js`**: `sync-user` NUNCA asigna `walletAddress`; el body solo
     sirve para detectar colisión → 409 `WALLET_ALREADY_LINKED`. Un user nuevo nace SIN wallet.
  2. **frontend `authClient.jsx`**: solo expone `user.wallet` si `dbUser.supabaseId ===
     session.user.id`; si detecta store de otra sesión, lo limpia (`clearUser` +
     `clearWalletCache`).
  3. **frontend `userSync.jsx`**: `resolveWalletAddress()` devuelve `undefined` si el store
     no corresponde a la sesión activa.
  Regla: la wallet es dato de **negocio** y solo se vincula por `POST /api/user/wallet`
  (`saveWallet`, que valida formato + unicidad). Auditoría: `node scripts/auditWalletCollisions.mjs`
  (solo lectura; `--fix` quita la wallet a no-admins que tengan la de un admin).
- **Store `user-storage` (Zustand) sobrevive al cambio de sesión:** `logout()` sí lo limpia,
  pero cambiar de usuario de Supabase sin pasar por `logout()` NO. Todo dato de negocio
  leído desde `dbUser` debe validarse contra `session.user.id` (ver punto anterior).

---

## 10. Pendientes técnicos (backlog relevante)

- [ ] **Paginación server-side de órdenes admin:** `/api/admin/orders` devuelve TODAS las
      órdenes; la tabla pagina en cliente (50/100). Migrar a `page`/`limit` si el volumen crece.
- **Fase 2 auth:** setear `role="admin"` real en la BD (hoy el admin entra por
      `ADMIN_EMAILS`). `testAuthRoutes.js` y `@privy-io` ya NO existen.
- [ ] Ver `backend/PENDIENTES_FINAL.TXT` para el backlog funcional completo (fuente viva).

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
