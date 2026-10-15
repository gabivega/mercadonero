import React, { useState, useEffect, useCallback } from "react";
import { usePrivy } from "../Utils/authClient";
import { useUserStore } from "../store/useUserStore";
import { CreditCard, ShieldCheck, Lock, Loader2 } from "lucide-react";
import Swal from "sweetalert2";
import {
  readContract,
  writeContract,
  approveToken,
  getContractCode,
  getWalletAddress,
  deviceNeedsRecovery,
} from "../Utils/crossmintWallet";

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ Migración de Privy → Crossmint: esta pantalla firma con la smart wallet
// Crossmint (device signer) vía `crossmintWallet.js`.
//
// La smart wallet vive en Polygon Amoy (testnet). El contrato de colateral
// (NeroCollateral) y el token de garantía se resuelven por env.
//
// ⚠️ NOTA CLAVE sobre la dirección del vendedor:
//   La tx la firma la SMART WALLET de Crossmint. El mapping `vendors(address)`
//   del contrato registra el depósito bajo el `msg.sender` = esa smart wallet.
//   Por eso TODO (leer saldos y verificar depósito) usa `getWalletAddress()`
//   (la address REAL que firma), NO `dbUser.walletAddress` (que puede estar
//   desactualizada o ser otra). Ese era el motivo del FALSO NEGATIVO:
//   "no se confirmó el aumento de saldo".
const CONTRACT_ADDRESS =
  import.meta.env.VITE_COLLATERAL_CONTRACT_ADDRESS ||
  "0x4bDceCAa9bD92eE82EF9571c8940cd736Be9696a";

// Token de garantía en Polygon Amoy.
const COLLATERAL_TOKEN_ADDRESS =
  import.meta.env.VITE_COLLATERAL_TOKEN_ADDRESS ||
  "0x14196F08a4Fa0B66B7331bC40dd6bCd8A1dEeA9F";
const COLLATERAL_TOKEN_DECIMALS = Number(
  import.meta.env.VITE_COLLATERAL_TOKEN_DECIMALS || 6,
);
const COLLATERAL_TOKEN_SYMBOL =
  import.meta.env.VITE_COLLATERAL_TOKEN_SYMBOL || "USDT";

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

/** Lee vendors(wallet).totalCollateral on-chain. Devuelve null si falla. */
async function readVendorTotal(walletAddress) {
  try {
    const [totalCollateral] = await readContract({
      address: CONTRACT_ADDRESS,
      abi: COLLATERAL_POOL_ABI,
      functionName: "vendors",
      args: [walletAddress],
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
async function verifyDepositApplied(amountInBase, signerAddress) {
  if (!signerAddress) return { ok: true, reason: "no-wallet" };

  const before = await readVendorTotal(signerAddress);
  if (before === null) return { ok: false, reason: "no-read" };

  const expected = before + BigInt(amountInBase);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = await readVendorTotal(signerAddress);
    if (now !== null && now >= expected) return { ok: true, reason: "confirmed" };
  }
  return { ok: false, reason: "not-detected", expected: expected.toString() };
}

/** Verifica que el retiro se refleje: el total on-chain debe DISMINUIR. */
async function verifyWithdrawApplied(amountInBase, signerAddress) {
  if (!signerAddress) return { ok: true, reason: "no-wallet" };

  const before = await readVendorTotal(signerAddress);
  if (before === null) return { ok: false, reason: "no-read" };

  const expectedMax = before - BigInt(amountInBase);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = await readVendorTotal(signerAddress);
    if (now !== null && now <= expectedMax) return { ok: true, reason: "confirmed" };
  }
  return { ok: false, reason: "not-detected" };
}

/**
 * Comprueba que la dirección del contrato tenga CÓDIGO (eth_getCode != "0x").
 * Si no lo tiene, cualquier depósito será "fantasma".
 */
async function checkContractHasCode(address) {
  try {
    const code = await getContractCode({ address });
    const len = code ? code.length : 0;
    return { hasCode: Boolean(code) && code !== "0x", codeLength: len };
  } catch (error) {
    console.error("checkContractHasCode: no se pudo leer el código:", error);
    return { hasCode: null, codeLength: 0, error: error?.message };
  }
}

/**
 * Aviso de SEGURIDAD cuando el dispositivo es NUEVO (no tiene device signer
 * local). Crossmint pedirá un código por email para autorizar el dispositivo
 * (recovery), UNA sola vez por dispositivo. Lo avisamos ANTES de iniciar la
 * firma para que el usuario entienda el paso extra.
 *
 * @returns {Promise<boolean>} true = el usuario aceptó continuar.
 */
async function confirmNewDeviceIfNeeded(actionLabel) {
  let needsRecovery = false;
  try {
    needsRecovery = await deviceNeedsRecovery();
  } catch {
    needsRecovery = false;
  }
  if (!needsRecovery) return true;

  const dark = isDark();
  const result = await Swal.fire({
    icon: "info",
    title: "Autorización del dispositivo",
    html:
      `<p style="text-align:left;margin:0 0 10px">Estás intentando <b>${actionLabel}</b> con tu billetera desde un <b>dispositivo nuevo</b>.</p>` +
      `<p style="text-align:left;margin:0">Para autorizar esta operación de forma segura, te enviaremos un <b>código de seguridad a tu correo electrónico</b> mediante nuestro gestor de billetera.</p>` +
      `<p style="text-align:left;margin:10px 0 0;font-size:13px;opacity:.75">Esto se realiza <b>una sola vez</b> por cada dispositivo que utilices.</p>`,
    showCancelButton: true,
    confirmButtonText: "Continuar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#F26722",
    cancelButtonColor: "#6b7280",
    background: dark ? "#252525" : "#fff",
    color: dark ? "#fff" : "#111",
  });
  return result.isConfirmed;
}

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

export default function CollateralManager() {
  const { authenticated, user } = usePrivy();
  const dbWalletAddress = useUserStore((s) => s.dbUser?.walletAddress || null);
  // Address "de negocio" (Mongo). Se usa para gating de UI y como fallback.
  const walletAddress = dbWalletAddress || user?.wallet?.address || null;

  // Address REAL que firma (smart wallet Crossmint). Se resuelve al montar.
  const [signerAddress, setSignerAddress] = useState(null);

  // Estados para los saldos de la Blockchain
  const [balances, setBalances] = useState({
    total: "0.0",
    locked: "0.0",
    available: "0.0",
  });

  // Estados para los inputs y loaders
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState(false);
  // Progreso de la operación en curso para el overlay de carga.
  const [progress, setProgress] = useState("");

  // Estado del contrato de colateral: { hasCode, codeLength }.
  const [contractStatus, setContractStatus] = useState(null);

  // Chequeo inicial: ¿la dirección del contrato tiene bytecode en esta red?
  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await checkContractHasCode(CONTRACT_ADDRESS);
      if (mounted) setContractStatus(res);
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  // 1. FUNCIÓN PARA LEER LOS SALDOS (READ) — contra la address del signer.
  const fetchBalances = useCallback(async () => {
    const addr = signerAddress || (await resolveSignerAddress(walletAddress));
    if (!addr) return;
    try {
      const [totalCollateral, lockedCollateral] = await readContract({
        address: CONTRACT_ADDRESS,
        abi: COLLATERAL_POOL_ABI,
        functionName: "vendors",
        args: [addr],
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
    }
  }, [signerAddress, walletAddress]);

  // Leer saldos cuando haya signer resuelto y usuario autenticado.
  useEffect(() => {
    if (authenticated && (signerAddress || walletAddress)) {
      fetchBalances();
    }
  }, [authenticated, signerAddress, walletAddress, fetchBalances]);

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
      contractStatus || (await checkContractHasCode(CONTRACT_ADDRESS));
    if (codeCheck.hasCode === false) {
      Toast.fire({
        icon: "error",
        title:
          "El contrato de garantía no tiene código en esta red. No se puede depositar.",
      });
      return;
    }

    // 🔐 Dispositivo nuevo: avisamos ANTES de firmar (una vez por dispositivo).
    const proceed = await confirmNewDeviceIfNeeded(
      `depositar ${depositAmount} ${COLLATERAL_TOKEN_SYMBOL} en garantía`,
    );
    if (!proceed) return;

    setLoading(true);
    setProgress(`Aprobando ${COLLATERAL_TOKEN_SYMBOL}...`);

    try {
      const amountInBase = toBaseUnits(
        depositAmount,
        COLLATERAL_TOKEN_DECIMALS,
      );

      await approveToken({
        tokenAddress: COLLATERAL_TOKEN_ADDRESS,
        spender: CONTRACT_ADDRESS,
        amount: amountInBase,
      });

      setProgress("Confirmando el depósito en el contrato...");
      const tx = await writeContract({
        address: CONTRACT_ADDRESS,
        abi: COLLATERAL_POOL_ABI,
        functionName: "depositCollateral",
        args: [COLLATERAL_TOKEN_ADDRESS, amountInBase],
      });

      setProgress("Verificando el depósito on-chain...");
      // ⚠️ Verificación contra la address REAL del signer (no la de Mongo), para
      // no dar falsos negativos.
      const addrForVerify =
        signerAddress || (await resolveSignerAddress(walletAddress));
      const depositConfirmed = await verifyDepositApplied(
        amountInBase,
        addrForVerify,
      );

      setDepositAmount("");
      await fetchBalances();

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

    // 🔐 Dispositivo nuevo: avisamos ANTES de firmar.
    const proceed = await confirmNewDeviceIfNeeded(
      `retirar ${withdrawAmount} ${COLLATERAL_TOKEN_SYMBOL} de garantía`,
    );
    if (!proceed) return;

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
      });

      setProgress("Verificando el retiro on-chain...");
      const addrForVerify =
        signerAddress || (await resolveSignerAddress(walletAddress));
      const withdrawConfirmed = await verifyWithdrawApplied(
        amountInBase,
        addrForVerify,
      );

      setWithdrawAmount("");
      await fetchBalances();

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
    } catch (error) {
      console.error(error);
      Toast.fire({ icon: "error", title: describeError(error) });
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // No permitimos operar si no hay wallet o si el contrato no tiene código.
  const contractMissing = contractStatus?.hasCode === false;
  const disabled = loading || !walletAddress || contractMissing;
  const withdrawDisabled = disabled || balances.available === "0.00";

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

        {contractStatus && contractStatus.hasCode === false && (
          <div className="mt-4 p-3 rounded-lg text-xs font-medium bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900">
            ⚠️ La dirección del contrato de colateral ({CONTRACT_ADDRESS.slice(0, 10)}...) no tiene código en esta red. Los depósitos no van a impactar. Revisá <b>VITE_COLLATERAL_CONTRACT_ADDRESS</b>.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Saldo Disponible
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {balances.available}{" "}
              <span className="text-sm font-normal">
                {COLLATERAL_TOKEN_SYMBOL}
              </span>
            </div>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-950/40 rounded-xl border border-orange-100 dark:border-orange-900">
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
              En Órdenes Activas
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {balances.locked}{" "}
              <span className="text-sm font-normal">
                {COLLATERAL_TOKEN_SYMBOL}
              </span>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Fondo Total
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {balances.total}{" "}
              <span className="text-sm font-normal">
                {COLLATERAL_TOKEN_SYMBOL}
              </span>
            </div>
          </div>
        </div>
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
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              disabled={disabled}
              className="block w-full rounded-lg border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:text-white border dark:border-gray-700 focus:ring-blue-500 disabled:opacity-60"
              placeholder="Monto a depositar"
            />
          </div>
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
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={withdrawDisabled}
              className="block w-full rounded-lg border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:text-white border dark:border-gray-700 focus:ring-red-500 disabled:opacity-60"
              placeholder="Monto a retirar"
            />
          </div>
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
