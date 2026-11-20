import React, { useState, useEffect, useCallback } from "react";
import { usePrivy } from "../Utils/authClient";
import { useUserStore } from "../store/useUserStore";
import {
  CreditCard,
  ShieldCheck,
  Loader2,
  ReceiptText,
  Lock,
  RefreshCcw,
} from "lucide-react";
import Swal from "sweetalert2";
import axios from "axios";
import {
  readContract,
  writeContract,
  approveToken,
  getContractCode,
  getWalletAddress,
  activateDeviceSigner,
  isDeviceActivated,
} from "../Utils/crossmintWallet";
// Gas patrocinado + anti-abuso (rate limit por operación + monto mínimo).
import { ensureGas } from "../Utils/ensureGas";
import { checkOpRateLimit, registerOp, describeLimit } from "../Utils/opRateLimit";
import { getOpLimit } from "../config/opPolicy";
// Lista de redes de colateral (direcciones de contrato/token): la trae el
// BACKEND. Ver nota de arriba: el front ya no tiene direcciones propias.
import { useCollateralOptions } from "../Utils/useCollateralOptions";

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN MULTIRED
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ Migración de Privy → Crossmint: esta pantalla firma con la smart wallet
// Crossmint (device signer) vía `crossmintWallet.js`.
//
// La MISMA address EVM existe en todas las redes, pero el contrato NeroCollateral
// y el token de garantía son PROPIOS de cada red. El seller elige en qué red
// deposita/retira. La lectura siempre funciona; el depósito/retiro se firma con
// Crossmint SOLO en redes que Crossmint soporta.
//
// ⚠️ NOTA CLAVE sobre la dirección del vendedor:
//   La tx la firma la SMART WALLET de Crossmint. El mapping `vendors(address)`
//   del contrato registra el depósito bajo el `msg.sender` = esa smart wallet.
//   Por eso TODO (leer saldos y verificar depósito) usa `getWalletAddress()`
//   (la address REAL que firma), NO `dbUser.walletAddress` (que puede estar
//   desactualizada o ser otra). Ese era el motivo del FALSO NEGATIVO:
//   "no se confirmó el aumento de saldo".
//
// `sendable`: true si Crossmint puede FIRMAR en esa red (depositar/retirar).
//   ⚠️ BSC testnet NO está soportada por Crossmint (solo "bsc" mainnet), por eso
//   queda como SOLO LECTURA. Polygon Amoy y Base Sepolia sí se pueden firmar.
// ⚠️ ACÁ YA NO HAY DIRECCIONES HARDCODEADAS.
//
// Antes este archivo (igual que WalletPage.jsx y DepositCollateral.jsx) tenía
// escrito el contrato y el token de cada red, con `VITE_COLLATERAL_*` como
// override que NUNCA estaba definido en el .env → tres direcciones distintas
// del mismo contrato circulando. Ahora la lista de redes viene del backend
// (`GET /api/config/collateral-options` vía el hook `useCollateralOptions`).
//
// Para agregar/activar una red (p. ej. Base mainnet) se cargan sus direcciones
// en el .env del BACKEND y la red aparece sola acá. Cero cambios de frontend.

// Muestra/oculta el aviso proactivo de "activar billetera". Oculto por ahora:
// la smart wallet firma sin activación previa y el OTP aparece solo si el SDK lo
// pide (vía el CrossmintOtpModal global). Cambiar a true para reactivarlo.
const SHOW_ACTIVATION_UI = false;

// ABIs (fragmentos) requeridos.
const COLLATERAL_POOL_ABI = [
  {
    type: "function",
    name: "vendors",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "totalCollateral", type: "uint256" },
      { name: "lockedCollateral", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "depositCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tokenAddress", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tokenAddress", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
];

// ABI mínimo ERC-20 para leer allowance/balance (diagnóstico del revert).
const ERC20_READ_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

/** Espera hasta que el allowance del token hacia el spender sea >= amount. */
async function waitForAllowance({
  tokenAddress,
  owner,
  spender,
  amount,
  chainName,
  tries = 20,
  delayMs = 2000,
}) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const current = await readContract({
        address: tokenAddress,
        abi: ERC20_READ_ABI,
        functionName: "allowance",
        args: [owner, spender],
        chain: chainName,
      });
      if (BigInt(current) >= BigInt(amount)) return true;
    } catch (err) {
      console.warn("waitForAllowance: no se pudo leer allowance:", err);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

const isDark = () =>
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark");

/** Convierte un monto legible (string) a unidades base (bigint) sin ethers. */
function toBaseUnits(amount, decimals) {
  const [intPart, fracPart = ""] = String(amount).trim().split(".");
  const padded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt((intPart || "0") + padded);
}

/** Convierte unidades base (bigint) a número legible. */
function fromBaseUnits(value, decimals) {
  const str = value.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  const fracPart = str.slice(-decimals);
  return Number(`${intPart}.${fracPart}`);
}

/** Lee vendors(wallet).totalCollateral on-chain para un contrato dado. */
async function readVendorTotal(walletAddress, contractAddress, chainName) {
  try {
    const [totalCollateral] = await readContract({
      address: contractAddress,
      abi: COLLATERAL_POOL_ABI,
      functionName: "vendors",
      args: [walletAddress],
      chain: chainName,
    });
    return BigInt(totalCollateral);
  } catch (error) {
    console.error("verifyDeposit: no se pudo leer vendors():", error);
    return null;
  }
}

/**
 * Resuelve la dirección REAL que firma/opera on-chain: la smart wallet de
 * Crossmint. Es la que el contrato usa como clave de `vendors`. Cae al fallback
 * (address "de negocio" de Mongo) solo si no se puede resolver.
 */
async function resolveSignerAddress(fallbackAddress) {
  try {
    const addr = await getWalletAddress();
    if (addr) return addr;
  } catch (error) {
    console.warn("resolveSignerAddress: no se pudo obtener la address de Crossmint, uso fallback:", error);
  }
  return fallbackAddress;
}

/**
 * Verifica que el depósito se refleje en el contrato: lee el total antes y
 * espera a que el nuevo total sea >= (totalPrevio + amountDepositado).
 *
 * ⚠️ CLAVE del FALSO NEGATIVO: hay que pasar la dirección REAL que firma (smart
 * wallet Crossmint), NO la de Mongo. La UserOp se registra bajo `msg.sender` =
 * smart wallet, así que leer el total de otra dirección SIEMPRE daría "sin
 * cambios". El caller lo resuelve con `getWalletAddress()`.
 *
 * El bundler de ERC-4337 puede tardar en incluir la UserOp on-chain, por lo que
 * damos una ventana generosa (~40s) con reintentos.
 */
async function verifyDepositApplied(amountInBase, signerAddress, contractAddress, chainName) {
  if (!signerAddress) return { ok: true, reason: "no-wallet" };

  const before = await readVendorTotal(signerAddress, contractAddress, chainName);
  if (before === null) return { ok: false, reason: "no-read" };

  const expected = before + BigInt(amountInBase);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = await readVendorTotal(signerAddress, contractAddress, chainName);
    if (now !== null && now >= expected) return { ok: true, reason: "confirmed" };
  }
  return { ok: false, reason: "not-detected", expected: expected.toString() };
}

/** Verifica que el retiro se refleje: el total on-chain debe DISMINUIR. */
async function verifyWithdrawApplied(amountInBase, signerAddress, contractAddress, chainName) {
  if (!signerAddress) return { ok: true, reason: "no-wallet" };

  const before = await readVendorTotal(signerAddress, contractAddress, chainName);
  if (before === null) return { ok: false, reason: "no-read" };

  const expectedMax = before - BigInt(amountInBase);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = await readVendorTotal(signerAddress, contractAddress, chainName);
    if (now !== null && now <= expectedMax) return { ok: true, reason: "confirmed" };
  }
  return { ok: false, reason: "not-detected" };
}

/**
 * Comprueba que la dirección del contrato tenga CÓDIGO (eth_getCode != "0x").
 * Si no lo tiene, cualquier depósito será "fantasma".
 */
async function checkContractHasCode(address, chainName) {
  try {
    const code = await getContractCode({ address, chain: chainName });
    const len = code ? code.length : 0;
    return { hasCode: Boolean(code) && code !== "0x", codeLength: len };
  } catch (error) {
    console.error("checkContractHasCode: no se pudo leer el código:", error);
    return { hasCode: null, codeLength: 0, error: error?.message };
  }
}

/**
 * (Eliminado) confirmNewDeviceIfNeeded.
 *
 * Antes mostrábamos un cartel preventivo de "dispositivo nuevo" consultando
 * `deviceNeedsRecovery()`. Era engañoso: (1) decía "te enviaremos un código"
 * pero NO lo enviaba (el envío real ocurre en el CrossmintOtpModal cuando el
 * SDK lo pide), y (2) consultaba needsRecovery en una chain fija. Ahora el OTP
 * lo maneja 100% el SDK vía `onAuthRequired` + el modal global, que ya está
 * montado en App.jsx. Si el device signer es válido → firma silenciosa.
 */

/** Toast reutilizable con el estilo de la app. */
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener("mouseenter", Swal.stopTimer);
    toast.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

/** Devuelve el texto de error legible de una excepción de firma. */
function describeError(error) {
  if (error?.code === "AUTH_REJECTED") return "Cancelaste la verificación.";
  return error?.reason || error?.message || "Operación cancelada";
}

// Estados de la orden en los que el vendedor tiene garantía retenida (o
// reservando capacidad, si el hold aún no se depositó).
const HOLDING_STATUSES = [
  "awaiting_collateral",
  "pending_payment",
  "verifying_payment",
  "paid",
  "shipped",
  "reception_confirmed",
];

// Motivo legible por estado para la tabla de órdenes.
const STATUS_REASON = {
  awaiting_collateral: "Esperando depósito de garantía",
  pending_payment: "Esperando pago del comprador",
  verifying_payment: "Verificando pago",
  paid: "Pago confirmado, en preparación",
  shipped: "Pedido en camino",
  reception_confirmed: "Recibido por el comprador",
};

export default function CollateralManager() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const dbWalletAddress = useUserStore((s) => s.dbUser?.walletAddress || null);
  // Address "de negocio" (Mongo). Se usa para gating de UI y como fallback.
  const walletAddress = dbWalletAddress || user?.wallet?.address || null;

  // Address REAL que firma (smart wallet Crossmint). Se resuelve al montar.
  const [signerAddress, setSignerAddress] = useState(null);

    // Redes de colateral: vienen del BACKEND (fuente única de verdad). Mientras
  // carga mostramos un placeholder; si falla, mostramos el error SIN caer a
  // direcciones hardcodeadas (un fallback acá reintroduce el bug del contrato
  // equivocado).
  const {
    options: collateralNetworks,
    loading: networksLoading,
    error: networksError,
  } = useCollateralOptions();

  // Red seleccionada para operar (depositar/retirar/leer saldos).
  // `selectedNetworkKey` guarda el `key` estable ("polygonAmoy", "baseSepolia"…).
  const [selectedNetworkKey, setSelectedNetworkKey] = useState(null);
  // Red efectiva: la elegida, o la primera disponible (y firmable) si todavía
  // no eligió. Preferimos una red firmable para que el usuario pueda operar
  // de entrada (BSC testnet es solo lectura).
  const network =
    (selectedNetworkKey &&
      collateralNetworks.find((n) => n.key === selectedNetworkKey)) ||
    collateralNetworks.find((n) => n.sendable) ||
    collateralNetworks[0] ||
    null;
    // Constantes de la red activa (para reemplazar las viejas globales).
  // Usamos optional chaining porque mientras carga la config del backend
  // `network` es null: no queremos tirar la pantalla en ese instante.
  const CONTRACT_ADDRESS = network?.contractAddress || null;
  const COLLATERAL_TOKEN_ADDRESS = network?.token?.address || null;
  const COLLATERAL_TOKEN_DECIMALS = network?.token?.decimals ?? 6;
  const COLLATERAL_TOKEN_SYMBOL = network?.token?.symbol || "USDC";

  // Estados para los saldos de la Blockchain
  const [balances, setBalances] = useState({
    total: "0.00",
    locked: "0.00",
    available: "0.00",
  });
  // Estado de carga de los saldos on-chain. Arranca en true para evitar mostrar
  // "0.00" mientras se sincroniza con la wallet (evita la sensación de saldo
  // vacío / error). Se apaga recién cuando la lectura termina.
  const [loadingBalances, setLoadingBalances] = useState(true);

  // Órdenes del vendedor con garantía retenida (reutiliza /api/order/my-orders).
  const [holdingOrders, setHoldingOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Estados para los inputs y loaders
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState(false);
  // Progreso de la operación en curso para el overlay de carga.
  const [progress, setProgress] = useState("");

  // Estado del contrato de colateral: { hasCode, codeLength }.
  const [contractStatus, setContractStatus] = useState(null);

  // ¿La billetera necesita activarse (device signer) para firmar en esta red?
  // null = todavía no se sabe. true/false tras consultar.
  const [needsActivation, setNeedsActivation] = useState(null);
  const [activating, setActivating] = useState(false);

  // Consulta si falta activar el device signer en la red seleccionada.
  // ⚠️ Usamos el flag persistente (`isDeviceActivated`), NO needsRecovery(),
  // porque needsRecovery() da falsos positivos (devolvía true aunque la firma
  // funcionara, dejando el aviso para siempre). El flag se marca al completar
  // la activación o al firmar con éxito.
  useEffect(() => {
    let mounted = true;
    setNeedsActivation(null);
        (async () => {
      if (!network || !network.sendable) {
        if (mounted) setNeedsActivation(false);
        return;
      }
      try {
        const addr = await getWalletAddress({ chain: network.chainName });
        const activated = isDeviceActivated({ address: addr, chain: network.chainName });
        if (mounted) setNeedsActivation(!activated);
      } catch {
        if (mounted) setNeedsActivation(false);
      }
    })();
        return () => {
      mounted = false;
    };
  }, [network?.chainName, network?.sendable, signerAddress]);

  // Activa el device signer para la red seleccionada (dispara OTP si hace
  // falta). Al terminar, re-evalúa el estado.
  const handleActivate = async () => {
    const dark = isDark();
    const confirm = await Swal.fire({
      icon: "info",
      title: "Activar billetera en esta red",
      html:
        `<p style="text-align:left;margin:0 0 10px">Vas a habilitar tu billetera para firmar en <b>${network.label}</b>.</p>` +
        `<p style="text-align:left;margin:0 0 10px">Si hace falta, te enviaremos un <b>código de verificación por email</b> desde nuestro proveedor de billetera <b>Crossmint</b> — <b>no es de Mercado Nero</b>. Revisá también spam.</p>` +
        `<p style="text-align:left;margin:0;font-size:13px;opacity:.75">Se realiza <b>una sola vez por dispositivo</b> en esta red.</p>`,
      showCancelButton: true,
      confirmButtonText: "Activar ahora",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#F26722",
      cancelButtonColor: "#6b7280",
      background: dark ? "#252525" : "#fff",
      color: dark ? "#fff" : "#111",
    });
    if (!confirm.isConfirmed) return;

    setActivating(true);
    try {
      const r = await activateDeviceSigner({ chain: network.chainName });
      setNeedsActivation(false);
      Toast.fire({
        icon: "success",
        title: r.alreadyReady
          ? `Billetera lista en ${network.label}.`
          : `Billetera activada en ${network.label}.`,
      });
    } catch (error) {
      if (error?.code !== "AUTH_REJECTED") {
        console.error(error);
      }
      Toast.fire({ icon: "error", title: describeError(error) });
    } finally {
      setActivating(false);
    }
  };

  // Chequeo: ¿la dirección del contrato tiene bytecode en la red elegida?
  // Se re-ejecuta al cambiar de red.
  useEffect(() => {
    let mounted = true;
    setContractStatus(null);
    (async () => {
      if (!CONTRACT_ADDRESS) {
        if (mounted) setContractStatus({ hasCode: false, codeLength: 0 });
        return;
      }
      const res = await checkContractHasCode(CONTRACT_ADDRESS, network.chainName);
      if (mounted) setContractStatus(res);
    })();
    return () => {
      mounted = false;
    };
  }, [CONTRACT_ADDRESS, network.chainName]);

  // Resolver la address real del signer (smart wallet Crossmint) al montar.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const addr = await resolveSignerAddress(walletAddress);
      if (mounted) setSignerAddress(addr);
    })();
    return () => {
      mounted = false;
    };
  }, [walletAddress]);

  // 1. FUNCIÓN PARA LEER LOS SALDOS (READ) — contra la address del signer y la
  // red seleccionada.
  const fetchBalances = useCallback(async () => {
    const addr = signerAddress || (await resolveSignerAddress(walletAddress));
    if (!addr || !CONTRACT_ADDRESS) return;
    setLoadingBalances(true);
    try {
      const [totalCollateral, lockedCollateral] = await readContract({
        address: CONTRACT_ADDRESS,
        abi: COLLATERAL_POOL_ABI,
        functionName: "vendors",
        args: [addr],
        chain: network.chainName,
      });

      const total = fromBaseUnits(totalCollateral, COLLATERAL_TOKEN_DECIMALS);
      const locked = fromBaseUnits(lockedCollateral, COLLATERAL_TOKEN_DECIMALS);
      const available = Math.max(total - locked, 0);

      setBalances({
        total: total.toFixed(2),
        locked: locked.toFixed(2),
        available: available.toFixed(2),
      });
    } catch (error) {
      console.error("Error al leer saldos de colateral:", error);
    } finally {
      setLoadingBalances(false);
    }
  }, [
    signerAddress,
    walletAddress,
    CONTRACT_ADDRESS,
    COLLATERAL_TOKEN_DECIMALS,
    network.chainName,
  ]);

  // Lee las órdenes del vendedor (role=seller) y se queda solo con las que
  // tienen garantía retenida. Reutiliza el endpoint ya existente /my-orders.
  const fetchHoldingOrders = useCallback(async () => {
    if (!authenticated) return;
    setLoadingOrders(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/order/my-orders?role=seller`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const all = Array.isArray(data?.orders) ? data.orders : [];
      const filtered = all.filter((o) => HOLDING_STATUSES.includes(o.status));
      setHoldingOrders(filtered);
    } catch (error) {
      console.error("Error al cargar órdenes con garantía retenida:", error);
      setHoldingOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [authenticated, getAccessToken]);

  // Leer saldos cuando haya signer resuelto y usuario autenticado (y al cambiar
  // de red — fetchBalances ya depende de CONTRACT_ADDRESS/chain).
  useEffect(() => {
    if (authenticated && (signerAddress || walletAddress)) {
      fetchBalances();
    }
  }, [authenticated, signerAddress, walletAddress, fetchBalances]);

  // Cargar órdenes con garantía retenida al autenticarse.
  useEffect(() => {
    if (authenticated) {
      fetchHoldingOrders();
    }
  }, [authenticated, fetchHoldingOrders]);

  // Refresca cotizaciones (saldos on-chain + órdenes) en un solo gesto.
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchBalances(),
      fetchHoldingOrders(),
    ]);
  }, [fetchBalances, fetchHoldingOrders]);

  // 2. FUNCIÓN PARA DEPOSITAR (WRITE)
  const handleDeposit = async (e) => {
    e.preventDefault();
    if (
      !walletAddress ||
      !depositAmount ||
      isNaN(depositAmount) ||
      Number(depositAmount) <= 0
    )
      return;

    // 🛡️ Guardia anti-depósito-fantasma ANTES de firmar.
    const codeCheck =
      contractStatus || (await checkContractHasCode(CONTRACT_ADDRESS, network.chainName));
    if (codeCheck.hasCode === false) {
      Toast.fire({
        icon: "error",
        title:
          "El contrato de garantía no tiene código en esta red. No se puede depositar.",
      });
      return;
    }

    // 🚫 Red no firmable con Crossmint (p.ej. BSC testnet): no permitimos operar.
    if (!network.sendable) {
      Toast.fire({
        icon: "error",
        title: `No se puede operar en ${network.label} con esta billetera (red no soportada para firmar).`,
      });
      return;
    }

        // 🔐 El OTP (si hiciera falta) lo maneja el SDK + el CrossmintOtpModal
    // global vía `onAuthRequired`. NO mostramos un aviso previo: si el device
    // signer es válido, la firma es silenciosa; si no, aparece el modal real de
    // OTP (con su botón "Enviar código"). Evitamos así el falso aviso de
    // "dispositivo nuevo" que no enviaba ningún correo.

    // ── ANTI-ABUSO: monto mínimo + cuota de frecuencia ──
    // El depósito son 2 UserOps (approve + deposit), el más caro en gas. En
    // testnet OP_POLICY.enforce=false → sólo avisa; en prod bloqueará.
    const limit = checkOpRateLimit({
      address: signerAddress || walletAddress,
      chain: network.chainName,
      opType: "deposit_collateral",
      amountUsd: Number(depositAmount),
    });
    if (limit.belowMin) {
      Toast.fire({ icon: "warning", title: describeLimit(limit) });
      return;
    }
    if (limit.blocked) {
      Toast.fire({ icon: "warning", title: describeLimit(limit) });
      return;
    }

    // ── GAS PATROCINADO: garantizar gas nativo antes de firmar ──
    // La firma es client-side; pedimos al backend el "drip" de gas para que la
    // smart wallet tenga con qué firmar. Idempotente si ya tiene gas.
    const gas = await ensureGas({
      chain: network.chainName,
      opType: "deposit_collateral",
      getAccessToken,
    });
    if (!gas.ok) {
      Toast.fire({ icon: "warning", title: gas.message });
      return;
    }

    setLoading(true);
    setProgress(`Aprobando ${COLLATERAL_TOKEN_SYMBOL}...`);

    try {
      const amountInBase = toBaseUnits(
        depositAmount,
        COLLATERAL_TOKEN_DECIMALS,
      );

      // Resolvemos la address REAL que firma (smart wallet), dueña de los fondos
      // y del allowance. Es la key de `vendors` en el contrato.
      const addr =
        signerAddress || (await resolveSignerAddress(walletAddress));

      // ── DIAGNÓSTICO PREVIO: balance y allowance ──
      // Evita el `ExecutionReverted()` opaco del token (p. ej. USDC en Base)
      // cuando no hay saldo o el allowance no alcanza.
      try {
        const bal = await readContract({
          address: COLLATERAL_TOKEN_ADDRESS,
          abi: ERC20_READ_ABI,
          functionName: "balanceOf",
          args: [addr],
          chain: network.chainName,
        });
        if (BigInt(bal) < amountInBase) {
          Toast.fire({
            icon: "error",
            title: `Saldo insuficiente de ${COLLATERAL_TOKEN_SYMBOL} en esta red.`,
          });
          return;
        }
      } catch (e) {
        console.warn("No se pudo leer balance del token:", e);
      }

      // ── APPROVE ──
      await approveToken({
        tokenAddress: COLLATERAL_TOKEN_ADDRESS,
        spender: CONTRACT_ADDRESS,
        amount: amountInBase,
        chain: network.chainName,
      });

      // ── ESPERAR el allowance on-chain antes de depositar ──
      // El bundler de ERC-4337 puede tardar en incluir el approve; si
      // depositamos antes de que impacte, `transferFrom` revierte
      // (ExecutionReverted). Esperamos a ver el allowance confirmado.
      setProgress("Esperando confirmación del approve...");
      const allowanceReady = await waitForAllowance({
        tokenAddress: COLLATERAL_TOKEN_ADDRESS,
        owner: addr,
        spender: CONTRACT_ADDRESS,
        amount: amountInBase,
        chainName: network.chainName,
      });
      if (!allowanceReady) {
        Toast.fire({
          icon: "warning",
          title: "El approve aún no se reflejó on-chain. Reintentá en unos segundos.",
        });
        return;
      }

      setProgress("Confirmando el depósito en el contrato...");
      // El depósito puede revertir si el estado cambió justo tras el approve.
      // Reintentamos UNA vez para cubrir la carrera del bundler.
      let tx;
      try {
        tx = await writeContract({
          address: CONTRACT_ADDRESS,
          abi: COLLATERAL_POOL_ABI,
          functionName: "depositCollateral",
          args: [COLLATERAL_TOKEN_ADDRESS, amountInBase],
          chain: network.chainName,
        });
      } catch (depositErr) {
        console.warn("Depósito revirtió; reintentando una vez:", depositErr);
        await new Promise((r) => setTimeout(r, 3000));
        tx = await writeContract({
          address: CONTRACT_ADDRESS,
          abi: COLLATERAL_POOL_ABI,
          functionName: "depositCollateral",
          args: [COLLATERAL_TOKEN_ADDRESS, amountInBase],
          chain: network.chainName,
        });
      }

      setProgress("Verificando el depósito on-chain...");
      // ⚠️ Verificación contra la address REAL del signer (no la de Mongo), para
      // no dar falsos negativos.
      const addrForVerify = addr;
      const depositConfirmed = await verifyDepositApplied(
        amountInBase,
        addrForVerify,
        CONTRACT_ADDRESS,
        network.chainName,
      );

      setDepositAmount("");
      await refreshAll();

      if (!depositConfirmed.ok) {
        Toast.fire({
          icon: "warning",
          title:
            depositConfirmed.reason === "no-read"
              ? "La tx se envió, pero no pudimos verificar el saldo (RPC). Revisá el explorador."
              : `La tx (${tx?.hash?.slice(0, 10) ?? "s/n"}...) se envió pero tarda en reflejarse. Recargá en unos segundos.`,
        });
        return;
      }

            Toast.fire({
        icon: "success",
        title: `Depositaste ${depositAmount} ${COLLATERAL_TOKEN_SYMBOL}.`,
      });
      // Registrar la operación exitosa para el conteo de cuota por hora.
      registerOp({
        address: addrForVerify || signerAddress || walletAddress,
        chain: network.chainName,
        opType: "deposit_collateral",
      });
    } catch (error) {
      console.error(error);
      Toast.fire({ icon: "error", title: describeError(error) });
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // 3. FUNCIÓN PARA RETIRAR (WRITE)
  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (
      !walletAddress ||
      !withdrawAmount ||
      isNaN(withdrawAmount) ||
      Number(withdrawAmount) <= 0
    )
      return;

    if (Number(withdrawAmount) > Number(balances.available)) {
      Toast.fire({
        icon: "error",
        title:
          "No podés retirar más del saldo disponible (el retenido está bloqueado).",
      });
      return;
    }

    // 🚫 Red no firmable con Crossmint (p.ej. BSC testnet): no permitimos operar.
    if (!network.sendable) {
      Toast.fire({
        icon: "error",
        title: `No se puede operar en ${network.label} con esta billetera (red no soportada para firmar).`,
      });
      return;
    }

        // 🔐 El OTP (si hiciera falta) lo maneja el SDK + el CrossmintOtpModal
    // global vía `onAuthRequired` (ver nota en handleDeposit).

    // ── ANTI-ABUSO: monto mínimo + cuota de frecuencia ──
    // El retiro es el flujo que más se presta a "mil micro retiros". En testnet
    // OP_POLICY.enforce=false → sólo avisa; en prod bloqueará.
    const limit = checkOpRateLimit({
      address: signerAddress || walletAddress,
      chain: network.chainName,
      opType: "withdraw_collateral",
      amountUsd: Number(withdrawAmount),
    });
    if (limit.belowMin) {
      Toast.fire({ icon: "warning", title: describeLimit(limit) });
      return;
    }
    if (limit.blocked) {
      Toast.fire({ icon: "warning", title: describeLimit(limit) });
      return;
    }

    // ── GAS PATROCINADO: garantizar gas nativo antes de firmar ──
    const gas = await ensureGas({
      chain: network.chainName,
      opType: "withdraw_collateral",
      getAccessToken,
    });
    if (!gas.ok) {
      Toast.fire({ icon: "warning", title: gas.message });
      return;
    }

    setLoading(true);
    setProgress("Confirmando el retiro...");

    try {
      const amountInBase = toBaseUnits(
        withdrawAmount,
        COLLATERAL_TOKEN_DECIMALS,
      );

      await writeContract({
        address: CONTRACT_ADDRESS,
        abi: COLLATERAL_POOL_ABI,
        functionName: "withdrawCollateral",
        args: [COLLATERAL_TOKEN_ADDRESS, amountInBase],
        chain: network.chainName,
      });

      setProgress("Verificando el retiro on-chain...");
      const addrForVerify =
        signerAddress || (await resolveSignerAddress(walletAddress));
      const withdrawConfirmed = await verifyWithdrawApplied(
        amountInBase,
        addrForVerify,
        CONTRACT_ADDRESS,
        network.chainName,
      );

      setWithdrawAmount("");
      await refreshAll();

      if (!withdrawConfirmed.ok) {
        Toast.fire({
          icon: "warning",
          title:
            withdrawConfirmed.reason === "no-read"
              ? "El retiro se envió, pero no pudimos verificar el saldo (RPC). Revisá el explorador."
              : "El retiro se envió pero tarda en reflejarse. Recargá en unos segundos.",
        });
        return;
      }

            Toast.fire({
        icon: "success",
        title: `Retiraste ${withdrawAmount} ${COLLATERAL_TOKEN_SYMBOL} a tu billetera.`,
      });
      // Registrar la operación exitosa para el conteo de cuota por hora.
      registerOp({
        address: addrForVerify || signerAddress || walletAddress,
        chain: network.chainName,
        opType: "withdraw_collateral",
      });
    } catch (error) {
      console.error(error);
      Toast.fire({ icon: "error", title: describeError(error) });
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // No permitimos operar si no hay wallet, si el contrato no tiene código, o si
  // la red no es firmable con Crossmint (BSC testnet). La lectura sigue visible.
  const contractMissing = contractStatus?.hasCode === false;
  const canSign = network.sendable;
    const disabled = loading || !walletAddress || contractMissing || !canSign;
  const withdrawDisabled =
    disabled || loadingBalances || balances.available === "0.00";

  // ── Estados de carga / error de la config de colateral ──
  // Mientras el backend responde no sabemos en qué contrato operar, así que NO
  // mostramos el formulario (evitamos que el usuario firme contra undefined).
  if (networksLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800">
        <div className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando configuración de garantías...
        </div>
      </div>
    );
  }

  // Si no pudimos obtener la config (o no hay ninguna red operativa), NO caemos
  // a direcciones hardcodeadas: mostramos el error. Operar "a ciegas" contra un
  // contrato que no es el que usa el backend es exactamente el bug que estamos
  // corrigiendo.
  if (networksError || !network) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-red-200 dark:border-red-900">
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
          <p className="text-sm font-bold text-red-800 dark:text-red-400">
            No pudimos cargar las garantías
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            {networksError ||
              "No hay ninguna red de garantías configurada en el servidor. Contactá al soporte."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 space-y-6">
      {/* OVERLAY DE CARGA GLOBAL: un único spinner elegante para toda la
          operación (reemplaza los spinners duplicados dentro de los botones). */}
      {loading && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#252525] shadow-2xl border border-gray-200 dark:border-gray-800 p-8 flex flex-col items-center text-center">
            <div className="relative flex items-center justify-center mb-5">
              <span className="absolute inline-flex h-14 w-14 rounded-full bg-[#F26722]/20 animate-ping" />
              <span className="relative inline-flex h-12 w-12 rounded-full bg-[#F26722] items-center justify-center text-white">
                <ShieldCheck className="h-6 w-6" />
              </span>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Procesando operación
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {progress || "Esperá unos segundos..."}
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Firmado de forma segura con tu billetera
            </div>
          </div>
        </div>
      )}

      {/* SECCIÓN 1: CONTADORES DE BALANCE */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          Garantías de Vendedor
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestioná tus activos en garantía para poder vender.
        </p>

        {/* SELECTOR DE RED: cada red tiene su contrato y token de colateral.
            BSC testnet aparece pero no es firmable con Crossmint (solo lectura). */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Red:
          </span>
                    {collateralNetworks.map((n) => {
            // "Activa" = la red que realmente se está usando (no la key guardada,
            // porque antes de elegir usamos la primera firmable por defecto).
            const active = network && n.chainId === network.chainId;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => {
                  if (loading) return;
                  setSelectedNetworkKey(n.key);
                }}
                disabled={loading}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-[#F26722] text-white border-[#F26722]"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
                title={!n.sendable ? "Solo lectura: esta red no es firmable con la billetera Crossmint" : n.label}
              >
                {n.label}
                {!n.sendable && <span className="ml-1 opacity-70">· lectura</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Token de colateral en {network.label}: <b>{COLLATERAL_TOKEN_SYMBOL}</b> ·{" "}
          <a
            href={`${network.explorerUrl}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[#F26722]"
          >
            ver contrato
          </a>
        </p>

        {!network.sendable && (
          <div className="mt-3 p-3 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
            ⚠️ En {network.label} solo podés <b>ver</b> tu garantía. Para depositar/retirar elegí una red donde tu billetera pueda firmar ({collateralNetworks.filter((n) => n.sendable).map((n) => n.label).join(", ")}).
          </div>
        )}

        {SHOW_ACTIVATION_UI && network.sendable && needsActivation === true && (
          <div className="mt-3 p-3 rounded-lg text-xs bg-[#F26722]/5 dark:bg-[#F26722]/10 border border-[#F26722]/30 flex items-start gap-2 flex-wrap">
            <ShieldCheck className="h-4 w-4 text-[#F26722] mt-0.5 shrink-0" />
            <span className="flex-1 min-w-[10rem] text-gray-700 dark:text-gray-300">
              Tu billetera todavía no está habilitada para firmar en <b>{network.label}</b>.
              Activá para operar y recibirás un código de <b>Crossmint</b> por email (no de Mercado Nero).
            </span>
            <button
              type="button"
              onClick={handleActivate}
              disabled={activating || loading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#F26722] text-white hover:brightness-110 disabled:opacity-60 flex items-center gap-1.5"
            >
              {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {activating ? "Activando..." : "Activar ahora"}
            </button>
          </div>
        )}

        {contractStatus && contractStatus.hasCode === false && (
          <div className="mt-4 p-3 rounded-lg text-xs font-medium bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900">
            ⚠️ La dirección del contrato de colateral ({CONTRACT_ADDRESS.slice(0, 10)}...) no tiene código en esta red. Los depósitos no van a impactar. Revisá <b>COLLATERAL_CONTRACT_{network.key.toUpperCase()}</b> en el .env del backend.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Saldo Disponible
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {loadingBalances ? (
                <span className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-sm font-medium">Sincronizando...</span>
                </span>
              ) : (
                <>
                  {balances.available}{" "}
                  <span className="text-sm font-normal">
                    {COLLATERAL_TOKEN_SYMBOL}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-950/40 rounded-xl border border-orange-100 dark:border-orange-900">
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
              En Órdenes Activas
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {loadingBalances ? (
                <span className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                  <span className="text-sm font-medium">Sincronizando...</span>
                </span>
              ) : (
                <>
                  {balances.locked}{" "}
                  <span className="text-sm font-normal">
                    {COLLATERAL_TOKEN_SYMBOL}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Fondo Total
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {loadingBalances ? (
                <span className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  <span className="text-sm font-medium">Sincronizando...</span>
                </span>
              ) : (
                <>
                  {balances.total}{" "}
                  <span className="text-sm font-normal">
                    {COLLATERAL_TOKEN_SYMBOL}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN: ÓRDENES CON GARANTÍA RETENIDA
          Desglosa el total "En Órdenes Activas" en cada venta que lo compone.
          Reutiliza /api/order/my-orders (role=seller). Muestra el colateral
          esperado del vendedor y la comisión (3% + referidos) a descontar. */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-orange-500" />
            Órdenes con Saldo retenido
          </h3>
          <button
            onClick={refreshAll}
            disabled={loadingOrders || loadingBalances}
            className="flex items-center gap-1.5 text-xs text-[#F26722] font-medium hover:underline disabled:opacity-50"
          >
            <RefreshCcw
              size={14}
              className={loadingOrders || loadingBalances ? "animate-spin" : ""}
            />
            Actualizar
          </button>
        </div>

        {loadingOrders ? (
          <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando órdenes...
          </div>
        ) : holdingOrders.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
            <Lock className="h-6 w-6 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No tenés saldo retenido en órdenes activas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Orden</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Comprador</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Garantía</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Comisión</th>
                  <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-right">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {holdingOrders.map((order) => {
                  // Monto de garantía que retiene el vendedor para esta orden.
                  const collateralUsd =
                    Number(order.financials?.sellerNetReleaseUsd) ||
                    Number(order.financials?.totalUsd) ||
                    Number(order.totalAmount) ||
                    0;
                  // Comisión total a descontar (base 3% + referidos).
                  const feeUsd = Number(order.financials?.platformFeeUsd || 0);
                  const buyerName =
                    [order.buyer?.firstName, order.buyer?.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim() ||
                    order.buyer?.username ||
                    "El comprador";
                  const code = String(order._id || "").slice(-6).toUpperCase();

                  return (
                    <tr key={order._id} className="dark:text-gray-200">
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-400">
                        #{code}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{buyerName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          {STATUS_REASON[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap text-gray-900 dark:text-white">
                        {collateralUsd.toFixed(2)}{" "}
                        <span className="text-xs font-normal text-gray-400">
                          {COLLATERAL_TOKEN_SYMBOL}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-rose-500 dark:text-rose-400">
                        -{feeUsd.toFixed(2)}{" "}
                        <span className="text-xs font-normal"> {COLLATERAL_TOKEN_SYMBOL}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <hr className="border-gray-200 dark:border-gray-800" />

      {/* SECCIÓN 2: FORMULARIOS DE ACCIÓN (DEPOSITAR Y RETIRAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SUB-COMPONENTE: DEPOSITAR */}
        <form
          onSubmit={handleDeposit}
          className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800"
        >
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
            Colocar Colateral en Garantía
          </h3>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              step="any"
              min={getOpLimit("deposit_collateral").minUsd}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              disabled={disabled}
              className="block w-full rounded-lg border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:text-white border dark:border-gray-700 focus:ring-blue-500 disabled:opacity-60"
              placeholder={`Mínimo US$ ${getOpLimit("deposit_collateral").minUsd}`}
            />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Depósito mínimo US$ {getOpLimit("deposit_collateral").minUsd} · hasta{" "}
            {getOpLimit("deposit_collateral").maxPerHour}/hora
          </p>
          <button
            type="submit"
            disabled={disabled}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 px-4 rounded-lg shadow transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {`Depositar ${COLLATERAL_TOKEN_SYMBOL}`}
          </button>
        </form>

        {/* SUB-COMPONENTE: RETIRAR */}
        <form
          onSubmit={handleWithdraw}
          className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800"
        >
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
            Quitar Garantía
          </h3>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              step="any"
              min={getOpLimit("withdraw_collateral").minUsd}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={withdrawDisabled}
              className="block w-full rounded-lg border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:text-white border dark:border-gray-700 focus:ring-red-500 disabled:opacity-60"
              placeholder={`Mínimo US$ ${getOpLimit("withdraw_collateral").minUsd}`}
            />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Retiro mínimo US$ {getOpLimit("withdraw_collateral").minUsd} · hasta{" "}
            {getOpLimit("withdraw_collateral").maxPerHour}/hora
          </p>
          <button
            type="submit"
            disabled={withdrawDisabled}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium text-sm py-2 px-4 rounded-lg shadow transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {`Retirar ${COLLATERAL_TOKEN_SYMBOL}`}
          </button>
        </form>
      </div>

      <button className="mx-auto bg-green-600 hover:bg-green-700 text-white font-medium text-sm py-2 px-4 rounded-lg shadow transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        Cargar saldo en garantía mediante tarjeta
        <CreditCard />
      </button>
    </div>
  );
}
