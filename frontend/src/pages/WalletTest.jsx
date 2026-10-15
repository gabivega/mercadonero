import { useEffect, useRef, useState } from "react";
import { supabase } from "../Utils/supabaseClient";
import {
  createCrossmint,
  CrossmintWallets,
  IframeDeviceSignerKeyStorage,
  EVMWallet,
} from "@crossmint/wallets-sdk";
// Manejo del OTP del EMAIL SIGNER (recovery). Ver Utils/crossmintOtpBridge.js.
import { onAuthRequired } from "../Utils/crossmintOtpBridge";

/**
 * WalletTest
 * ----------
 * Página AISLADA para probar Crossmint Wallets (smart wallets ERC-4337).
 * NO usa Privy, NO toca el flujo actual de la app. Solo sirve para validar:
 *   1. Login con Supabase (JWT) -> Crossmint (owner = sub del JWT).
 *   2. Crear wallet en polygon-amoy (testnet).
 *   3. Device signer (firma sin OTP) — AUTOMATICO, sin codigo manual.
 *   4. Leer balances / fondear en staging / transferir.
 *
 * Ruta: /wallet-test  (publica, fuera de DashboardLayout)
 *
 * ── FLUJO CORRECTO DEL DEVICE SIGNER (SDK-puro, v1.20.0) ────────────────────
 *   - createWallet NO recibe `signers`: el device signer se agrega solo.
 *   - NO se usa createDeviceSigner, useSigner ni mapAddressToKey a mano: pelean
 *     contra el manejo automatico del SDK y forzaban OTP en cada operacion.
 *   - getWallet + waitForInit deja el estado consistente. Si este dispositivo no
 *     tiene device signer local -> needsRecovery() = true -> recover() pide el
 *     recovery (email OTP) UNA vez y registra un device signer nuevo. Despues,
 *     las firmas son SILENCIOSAS (sin OTP).
 *
 * ── NOTA SOBRE resolveAvailability (por que NO forzamos recover) ────────────
 *   El SDK decide el signer internamente al firmar:
 *     1. Si getKey(address) local devuelve una clave -> la usa (sin OTP).
 *     2. Si no, busca entre los signers registrados alguno cuya privada tenga
 *        el dispositivo y lo mapea (sin OTP).
 *     3. Si ninguno -> needs-recovery (pide OTP una vez via onAuthRequired).
 *   Por eso confiamos en el SDK y NO llamamos recover() de forma proactiva.
 */

// Testnet por defecto soportada por el SDK de smart wallets.
const DEFAULT_CHAIN = "polygon-amoy";

// Chains que Crossmint soporta por entorno (segun el SDK):
//   TESTNET: abstract-testnet, arbitrum-sepolia, avalanche-fuji, base-sepolia,
//            celo-sepolia, curtis, ethereum-sepolia, flow-testnet,
//            mantle-sepolia, optimism-sepolia, polygon-amoy, robinhood-chain-testnet,
//            scroll-sepolia, sei-atlantic-2-testnet, story-testnet, zora-sepolia, ...
//   MAINNET: abstract, apechain, arbitrum, base, bsc, celo, ethereum, polygon, ...
// OJO: "bsc-testnet" NO esta soportada; BSC solo existe como mainnet ("bsc").
const KNOWN_CHAINS = [
  "polygon-amoy",
  "base-sepolia",
  "arbitrum-sepolia",
  "ethereum-sepolia",
  "bsc-testnet", // a proposito: para comprobar en vivo que NO esta soportada
];

export default function WalletTest() {
  const [session, setSession] = useState(null);
  const [log, setLog] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);

  // Chain parametrizable por URL (?chain=bsc-testnet) o por el selector.
  const [chain, setChain] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("chain");
    return q || DEFAULT_CHAIN;
  });

  // Key storage del device signer (singleton). Lo usa el SDK internamente.
  const keyStorageRef = useRef(null);

  const push = (msg, data) => {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => [
      { ts, msg, data: data !== undefined ? JSON.stringify(data, null, 2) : null },
      ...prev,
    ]);
    console.log(`[WalletTest] ${msg}`, data ?? "");
  };

  // 1. Sesion de Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) push("Sesion Supabase detectada", data.session.user.email);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Crea (una vez) el key storage del device signer. El cliente Crossmint se
  // crea por llamada porque createCrossmint devuelve un objeto NUEVO con el JWT.
  const getKeyStorage = () => {
    const apiKey = import.meta.env.VITE_CROSSMINT_API_KEY;
    if (!apiKey || apiKey.startsWith("PEGA_")) {
      throw new Error("Falta VITE_CROSSMINT_API_KEY en el .env del frontend");
    }
    if (!keyStorageRef.current) {
      push("Crossmint apiKey (prefijo)", apiKey.slice(0, 12) + "...");
      keyStorageRef.current = new IframeDeviceSignerKeyStorage(apiKey);
    }
    return keyStorageRef.current;
  };

  // Devuelve un cliente Crossmint con el JWT FRESCO de Supabase YA incorporado.
  // Importante: createCrossmint devuelve un objeto NUEVO (no muta).
  const buildClient = async () => {
    const apiKey = import.meta.env.VITE_CROSSMINT_API_KEY;
    if (!apiKey || apiKey.startsWith("PEGA_")) {
      throw new Error("Falta VITE_CROSSMINT_API_KEY en el .env del frontend");
    }
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token || session?.access_token;
    if (!jwt) throw new Error("No hay JWT de Supabase disponible. Logueate primero.");
    const crossmint = createCrossmint({ apiKey, jwt });
    getKeyStorage();
    push("JWT incorporado al cliente Crossmint", {
      largo: jwt.length,
      prefijo: jwt.slice(0, 12) + "...",
    });
    return { crossmint, jwt };
  };

  // Opciones que SIEMPRE le pasamos al SDK (key storage + callbacks de OTP).
  const walletOptions = () => ({
    deviceSignerKeyStorage: getKeyStorage(),
    callbacks: { onAuthRequired },
  });

  // 2. Crear wallet. SDK-puro: SIN `signers`, SIN createDeviceSigner, SIN
  //    useSigner. El device signer se agrega AUTOMATICAMENTE.
  const handleCreateWallet = async () => {
    setBusy(true);
    try {
      const email = session?.user?.email;
      if (!email) throw new Error("La sesion de Supabase no tiene email.");

      const { crossmint } = await buildClient();
      const wallets = CrossmintWallets.from(crossmint);

      push(`Creando wallet en ${chain}...`);
      const w = await wallets.createWallet({
        chain,
        recoveryMethods: [{ type: "email", email }],
        // NO pasar `signers`: el SDK agrega el device signer solo.
        options: walletOptions(),
      });

      // Esperar inicializacion. NO atamos signer a mano (el SDK lo resuelve).
      await w.waitForInit();
      push("Wallet creada", {
        address: w.address,
        chain: w.chain,
        needsRecovery: safeNeedsRecovery(w),
      });

      setWallet(w);
    } catch (err) {
      push("ERROR creando wallet", errInfo(err));
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  // 3. Obtener wallet existente. SDK-puro: solo waitForInit y reportamos
  //    needsRecovery(). NO forzamos recover() aca (lo deja al SDK al firmar),
  //    salvo que el usuario lo pida con el boton dedicado.
  const handleGetWallet = async () => {
    setBusy(true);
    try {
      const { crossmint } = await buildClient();
      const wallets = CrossmintWallets.from(crossmint);

      push(`Buscando wallet existente en ${chain}...`);
      const w = await wallets.getWallet({
        chain,
        options: walletOptions(),
      });
      await w.waitForInit();
      push("Wallet obtenida", {
        address: w.address,
        chain: w.chain,
        needsRecovery: safeNeedsRecovery(w),
      });
      setWallet(w);
    } catch (err) {
      push("ERROR obteniendo wallet", errInfo(err));
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  // 4. Leer balances
  const handleBalance = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      const balances = await wallet.balances();
      push("Balances", balances);
    } catch (err) {
      push("ERROR leyendo balance", { message: err?.message });
    } finally {
      setBusy(false);
    }
  };

  // 5. Fondear en staging (USDXM gratis)
  const handleFund = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      if (typeof wallet.stagingFund === "function") {
        await wallet.stagingFund(10);
        push("Fondeo staging OK: 10 USDXM");
      } else {
        push("stagingFund no disponible");
      }
    } catch (err) {
      push("ERROR fondeando", { message: err?.message });
    } finally {
      setBusy(false);
    }
  };

  // 6. Transfer de prueba (valida firma SIN OTP con device signer)
  const handleTransfer = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      const to = window.prompt(
        "Direccion destino (0x...):",
        "0x000000000000000000000000000000000000dEaD",
      );
      if (!to) return;
      push("Enviando transfer de prueba (1 USDXM)...");
      const tx = await wallet.send(to, "usdxm", "1");
      push("Transfer OK", tx);
    } catch (err) {
      push("ERROR en transfer", errInfo(err));
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  // 7. signMessage (valida firma sin OTP de forma simple)
  const handleSignMessage = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      const evm = EVMWallet.from(wallet);
      push("Firmando mensaje...");
      const sig = await evm.signMessage({ message: "Hola Crossmint" });
      push("Firma OK (sin OTP)", sig);
    } catch (err) {
      push("ERROR firmando", errInfo(err));
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  // 8. viem client
  const handleViem = async () => {
    if (!wallet) return;
    try {
      const evm = EVMWallet.from(wallet);
      const client = evm.getViemClient();
      push("viem client obtenido", { hasClient: !!client, chainId: client?.chain?.id });
    } catch (err) {
      push("ERROR con viem client", { message: err?.message });
    }
  };

  // 9. Diagnostico SDK-puro: needsRecovery + signers registrados + cuales tienen
  //    su clave privada EN ESTE dispositivo (hasKey).
  const handleDiagnose = async () => {
    if (!wallet) {
      push("No hay wallet cargada. Crea u obtené la wallet primero.");
      return;
    }
    setBusy(true);
    try {
      const storage = getKeyStorage();
      const address = wallet.address;

      push("needsRecovery()", safeNeedsRecovery(wallet));

      // Hay clave local mapeada a esta address?
      const localKey = await storage
        .getKey(address)
        .catch((e) => `ERR:${e.message}`);
      push(
        "getKey(address) local",
        localKey || "(null: NO hay clave local para esta address)",
      );

      // Signers registrados on-chain (con status).
      let signers = [];
      try {
        signers = typeof wallet.signers === "function" ? await wallet.signers() : [];
      } catch (e) {
        push("wallet.signers() ERROR", { message: e?.message });
      }
      push("wallet.signers()", signers);

      // Para cada device signer: tiene su privada en este dispositivo?
      for (const s of Array.isArray(signers) ? signers : []) {
        if (s?.type === "device" && s?.locator) {
          const pk = String(s.locator).replace("device:", "");
          const has = await storage.hasKey(pk).catch(() => false);
          push(
            `signer device status=${s.status || "?"} (${String(s.locator).slice(0, 22)}...)`,
            has ? "privada local: SI" : "privada local: NO",
          );
        } else {
          push(`signer ${s?.type || "?"} status=${s?.status || "?"}`, s?.locator);
        }
      }
    } catch (err) {
      push("ERROR en diagnostico", errInfo(err));
    } finally {
      setBusy(false);
    }
  };

  // 10. RECOVER (opcional): registra un device signer NUEVO para este
  //     dispositivo usando el recovery (email OTP) UNA vez. Despues, firmar es
  //     silencioso. El SDK normalmente lo hace solo al firmar si hace falta;
  //     este boton sirve para forzarlo manualmente y verificar.
  const handleRecover = async () => {
    if (!wallet) {
      push("No hay wallet cargada.");
      return;
    }
    setBusy(true);
    try {
      push("needsRecovery() antes", safeNeedsRecovery(wallet));
      push("Ejecutando recover() - puede pedir OTP por email UNA vez...");
      await wallet.recover();
      push("recover() OK. needsRecovery() ahora:", safeNeedsRecovery(wallet));
    } catch (err) {
      push("ERROR en recover", errInfo(err));
    } finally {
      setBusy(false);
    }
  };

  // 11. LIMPIEZA (opcional): elimina device signers HUERFANOS (status
  //     "awaiting-approval" sin privada local). Deja la wallet prolija.
  const handleCleanup = async () => {
    if (!wallet) {
      push("No hay wallet cargada.");
      return;
    }
    setBusy(true);
    try {
      const storage = getKeyStorage();
      const signers = typeof wallet.signers === "function" ? await wallet.signers() : [];
      const deviceSigners = (Array.isArray(signers) ? signers : []).filter(
        (s) => s?.type === "device" && s?.locator,
      );
      push(`Device signers encontrados: ${deviceSigners.length}`, deviceSigners);

      let removed = 0;
      for (const s of deviceSigners) {
        const pk = String(s.locator).replace("device:", "");
        const hasLocal = await storage.hasKey(pk).catch(() => false);
        const status = String(s.status || "").toLowerCase();
        // No borramos el que este dispositivo PUEDE usar, ni los ya aprobados.
        const isOrphan = !hasLocal && status.includes("awaiting");
        if (!isOrphan) {
          push(`conservado (${s.status})`, String(s.locator).slice(0, 22) + "...");
          continue;
        }
        try {
          await wallet.removeSigner({ type: "device", locator: s.locator });
          removed += 1;
          push("eliminado signer huerfano", String(s.locator).slice(0, 22) + "...");
        } catch (e) {
          push("ERROR eliminando signer", { locator: s.locator, message: e?.message });
        }
      }
      push(`Limpieza completa: ${removed} eliminados.`);
    } catch (err) {
      push("ERROR en limpieza", errInfo(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto my-10 p-6 space-y-6">
      <div className="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#252525]">
        <h1 className="text-2xl font-black dark:text-white">
          Crossmint Wallet Test <span className="text-[#F26722]">({chain})</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Pagina aislada. No usa Privy. Requiere estar logueado con Supabase.
        </p>
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
          Flujo SDK-puro: el device signer se agrega automaticamente. Sin
          createDeviceSigner / useSigner manuales.
        </p>

        {/* Selector de red */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label className="text-xs font-bold text-gray-500 uppercase">Red:</label>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            disabled={busy}
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f1f1f] dark:text-white"
          >
            {KNOWN_CHAINS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-[11px] text-gray-400">
            Cambia la red y probá "Crear wallet" para ver si Crossmint la acepta.
          </span>
        </div>

        <div className="mt-3 text-sm">
          {session ? (
            <span className="text-emerald-600 font-bold">
              Supabase: {session.user.email} ({session.user.app_metadata?.provider})
            </span>
          ) : (
            <span className="text-red-500 font-bold">
              Sin sesion de Supabase. Anda a <a className="underline" href="/auth-test">/auth-test</a> y logueate.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleCreateWallet}
          disabled={busy || !session}
          className="px-4 py-2.5 rounded-xl bg-[#F26722] text-white font-bold disabled:opacity-40"
        >
          Crear wallet
        </button>
        <button
          onClick={handleGetWallet}
          disabled={busy || !session}
          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-40"
        >
          Obtener wallet existente
        </button>
        <button
          onClick={handleBalance}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 text-white font-bold disabled:opacity-40"
        >
          Ver balances
        </button>
        <button
          onClick={handleFund}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-40"
        >
          Fondear (staging 10 USDXM)
        </button>
        <button
          onClick={handleSignMessage}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-purple-600 text-white font-bold disabled:opacity-40"
        >
          Firmar mensaje (sin OTP)
        </button>
        <button
          onClick={handleTransfer}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40"
        >
          Transfer prueba
        </button>
        <button
          onClick={handleViem}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-slate-600 text-white font-bold disabled:opacity-40"
        >
          Test viem client
        </button>
        <button
          onClick={handleDiagnose}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-40"
        >
          Diagnosticar
        </button>
        <button
          onClick={handleRecover}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white font-bold disabled:opacity-40"
        >
          recover() (OTP 1 vez)
        </button>
        <button
          onClick={handleCleanup}
          disabled={busy || !wallet}
          className="px-4 py-2.5 rounded-xl bg-red-700 text-white font-bold disabled:opacity-40"
        >
          Limpiar signers huerfanos
        </button>
      </div>

      {wallet && (
        <div className="p-4 rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-sm">
          <b>Wallet actual:</b>
          <div className="font-mono break-all">{wallet.address}</div>
          <div className="text-xs text-gray-500">
            chain: {wallet.chain} - needsRecovery: {String(safeNeedsRecovery(wallet))}
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-zinc-50 dark:bg-zinc-900/40">
        <h2 className="font-bold mb-2 dark:text-white">Log ({log.length})</h2>
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {log.map((l, i) => (
            <div key={i} className="text-xs font-mono border-b border-gray-200 dark:border-gray-800 pb-2">
              <span className="text-gray-400">[{l.ts}]</span> {l.msg}
              {l.data && (
                <pre className="whitespace-pre-wrap break-all text-[11px] mt-1 text-gray-500">
                  {l.data}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Lee needsRecovery() sin romper si el metodo no existiera. */
function safeNeedsRecovery(w) {
  try {
    return typeof w?.needsRecovery === "function" ? w.needsRecovery() : "(n/a)";
  } catch {
    return "(error)";
  }
}

/** Extrae info util de un error del SDK para el log. */
function errInfo(err) {
  return {
    message: err?.message,
    name: err?.name,
    code: err?.code,
    status: err?.status,
    response: err?.response?.data,
  };
}
