// backend/src/services/groupBuyEscrowService.js
//
// SERVICIO DE ESCROW PARA COMPRAS GRUPALES ("Social Selling").
//
// Interactúa con el contrato NeroGroupBuy (BSC Testnet), siguiendo EXACTAMENTE
// el patrón de escrowServices.js (NeroEscrow):
//
//   - fund: lo firma el COMPRADOR desde el front (createGroup / joinGroup).
//     Acá solo VERIFICAMOS on-chain que quedó fondeado.
//   - Cierre, liberación parcial y reembolso: los firma el BACKEND (wallet
//     admin WALLET_PK), que es la ÚNICA entidad autorizada en el contrato.
//
// IMPORTANTE (lección aprendida): NUNCA confiar solo en que una tx "se minó
// sin revertir". Siempre releer el estado on-chain real del contrato antes de
// marcar una acción como exitosa.

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const abiPath = path.resolve(__dirname, "../../contracts/NeroGroupBuyABI.json");
const contractABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

// ── CONFIGURACIÓN DEL ENTORNO ──
const PROVIDER_URL =
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com";
const GROUP_BUY_CONTRACT_ADDRESS = process.env.GROUP_BUY_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.WALLET_PK; // Clave privada de la wallet Admin
const GROUP_BUY_FEE_BPS = Number(process.env.GROUP_BUY_FEE_BPS || 300);

if (!GROUP_BUY_CONTRACT_ADDRESS) {
  console.warn(
    "[GroupBuy] ⚠️ GROUP_BUY_CONTRACT_ADDRESS no configurada en el .env. El servicio fallará al usarse.",
  );
}

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const adminWallet = new ethers.Wallet(PRIVATE_KEY, provider);
// ⚠️ Si el address todavía no está configurado, no instanciamos el contrato
// (evita el throw de ENS por dirección vacía). Las funciones devuelven un error
// claro al invocarse sin contrato configurado.
const groupBuyContract = GROUP_BUY_CONTRACT_ADDRESS
  ? new ethers.Contract(GROUP_BUY_CONTRACT_ADDRESS, contractABI, adminWallet)
  : null;

/** Lanza un error legible si el contrato no está configurado. */
function _requireContract() {
  if (!groupBuyContract) {
    throw new Error(
      "GROUP_BUY_CONTRACT_ADDRESS no está configurada en el .env. Desplegá el contrato y setea la variable.",
    );
  }
}

// ── HELPERS ──
const toUnits = (amountUsd) => ethers.parseUnits(String(amountUsd), 18);
const fromUnits = (amount) => Number(ethers.formatUnits(amount, 18));

/**
 * HERRAMIENTA DE LECTURA: fee global actual del contrato (bps).
 */
export async function getGroupFeeBps() {
  try {
    const feeBps = await groupBuyContract.feeBps();
    return { success: true, feeBps: Number(feeBps) };
  } catch (error) {
    console.error(
      "[GroupBuy Error] Fallo al leer feeBps:",
      error.reason || error.message,
    );
    return {
      success: false,
      feeBps: GROUP_BUY_FEE_BPS,
      error: error.reason || error.message,
    };
  }
}

/**
 * HERRAMIENTA DE LECTURA: datos base de un grupo on-chain.
 */
export async function getGroupOnChain(groupId) {
  try {
    const g = await groupBuyContract.getGroup(groupId);
    return {
      success: true,
      seller: g.seller,
      creator: g.creator,
      token: g.token,
      targetBuyers: Number(g.targetBuyers),
      memberCount: Number(g.memberCount),
      priceFinalUsd: fromUnits(g.priceFinalUsd),
      closed: g.closed,
      executed: g.executed,
      refunded: g.refunded,
    };
  } catch (error) {
    console.error(
      "[GroupBuy Error] Fallo al leer grupo:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * Lee el estado on-chain de un comprador dentro del grupo (por wallet).
 * Contrato v2: getMemberByAddress devuelve (exists, lockedAmount, units, released).
 */
export async function getMemberOnChain(groupId, buyerAddress) {
  try {
    const m = await groupBuyContract.getMemberByAddress(groupId, buyerAddress);
    return {
      success: true,
      exists: m[0],
      lockedAmount: fromUnits(m[1]),
      units: Number(m[2]),
      released: m[3],
    };
  } catch (error) {
    console.error(
      "[GroupBuy Error] Fallo al leer miembro:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * Verifica on-chain que un grupo existe y está fondeado (>= 1 miembro).
 */
export async function verifyGroupFunded(groupId) {
  const group = await getGroupOnChain(groupId);
  if (!group.success) return { ...group, funded: false };
  return { success: true, funded: group.memberCount >= 1, group };
}

/**
 * Verifica on-chain que un comprador quedó REGISTRADO y fondeado en el grupo,
 * con las unidades y el monto esperados. Útil tras createGroup/joinGroup.
 * @param {string} groupId
 * @param {string} buyerAddress
 * @param {object} [expected]  { units, minLockedAmount } para sanity-check opcional
 */
export async function verifyMemberFunded(groupId, buyerAddress, expected = {}) {
  const member = await getMemberOnChain(groupId, buyerAddress);
  if (!member.success) return { ...member, funded: false };
  if (!member.exists) {
    return { success: true, funded: false, error: "El comprador no está en el grupo on-chain." };
  }
  if (expected.units != null && member.units !== Number(expected.units)) {
    return {
      success: false,
      funded: true,
      error: `Unidades on-chain (${member.units}) != esperadas (${expected.units}).`,
      member,
    };
  }
  if (expected.minLockedAmount != null && member.lockedAmount < expected.minLockedAmount) {
    return {
      success: false,
      funded: true,
      error: `Monto congelado on-chain (${member.lockedAmount}) < esperado (${expected.minLockedAmount}).`,
      member,
    };
  }
  return { success: true, funded: true, member };
}

/**
 * ACCIÓN ADMIN: CERRAR EL GRUPO fijando el precio final en USDT.
 * Se llama cuando el grupo se llenó o venció el plazo con >= 2 compradores.
 * @param {string} groupId
 * @param {number} priceFinalUsd  precio final unitario (en USDT)
 */
export async function closeGroupOnChain(groupId, priceFinalUsd) {
  try {
    console.log(`[GroupBuy] Cerrando grupo ${groupId} @ ${priceFinalUsd} USDT...`);

    const group = await getGroupOnChain(groupId);
    if (!group.success) return { success: false, error: group.error };
    if (group.closed) {
      return { success: true, alreadyClosed: true, message: "El grupo ya estaba cerrado." };
    }
    if (group.memberCount < 2) {
      return {
        success: false,
        error: "El grupo necesita al menos 2 compradores para cerrarse.",
      };
    }

    _requireContract();
    const tx = await groupBuyContract.closeGroup(groupId, toUnits(priceFinalUsd));
    console.log(`[GroupBuy] Tx closeGroup enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[GroupBuy] closeGroup confirmada en bloque: ${receipt.blockNumber}`);

    // Verificación REAL on-chain.
    const verify = await getGroupOnChain(groupId);
    if (!verify.success || !verify.closed) {
      return {
        success: false,
        txHash: tx.hash,
        error: "La tx se minó pero el grupo sigue abierto on-chain. Intervención manual.",
      };
    }
    return { success: true, txHash: tx.hash, priceFinalUsd: verify.priceFinalUsd };
  } catch (error) {
    console.error("[GroupBuy Error] Fallo al cerrar grupo:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: LIBERAR LA PORCIÓN DE UN COMPRADOR.
 * El comprador confirmó la recepción. El contrato:
 *   - envía al vendedor priceFinalUsd - fee,
 *   - cobra el fee a feeWallet,
 *   - reintegra al comprador lockedAmount - priceFinalUsd.
 * @param {string} groupId
 * @param {string} buyerAddress  wallet del comprador
 */
export async function releaseMemberOnChain(groupId, buyerAddress) {
  try {
    console.log(`[GroupBuy] Liberando porción de ${buyerAddress} en grupo ${groupId}...`);

    const member = await getMemberOnChain(groupId, buyerAddress);
    if (!member.success) return { success: false, error: member.error };
    if (!member.exists) {
      return { success: false, error: "El comprador no está en el grupo." };
    }
    if (member.released) {
      return {
        success: true,
        alreadyReleased: true,
        message: "La porción ya estaba liberada on-chain.",
      };
    }

    const tx = await groupBuyContract.releaseMember(groupId, buyerAddress);
    console.log(`[GroupBuy] Tx releaseMember enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[GroupBuy] releaseMember confirmada en bloque: ${receipt.blockNumber}`);

    // Verificación REAL on-chain.
    const verify = await getMemberOnChain(groupId, buyerAddress);
    if (!verify.success || !verify.released) {
      return {
        success: false,
        txHash: tx.hash,
        error: "La tx se minó pero la porción sigue sin liberar on-chain. Intervención manual.",
      };
    }
    return { success: true, txHash: tx.hash, verifiedReleased: true };
  } catch (error) {
    console.error(
      "[GroupBuy Error] Fallo al liberar porción:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: REEMBOLSAR AL CREADOR.
 * El grupo expiró con 1 solo comprador: se devuelve el 100% sin fee.
 */
export async function refundGroupOnChain(groupId) {
  try {
    console.log(`[GroupBuy] Reembolsando grupo ${groupId}...`);

    const group = await getGroupOnChain(groupId);
    if (!group.success) return { success: false, error: group.error };
    if (group.closed) {
      return { success: false, error: "El grupo ya está cerrado; no aplica reembolso de expiración." };
    }
    if (group.refunded) {
      return { success: true, alreadyRefunded: true, message: "El grupo ya estaba reembolsado." };
    }
    if (group.memberCount !== 1) {
      return { success: false, error: "El reembolso por expiración solo aplica con 1 comprador." };
    }

    const tx = await groupBuyContract.refundCreator(groupId);
    console.log(`[GroupBuy] Tx refundCreator enviada: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[GroupBuy] refundCreator confirmada en bloque: ${receipt.blockNumber}`);

    const verify = await getGroupOnChain(groupId);
    if (!verify.success || !verify.refunded) {
      return {
        success: false,
        txHash: tx.hash,
        error: "La tx se minó pero el grupo sigue sin reembolsar on-chain. Intervención manual.",
      };
    }
    return { success: true, txHash: tx.hash, verifiedRefunded: true };
  } catch (error) {
    console.error(
      "[GroupBuy Error] Fallo al reembolsar grupo:",
      error.reason || error.message,
    );
    return { success: false, error: error.reason || error.message };
  }
}

/**
 * ACCIÓN ADMIN: ACTUALIZAR EL FEE GLOBAL DEL CONTRATO (bps).
 */
export async function setGroupFeeBps(newFeeBps) {
  try {
    console.log(`[GroupBuy] Actualizando fee a ${newFeeBps} bps...`);
    const tx = await groupBuyContract.setFeeBps(newFeeBps);
    const receipt = await tx.wait();
    console.log(`[GroupBuy] feeBps actualizado en bloque: ${receipt.blockNumber}`);

    const readBack = await getGroupFeeBps();
    if (!readBack.success || readBack.feeBps !== Number(newFeeBps)) {
      return {
        success: false,
        txHash: tx.hash,
        currentFeeBps: readBack.feeBps,
        error: "La tx se minó pero el fee on-chain no cambió. Intervención manual.",
      };
    }
    return { success: true, txHash: tx.hash, feeBps: Number(newFeeBps) };
  } catch (error) {
    console.error("[GroupBuy Error] Fallo al actualizar fee:", error.reason || error.message);
    return { success: false, error: error.reason || error.message };
  }
}

export { GROUP_BUY_FEE_BPS, GROUP_BUY_CONTRACT_ADDRESS };
