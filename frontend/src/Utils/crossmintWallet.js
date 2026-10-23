/**
 * Utils/crossmintWallet.js
 * ────────────────────────────────────────────────────────────────────────────
 * Lógica de negocio para las wallets Crossmint (smart wallets ERC-4337).
 *
 * Reemplaza la creación de la embedded wallet que antes hacía Privy con
 * `useCreateWallet()`. Expone funciones puras (no hooks) para que puedan
 * llamarse desde cualquier flujo sin reescribir la integración.
 *
 * ── ARQUITECTURA CORRECTA DEL DEVICE SIGNER (leer) ──────────────────────────
 * Según la documentación de Crossmint y el propio SDK (v1.20.0), el DEVICE
 * SIGNER (clave P-256 en el dispositivo, firma SIN OTP) lo maneja el SDK
 * AUTOMÁTICAMENTE:
 *
 *   1. Al crear la wallet client-side, el SDK agrega un device signer solo
 *      (no hay que pasar `signers`). El device signer es el DEFAULT.
 *   2. Al firmar, el SDK usa el device signer LOCAL si existe.
 *   3. Los device signers son POR DISPOSITIVO: no se sincronizan. En un
 *      dispositivo nuevo, `wallet.needsRecovery()` devuelve true.
 *   4. En ese caso se llama a `wallet.recover()`: pide el recovery method
 *      (email → OTP) UNA sola vez, registra un NUEVO device signer para este
 *      dispositivo, y a partir de ahí TODAS las firmas son sin OTP.
 *   5. `useSigner()` NO hace falta: el device signer se auto-selecciona.
 *
 * ⚠️ Lo que NO hay que hacer (era la causa del OTP en cada operación):
 *   - NO crear device signers manualmente con `createDeviceSigner`.
 *   - NO llamar `useSigner(...)` a mano.
 *   - NO mapear claves con `mapAddressToKey`.
 *   Esas cosas pelean contra el manejo automático del SDK y terminan forzando
 *   el fallback al recovery (email) → OTP.
 *
 * ⚠️ Requiere en el .env del frontend:
 *     VITE_CROSSMINT_API_KEY=<apiKey pública de Crossmint>
 */
import { supabase } from "./supabaseClient";
import {
  createCrossmint,
  CrossmintWallets,
  IframeDeviceSignerKeyStorage,
  EVMWallet,
} from "@crossmint/wallets-sdk";
import { createPublicClient, http } from "viem";
import { polygonAmoy, baseSepolia } from "viem/chains";
import { onAuthRequired } from "./crossmintOtpBridge";

/**
 * Callbacks que le pasamos al SDK en las `options` de createWallet/getWallet.
 * `onAuthRequired` es OBLIGATORIO para que el flujo de RECOVERY (email signer)
 * pueda pedir el OTP. Se usa solo cuando el device signer no está disponible
 * en este dispositivo (primera vez / dispositivo nuevo).
 */
const CROSSMINT_CALLBACKS = { onAuthRequired };

// Chain por defecto para las wallets EVM. En pruebas usamos polygon-amoy.
export const CROSSMINT_CHAIN = "polygon-amoy";

// ── LECTURAS ON-CHAIN (public client con RPC EXPLÍCITO, POR RED) ────────────
// ⚠️ NO usamos `evm.getViemClient()` del SDK para LEER: internamente construye
// `http()` SIN url (RPC default de viem), que en Polygon Amoy es inestable o no
// responde → provoca errores de lectura ("No se pudo leer el contrato").
// Las lecturas no requieren firma, así que usamos un public client propio con
// un RPC confiable. Las ESCRITURAS sí siguen yendo por la smart wallet (firma).
//
// ⚠️ MULTIRED: el cliente de lectura es POR chain. Antes se usaba un único
// cliente de Amoy para todo, lo que hacía que leer el contrato de Base diera
// datos de Amoy (o "sin código"). Ahora cada chain tiene su cliente + RPC.
const READ_CONFIG = {
  "polygon-amoy": {
    chain: polygonAmoy,
    rpc:
      import.meta.env.VITE_POLYGON_AMOY_RPC ||
      "https://polygon-amoy-bor-rpc.publicnode.com",
  },
  "base-sepolia": {
    chain: baseSepolia,
    rpc: import.meta.env.VITE_BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  },
};

const publicClientCache = new Map(); // chain → public client
/** Public client de viem para LECTURAS (por red, con RPC explícito). */
function getPublicClient(chain = CROSSMINT_CHAIN) {
  const conf = READ_CONFIG[chain] || READ_CONFIG[CROSSMINT_CHAIN];
  if (!publicClientCache.has(conf.chain.id)) {
    publicClientCache.set(
      conf.chain.id,
      createPublicClient({ chain: conf.chain, transport: http(conf.rpc) }),
    );
  }
  return publicClientCache.get(conf.chain.id);
}

// Singleton del key storage del device signer (lo usa el SDK internamente).
let keyStorage = null;

/** Devuelve la API key de Crossmint validando que esté configurada. */
function getApiKey() {
  const apiKey = import.meta.env.VITE_CROSSMINT_API_KEY;
  if (!apiKey || String(apiKey).startsWith("PEGA_")) {
    throw new Error("Falta VITE_CROSSMINT_API_KEY en el .env del frontend.");
  }
  return apiKey;
}

/**
 * Key storage del device signer (P-256). El SDK lo usará internamente para
 * generar/leer la clave del dispositivo. NO lo usamos manualmente.
 */
export function getKeyStorage() {
  if (!keyStorage) {
    keyStorage = new IframeDeviceSignerKeyStorage(getApiKey());
  }
  return keyStorage;
}

/**
 * Construye un cliente Crossmint con el JWT FRESCO de la sesión de Supabase.
 */
async function buildClient() {
  const apiKey = getApiKey();
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) {
    throw new Error("No hay sesión de Supabase. Iniciá sesión primero.");
  }
  return createCrossmint({ apiKey, jwt });
}

// ── CACHÉ DE LA WALLET AUTENTICADA ─────────────────────────────────────────
// Reutilizamos la MISMA instancia de wallet entre operaciones. Recrearla en
// cada llamada reinicia el estado del device signer y puede disparar recovery
// (OTP) de nuevo. Se cachea por chain + usuario y se limpia al cerrar sesión.
const walletCache = new Map(); // `${chain}:${ownerKey}` → Promise<Wallet>
const evmWalletCache = new Map(); // `${chain}:${ownerKey}` → Promise<EVMWallet>

async function getOwnerKey() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    return user?.id || user?.email || "anon";
  } catch {
    return "anon";
  }
}

/** Limpia las cachés (p. ej. al cerrar sesión). */
export function clearWalletCache() {
  walletCache.clear();
  evmWalletCache.clear();
}

/**
 * Crea la smart wallet Crossmint para el usuario autenticado.
 *
 * ⚠️ NO pasamos `signers`: el SDK agrega el device signer automáticamente.
 *
 * @param {Object} [opts]
 * @param {string} [opts.chain]
 * @param {string} [opts.email] - Email para recovery (default: el de la sesión).
 * @returns {Promise<{ address: string, chain: string }>}
 */
export async function createUserWallet({ chain = CROSSMINT_CHAIN, email } = {}) {
  let recoveryEmail = email;
  if (!recoveryEmail) {
    const { data } = await supabase.auth.getSession();
    recoveryEmail = data.session?.user?.email;
  }
  if (!recoveryEmail) {
    throw new Error("La sesión no tiene email; no se puede crear la wallet.");
  }

  const crossmint = await buildClient();
  const wallets = CrossmintWallets.from(crossmint);

  const wallet = await wallets.createWallet({
    chain,
    recoveryMethods: [{ type: "email", email: recoveryEmail }],
    // El device signer se agrega automáticamente (no pasar `signers`).
    options: {
      deviceSignerKeyStorage: getKeyStorage(),
      callbacks: CROSSMINT_CALLBACKS,
    },
  });

  await wallet.waitForInit();
  return { address: wallet.address, chain: wallet.chain };
}

/**
 * Devuelve la INSTANCIA de wallet Crossmint lista para OPERAR.
 *
 * Clave del flujo SIN OTP:
 *   - Tras `getWallet` + `waitForInit`, el SDK auto-selecciona el device signer
 *     local si existe.
 *   - Si NO existe localmente (dispositivo nuevo), `needsRecovery()` es true;
 *     llamamos a `wallet.recover()` que pide el recovery (OTP) UNA vez y
 *     registra un nuevo device signer. Después, todo es frictionless.
 *
 * @param {Object} [opts]
 * @param {string} [opts.chain]
 * @returns {Promise<import("@crossmint/wallets-sdk").Wallet>}
 */
async function getSignableWallet({ chain = CROSSMINT_CHAIN } = {}) {
  const ownerKey = await getOwnerKey();
  const cacheKey = `${chain}:${ownerKey}`;
  if (walletCache.has(cacheKey)) {
    try {
      return await walletCache.get(cacheKey);
    } catch {
      walletCache.delete(cacheKey);
    }
  }
  const promise = buildSignableWallet({ chain });
  walletCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    walletCache.delete(cacheKey);
    throw err;
  }
}

async function buildSignableWallet({ chain = CROSSMINT_CHAIN } = {}) {
  const crossmint = await buildClient();
  const wallets = CrossmintWallets.from(crossmint);

  const wallet = await wallets.getWallet({
    chain,
    options: {
      deviceSignerKeyStorage: getKeyStorage(),
      callbacks: CROSSMINT_CALLBACKS,
    },
  });

  await wallet.waitForInit();

  // ⚠️ NO llamamos a `recover()` proactivamente.
  //
  // El SDK resuelve el signer SOLO al firmar: si hay un device signer LOCAL cuya
  // clave privada esté en este dispositivo, lo usa (sin OTP). Solo si NO hay
  // ningún device signer local, dispara el recovery (email OTP) en la primera
  // transacción — y eso lo maneja el propio SDK vía el `onAuthRequired` que le
  // pasamos en `options.callbacks`.
  //
  // Forzar `recover()` cuando `needsRecovery()` es true (que puede ser true
  // aunque haya un signer aprobado distinto en el dispositivo) provocaría un
  // OTP INNECESARIO. Lo dejamos al SDK.

  return wallet;
}

/**
 * Obtiene la wallet existente del usuario (con recovery ya resuelto si hacía
 * falta). Útil para flujos que necesitan asegurar que la wallet pueda firmar.
 *
 * @param {Object} [opts]
 * @param {string} [opts.chain]
 * @returns {Promise<{ address: string, chain: string }>}
 */
export async function getUserWallet({ chain = CROSSMINT_CHAIN } = {}) {
  const wallet = await getSignableWallet({ chain });
  return { address: wallet.address, chain: wallet.chain };
}

/**
 * Verifica si el usuario ya tiene una wallet Crossmint creada (sin crearla).
 * Devuelve null si no existe aún.
 */
export async function findUserWallet({ chain = CROSSMINT_CHAIN } = {}) {
  try {
    return await getUserWallet({ chain });
  } catch {
    return null;
  }
}

/**
 * Envía tokens desde la wallet Crossmint del usuario a una dirección destino.
 * Firma con el device signer (sin OTP tras la primera vez en el dispositivo).
 */
export async function sendToken({
  to,
  token,
  amount,
  chain = CROSSMINT_CHAIN,
} = {}) {
  if (!to || !token || amount === undefined || amount === null) {
    throw new Error("Faltan datos para enviar (to, token, amount).");
  }
  const wallet = await getSignableWallet({ chain });
  return wallet.send(to, token, String(amount));
}

/**
 * Devuelve la INSTANCIA de la smart wallet EVM lista para OPERAR. Punto de
 * entrada para escrituras a contratos (sendTransaction) y lecturas (viem).
 *
 * @param {Object} [opts]
 * @param {string} [opts.chain]
 * @returns {Promise<import("@crossmint/wallets-sdk").EVMWallet>}
 */
export async function getEvmWallet({ chain = CROSSMINT_CHAIN } = {}) {
  const ownerKey = await getOwnerKey();
  const cacheKey = `${chain}:${ownerKey}`;
  if (evmWalletCache.has(cacheKey)) {
    try {
      return await evmWalletCache.get(cacheKey);
    } catch {
      evmWalletCache.delete(cacheKey);
    }
  }
  const promise = (async () => {
    const wallet = await getSignableWallet({ chain });
    return EVMWallet.from(wallet);
  })();
  evmWalletCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    evmWalletCache.delete(cacheKey);
    throw err;
  }
}

/**
 * "Obtener o crear" la smart wallet del usuario — IDEMPOTENTE.
 *
 * ⚠️ Resuelve el bug de "wallet a medio crear": si `createUserWallet()` creó la
 * wallet en Crossmint pero la persistencia en Mongo falló (o el usuario recargó
 * antes de guardarla), un reintento de `createUserWallet()` da:
 *   "The owner already holds a wallet ... which doesn't match the provided
 *    config parameters."
 * Entonces primero INTENTAMOS leer la wallet existente; solo si no existe la
 * creamos. Devuelve `{ address, chain, created }`.
 *
 * @param {Object} [opts]
 * @param {string} [opts.chain]
 * @param {string} [opts.email]
 * @returns {Promise<{ address: string, chain: string, created: boolean }>}
 */
export async function ensureUserWallet({ chain = CROSSMINT_CHAIN, email } = {}) {
  // 1. ¿Ya existe una wallet para este usuario en esta red?
  const existing = await findUserWallet({ chain });
  if (existing?.address) {
    return { address: existing.address, chain: existing.chain || chain, created: false };
  }
  // 2. No existe: la creamos.
  try {
    const created = await createUserWallet({ chain, email });
    return { address: created.address, chain: created.chain, created: true };
  } catch (err) {
    // 3. Carrera/estado inconsistente: Crossmint dice que el owner YA tiene una
    //    wallet (p. ej. la creación previa se completó pero no respondió). En
    //    ese caso la recuperamos en lugar de propagar el error.
    const msg = String(err?.message || "");
    if (/already holds a wallet/i.test(msg) || /already.*wallet/i.test(msg)) {
      const recovered = await findUserWallet({ chain });
      if (recovered?.address) {
        return { address: recovered.address, chain: recovered.chain || chain, created: false };
      }
    }
    throw err;
  }
}

/** Devuelve la address (0x...) de la wallet del usuario autenticado. */
export async function getWalletAddress({ chain = CROSSMINT_CHAIN } = {}) {
  const wallet = await getSignableWallet({ chain });
  return wallet.address;
}

/**
 * Redes EVM que la app usa y en las que queremos dejar el device signer
 * registrado para firmar SIN OTP recurrente (colateral + pagos crypto).
 * El nombre es el que usa Crossmint (chain param).
 */
export const APP_EVM_CHAINS = ["polygon-amoy", "base-sepolia"];

// ── FLAG DE ACTIVACIÓN PERSISTENTE (localStorage) ─────────────────────────
// `wallet.needsRecovery()` NO es confiable como señal de UI: puede devolver
// true aunque la firma funcione (de ahí el "aviso fantasma" que no se iba).
// Por eso, cuando el usuario COMPLETA el flujo de activación (se haya pedido
// OTP o no —si no lo pidió es porque el device signer ya servía—) marcamos un
// flag por `address:chain` en localStorage. Este dispositivo queda "activado"
// y la UI se guía por el flag, no por needsRecovery().
const ACTIVATED_PREFIX = "nero_device_activated:";

function activationKey(address, chain) {
  return `${ACTIVATED_PREFIX}${String(address || "").toLowerCase()}:${chain}`;
}

/** ¿Este dispositivo ya completó la activación para esta wallet+red? */
export function isDeviceActivated({ address, chain = CROSSMINT_CHAIN } = {}) {
  try {
    if (!address) return false;
    return localStorage.getItem(activationKey(address, chain)) === "1";
  } catch {
    return false;
  }
}

/** Marca (o desmarca) este dispositivo como activado para esta wallet+red. */
export function markDeviceActivated({ address, chain = CROSSMINT_CHAIN, value = true } = {}) {
  try {
    if (!address) return;
    if (value) localStorage.setItem(activationKey(address, chain), "1");
    else localStorage.removeItem(activationKey(address, chain));
  } catch {
    /* localStorage no disponible: no es crítico */
  }
}

/** ¿Está activado en TODAS las redes de la app? */
export function isDeviceActivatedForAll({ address, chains = APP_EVM_CHAINS } = {}) {
  return chains.every((chain) => isDeviceActivated({ address, chain }));
}

/**
 * "Desbloquea" el device signer para una red: si la wallet de esa red todavía
 * no tiene registrado este device (needsRecovery → true), llama a `recover()`,
 * que dispara el flujo de verificación por email (OTP) UNA sola vez y registra
 * el device signer para ese dispositivo en esa red. En adelante, las firmas en
 * esa red son silenciosas.
 *
 * ⚠️ El device signer es por DISPOSITIVO; la wallet es por RED. Por eso hay que
 * hacer esto una vez por cada red que el usuario vaya a usar (aunque el OTP sea
 * "el mismo tipo de verificación").
 *
 * Tras completar (haya pedido OTP o no), marca el flag persistente de activación
 * para que la UI no vuelva a mostrar el aviso.
 *
 * @returns {Promise<{ chain: string, alreadyReady: boolean }>}
 */
export async function activateDeviceSigner({ chain = CROSSMINT_CHAIN } = {}) {
  const wallet = await getSignableWallet({ chain });
  const needs = typeof wallet.needsRecovery === "function"
    ? Boolean(wallet.needsRecovery())
    : false;
  let alreadyReady = true;
  if (needs) {
    if (typeof wallet.recover === "function") {
      // Dispara el OTP real (onAuthRequired → CrossmintOtpModal).
      await wallet.recover();
      alreadyReady = false;
    }
  }
  // Si no hizo falta OTP, el device signer ya servía → también queda activado.
  markDeviceActivated({ address: wallet.address, chain });
  return { chain, alreadyReady };
}

/**
 * Activa el device signer para varias redes (secuencial, para que el usuario
 * vea un solo flujo de OTP a la vez). Devuelve un resumen por red.
 *
 * @param {string[]} [chains]
 * @returns {Promise<Array<{ chain: string, ok: boolean, alreadyReady?: boolean, error?: string }>>}
 */
export async function activateForChains(chains = APP_EVM_CHAINS) {
  const results = [];
  for (const chain of chains) {
    try {
      const r = await activateDeviceSigner({ chain });
      results.push({ chain, ok: true, alreadyReady: r.alreadyReady });
    } catch (error) {
      results.push({ chain, ok: false, error: error?.message || "Error" });
    }
  }
  return results;
}

/**
 * ¿Este dispositivo NECESITA autorizar (OTP por email) antes de firmar?
 *
 * Según la doc de Crossmint, los device signers son POR DISPOSITIVO. En un
 * dispositivo/navegador nuevo (o si se borró el storage del iframe
 * `crossmint-signer.io`), `wallet.needsRecovery()` es true y la primera firma
 * dispara el recovery por email (OTP). Después de esa única vez, las firmas
 * son silenciosas.
 *
 * Esta función SOLO CONSULTA (no dispara ningún OTP). Sirve para avisarle al
 * usuario con un mensaje claro ANTES de iniciar una transacción.
 *
 * @returns {Promise<boolean>} true si va a pedir autorización por código.
 */
export async function deviceNeedsRecovery({ chain = CROSSMINT_CHAIN } = {}) {
  try {
    const wallet = await getSignableWallet({ chain });
    return typeof wallet.needsRecovery === "function"
      ? Boolean(wallet.needsRecovery())
      : false;
  } catch (error) {
    // Si no se puede determinar (p. ej. wallet aún sin init), NO bloqueamos:
    // dejamos que el SDK maneje el recovery al firmar si hiciera falta.
    console.warn("deviceNeedsRecovery: no se pudo determinar; asumimos false:", error);
    return false;
  }
}

/**
 * Lee una función `view`/`pure` de un contrato usando un public client con RPC
 * EXPLÍCITO. No gasta gas ni requiere firma (no usa la smart wallet).
 */
export async function readContract({
  address,
  abi,
  functionName,
  args = [],
  chain = CROSSMINT_CHAIN,
} = {}) {
  if (!address || !abi || !functionName) {
    throw new Error("Faltan datos para leer el contrato (address, abi, functionName).");
  }
  const client = getPublicClient(chain);
  return client.readContract({ address, abi, functionName, args });
}

/**
 * Escribe (llama a una función de estado) en un contrato. La firma la hace el
 * device signer (sin OTP tras el primer recovery en el dispositivo).
 *
 * @returns {Promise<{ hash: string, transactionId: string, explorerLink?: string }>}
 */
export async function writeContract({
  address,
  abi,
  functionName,
  args = [],
  value,
  chain = CROSSMINT_CHAIN,
} = {}) {
  if (!address || !abi || !functionName) {
    throw new Error("Faltan datos para escribir en el contrato (address, abi, functionName).");
  }
  const evm = await getEvmWallet({ chain });
  const res = await evm.sendTransaction({
    to: address,
    abi,
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  });
  // Una firma exitosa implica que el device signer quedó usable en esta red:
  // marcamos el flag para que la UI no vuelva a mostrar el aviso de activación.
  try {
    const addr = await getWalletAddress({ chain });
    markDeviceActivated({ address: addr, chain });
  } catch {
    /* no bloqueante */
  }
  return res;
}

/**
 * Aprueba a un `spender` para gastar `amount` (unidades base) de un ERC-20.
 *
 * @returns {Promise<{ hash: string, transactionId: string, explorerLink?: string }>}
 */
export async function approveToken({
  tokenAddress,
  spender,
  amount,
  chain = CROSSMINT_CHAIN,
} = {}) {
  if (!tokenAddress || !spender || amount === undefined || amount === null) {
    throw new Error("Faltan datos para aprobar (tokenAddress, spender, amount).");
  }
  const erc20ApproveAbi = [
    {
      type: "function",
      name: "approve",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ];
  return writeContract({
    address: tokenAddress,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [spender, amount],
    chain,
  });
}

/**
 * Lee el código EVM depositado en una dirección (eth_getCode). Devuelve:
 *   - string "0x..."  → la dirección TIENE contrato (bytecode).
 *   - "0x"            → NO hay contrato (EOA o dirección sin deployar).
 *
 * Sirve para detectar "depósitos fantasma": si el contrato de colateral apunta
 * a una dirección sin código, las tx se "minan" pero no ejecutan nada real.
 *
 * @param {Object} opts
 * @param {string} opts.address - Dirección a inspeccionar.
 * @param {string} [opts.chain]
 * @returns {Promise<string>} el bytecode como hex ("0x" si vacío).
 */
export async function getContractCode({ address, chain = CROSSMINT_CHAIN } = {}) {
  if (!address) throw new Error("Falta la dirección para leer el código.");
  const client = getPublicClient(chain);
  return client.getCode({ address });
}

/** ¿La dirección tiene bytecode? (true = contrato real). */
export async function hasContractCode({ address, chain = CROSSMINT_CHAIN } = {}) {
  const code = await getContractCode({ address, chain });
  return Boolean(code) && code !== "0x" && code.length > 2;
}
