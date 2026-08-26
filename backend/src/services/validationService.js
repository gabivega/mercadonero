/**
 * Servicio de validación de sintaxis para datos bancarios y fiscales argentinos.
 *
 * NOTA IMPORTANTE (MVP):
 * Estas validaciones son 100% matemáticas/locales y GRATIS. Garantizan que el
 * CBU/CVU/CUIT estén "bien formados" (longitud + dígito verificador), lo que
 * detecta errores de tipeo y números inventados.
 *
 * NO validan la titularidad real de la cuenta ni la existencia del CBU en el
 * banco. Ese chequeo (hard) quedará reservado para cuentas verificadas (plan
 * premium), cuando integremos un proveedor de validación bancaria pago
 * (Mercado Pago, Belvo, Truora, etc.). Aquí dejamos el flag checkTitular en
 * false a modo de scaffolding para ese futuro.
 */

// ──────────────────────────────────────────────────────────────────────────
// CBU
// ──────────────────────────────────────────────────────────────────────────
// Un CBU tiene 22 dígitos divididos en 2 bloques:
//   - Bloque 1: 7 dígitos (entidad bancaria + sucursal) + 1 dígito verificador
//   - Bloque 2: 13 dígitos (cuenta) + 1 dígito verificador
// El dígito verificador de cada bloque se calcula con módulo 10 usando pesos.
// ──────────────────────────────────────────────────────────────────────────
const CBU_BLOCK_1_WEIGHTS = [7, 1, 3, 9, 7, 1, 3];
const CBU_BLOCK_2_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
const DIGITS = "0123456789";

/**
 * Calcula y valida el dígito verificador de un bloque CBU con módulo 10.
 * @param {string} block - Bloque de dígitos (sin el verificador).
 * @param {number[]} weights - Pesos correspondientes al bloque.
 * @param {string} checkDigit - Dígito verificador a comparar.
 * @returns {boolean}
 */
const verifyCBUBlock = (block, weights, checkDigit) => {
  if (block.length !== weights.length) return false;
  let sum = 0;
  for (let i = 0; i < block.length; i++) {
    const digit = DIGITS.indexOf(block[i]);
    if (digit === -1) return false;
    sum += digit * weights[i];
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === parseInt(checkDigit, 10);
};

/**
 * Valida la sintaxis de un CBU (22 dígitos + dígitos verificadores).
 * @param {string} cbu
 * @returns {{ valid: boolean, reason?: string }}
 */
export const validateCBU = (cbu) => {
  if (!cbu) return { valid: false, reason: "El CBU es obligatorio." };
  const cleaned = String(cbu).replace(/[\s-]/g, "");
  if (!/^\d{22}$/.test(cleaned)) {
    return { valid: false, reason: "El CBU debe tener exactamente 22 dígitos numéricos." };
  }

  const block1 = cleaned.slice(0, 7); // nro de banco/sucursal
  const block1Check = cleaned[7];
  const block2 = cleaned.slice(8, 21); // nro de cuenta
  const block2Check = cleaned[21];

  if (!verifyCBUBlock(block1, CBU_BLOCK_1_WEIGHTS, block1Check)) {
    return { valid: false, reason: "El dígito verificador del primer bloque del CBU no es válido. Revisá que lo hayas escrito bien." };
  }
  if (!verifyCBUBlock(block2, CBU_BLOCK_2_WEIGHTS, block2Check)) {
    return { valid: false, reason: "El dígito verificador del segundo bloque del CBU no es válido. Revisá que lo hayas escrito bien." };
  }

  return { valid: true };
};

// ──────────────────────────────────────────────────────────────────────────
// CVU
// ──────────────────────────────────────────────────────────────────────────
// Un CVU tiene 23 dígitos. Suele empezar con "000000" (bancos que usan CVU /
// cuentas sin CBU, ej. Mercado Pago). No tiene un estándar público tan rígido
// como el CBU para dígito verificador, así que validamos formato + prefijo.
// ──────────────────────────────────────────────────────────────────────────
/**
 * Valida la sintaxis de un CVU (23 dígitos, prefijo estándar).
 * @param {string} cvu
 * @returns {{ valid: boolean, reason?: string }}
 */
export const validateCVU = (cvu) => {
  if (!cvu) return { valid: false, reason: "El CVU es obligatorio." };
  const cleaned = String(cvu).replace(/[\s-]/g, "");
  if (!/^\d{23}$/.test(cleaned)) {
    return { valid: false, reason: "El CVU debe tener exactamente 23 dígitos numéricos." };
  }
  if (!cleaned.startsWith("000000")) {
    return { valid: false, reason: "El CVU ingresado parece no ser válido. Verificá que corresponda a una cuenta virtual o bancaria (CVU)." };
  }
  return { valid: true };
};

// ──────────────────────────────────────────────────────────────────────────
// CUIT / CUIL
// ──────────────────────────────────────────────────────────────────────────
// Un CUIT/CUIL tiene 11 dígitos: 2 prefijos, 8 del número de DNI, 1 verificador.
// El verificador se calcula con módulo 11 usando los multiplicadores fijos.
// ──────────────────────────────────────────────────────────────────────────
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Valida la sintaxis de un CUIT/CUIL (11 dígitos + dígito verificador módulo 11).
 * @param {string} cuit
 * @returns {{ valid: boolean, reason?: string }}
 */
export const validateCUIT = (cuit) => {
  if (!cuit) return { valid: false, reason: "El CUIT/CUIL es obligatorio." };
  const cleaned = String(cuit).replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(cleaned)) {
    return { valid: false, reason: "El CUIT/CUIL debe tener exactamente 11 dígitos numéricos." };
  }

  const body = cleaned.slice(0, 10);
  const checkDigit = parseInt(cleaned[10], 10);

  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += parseInt(body[i], 10) * CUIT_WEIGHTS[i];
  }
  const remainder = sum % 11;
  let expected;
  if (remainder === 0) expected = 0;
  else if (remainder === 1) expected = 9; // caso especial (suele requerir papel, pero lo aceptamos como válido en sintaxis)
  else expected = 11 - remainder;

  if (expected !== checkDigit) {
    return { valid: false, reason: "El dígito verificador del CUIT/CUIL no es válido. Revisá que lo hayas escrito bien." };
  }

  return { valid: true };
};

/**
 * Valida sintaxis de CBU o CVU según el tipo de cuenta elegido.
 * @param {"CBU" | "CVU"} type
 * @param {string} value
 */
export const validateBankAccount = (type, value) => {
  if (type === "CVU") return validateCVU(value);
  return validateCBU(value);
};

// ──────────────────────────────────────────────────────────────────────────
// VALIDACION ESTÁTICA DE TITULARIDAD (STAND BY)
// ──────────────────────────────────────────────────────────────────────────
// Flag que apaga/aprende el chequeo contra AFIP / banco. En este MVP está en
// false: solo NO validamos titularidad real (cuentas de terceros). Cuando
// integremos cuentas verificadas premium, encenderemos este flag y se ejecutará
// el proveedor de validación bancaria/KYC pagado.
export const checkTitular = false;

export default {
  validateCBU,
  validateCVU,
  validateCUIT,
  validateBankAccount,
  checkTitular,
};
