# Checklist de Lanzamiento — Mercado Nero

> Estado: **Beta cerrada (tiendas propias)** en preparación.
> Objetivo de esta fase: validar el flujo completo de punta a punta con tiendas
> administradas por el operador, montos chicos y sin abrir a terceros.
>
> Regla de oro: **"Beta cerrada exitosa" NO es lo mismo que "listo para abrir a
> terceros"**. Son dos hitos distintos. Este documento separa ambos.

---

## 0. Contexto y alcance del MVP

### Dejado AFUERA del MVP (explícito)
- [ ] Red social (posts y reels) — hasta tener tráfico.
- [ ] Pools de compras grandes (+10 productos / fábrica / importadores).
- [ ] **Social selling (compras grupales hasta 5 users)** — *decisión pendiente*;
      recomendado dejarlo afuera de la beta cerrada (ver sección "Por definir").

### Retenido en el MVP (ya implementado en código)
- Transferencia bancaria + crypto multichain.
- Cashback en todas las compras (bank + crypto).
- Sistema de referidos con reparto 75/25 (referidor/comprador).
- Carga masiva de productos por Excel.
- Chat entre usuarios (gate: solo con orden activa).
- Notificaciones in-app + email.
- Aprobación manual de publicaciones por el admin.
- Disputas resueltas manualmente por el operador.

---

## 1. HITO A — Beta cerrada (tiendas propias)

> Criterio de salida: el operador puede comprar y vender de punta a punta sus
> propios productos, con pocas órdenes reales y montos chicos.

### 1.1 Funcionalidades "sí o sí" — validar en testnet
- [ ] **Transferencia bancaria**: creación de orden, colateral lock/release en las 3 redes (Polygon Amoy, BSC testnet, Base Sepolia).
- [ ] **Crypto multichain**: fondeo de escrow → release manual admin → cancelación → refund.
- [ ] **Cashback**: acredita correctamente en **ambos** flujos (bank y crypto). Verificar `cashbackService.accrueCashbackForOrder` en `adminCompleteOrder`.
- [ ] **Referidos 75/25**: atribución por `?ref=`, split referidor/comprador (config `referrerSharePercent`), acreditación al completar.
- [ ] **Carga masiva Excel**: probar importación real (operador lo hace manual).
- [ ] **Chat**: verificar gate "solo con orden activa".
- [ ] **Notificaciones in-app + email**: revisar que no haya dominios/remitentes de dev.

### 1.2 Flujo de cierre de orden (manual)
- [ ] Comprador confirma recepción → orden pasa a `reception_confirmed`.
- [ ] Buffer de `RELEASE_BUFFER_HOURS=24` funciona y se comunica al usuario.
- [ ] Aviso visible: **"liberación luego de 24 hs de la confirmación del comprador"**.
      La UI no debe prometer un tiempo menor en ningún lado.
- [ ] Admin (`adminCompleteOrder`) libera correctamente en bank y crypto.
- [ ] `force:true` (omitir buffer) queda auditado en `orderActions`.

### 1.3 Panel admin
- [ ] Aprobación de publicaciones.
- [ ] **Gestión de disputas** (gap conocido: mejorar UI admin + vista en la orden).
- [ ] Cola de órdenes pendientes de liberación.
- [ ] Ajuste manual de cashback/referidos si hace falta.

### 1.4 Operación mínima (no bloqueante pero recomendado)
- [ ] Backup diario de Mongo (aunque sea manual por cron/script).
- [ ] Alerta de caída de: API dólar (dolarapi), servicio de emails, RPC de las redes.
- [ ] Kill switch básico en env (deshabilitar crypto o creación de órdenes si algo falla).
- [ ] Admin de guardia: **el operador** (24/7 en fase 1, por decisión consciente — pocas órdenes).

### 1.5 Legal / confianza
- [ ] Términos y Condiciones: base existe, **falta contenido** (completar antes de beta o mínimo al abrir).
- [ ] Política de privacidad.
- [ ] Botón de arrepentimiento (Ley 24.240 AR).
- [ ] Disclaimer de modelo: "proveedor de protección de pagos; problemas de calidad
      del producto se resuelven entre las partes". Redactado y visible.
- [ ] Ratings/reviews habilitados (sustituyen KYC en esta fase) y visibles en ficha.

### 1.6 Onboarding / comunicación
- [ ] Guía de creación de wallet (Crossmint) — mayor fricción técnica del comprador.
- [ ] Mensaje claro: el código de verificación llega de **Crossmint**, no de Mercado Nero.
- [ ] Guía de uso del programa de recompensas (2.5% cashback + referidos 75/25).
- [ ] Email de bienvenida.
- [ ] **Waiting list** para captar interés mientras dura la beta cerrada (form → colección → panel admin para invitar).

---

## 2. HITO B — Apertura a terceros (fase 2, NO en 15 días)

> No arrancar hasta completar Hito A con resultados estables.

- [ ] **Contratos en mainnet** (réplica de testnet) + **auditoría** (externa o revisión básica mínima).
- [ ] Switch completo de config: RPC, contratos, tokens, chainIds, `WALLET_NETWORKS`
      (incluye dirección/decimals de stablecoin mainnet y `locator` de Crossmint).
- [ ] Escrow mainnet probado con montos reales mínimos ($1–5) en ciclo completo.
- [ ] KYC **voluntario** revisado (sube confianza al escalar).
- [ ] TYC completos + revisión legal (responsabilidad frente a consumidor).
- [ ] Disputas con SLA definido y panel admin pulido.
- [ ] Monitoreo profesional + alertas + on-call (deja de ser manual).
- [ ] Automatización del release (opcional; hoy 100% manual por diseño).
- [ ] Proceso de alta de vendedores (onboarding, validación, aprobación).

---

## 3. Por definir

- [ ] **Social selling (compras grupales ≤5 users)**: incluir o no en la beta.
      Recomendación: **afuera** para la beta cerrada (suma complejidad de
      precios escalonados/tiers sin validar). Revisar que su remoción no arrastre
      lógica compartida con el flujo crypto normal (`groupBuy` / `SocialSellingSection`).
- [x] Reparto de referidos: **75/25** (referidor/comprador) como estado actual,
      configurable en `ReferralConfig.referrerSharePercent`. Antes era 50/50 fijo.

---

## 4. Notas técnicas / deuda conocida

- `WalletPage.jsx > WALLET_NETWORKS`: USDXM (Polygon Amoy, 6 dec) hardcodeado.
  Al pasar a mainnet: actualizar dirección, decimals y `locator` de Crossmint.
- `WalletPage.jsx`: en vista sin wallet, revisar copy "Activá tu wallet para poder
  usarlas o retirarlas / Uso a partir de 5 USDT" — correcto funcionalmente, pero
  validar claridad visual.
- Acreditación de cashback/referidos corre en `adminCompleteOrder` (idempotente,
  no bloqueante). La paridad con el flujo viejo ya está cubierta.

---

## 5. Riesgos principales

1. **Mainnet no está deployado** — es el blocker real de apertura a terceros, no las funcionalidades.
2. **Sin auditoría de contratos** — aceptable para beta cerrada, **no** para dinero de terceros.
3. **Release manual** — válido en fase 1; riesgo operativo si el volumen crece.
4. **Sin KYC** — aceptable en beta con tiendas propias; sube riesgo al abrir a terceros.
5. **Legal "en el aire de la blockchain"** — el disclaimer ayuda pero no exime
   de responsabilidad frente al consumidor en AR. Consultar con abogado antes de escalar.
