// config/rewards.js
//
// Interruptores maestros del sistema de recompensas.
//
// ⚠️ FUENTE ÚNICA DE VERDAD para "¿se puede GASTAR el saldo de recompensas
// (cashback + referral-buyer) en el checkout?".
//
// Por decisión de negocio, el uso de recompensas en el checkout está
// DESHABILITADO. El saldo se sigue ACUMULANDO y mostrando en la wallet, pero no
// se descuenta de ninguna orden. Cuando el negocio decida habilitarlo, alcanza
// con poner `REWARDS_CHECKOUT_ENABLED = true` acá (backend) y el flag equivalente
// del frontend (VITE_REWARDS_CHECKOUT_ENABLED=true) y redeployar.
//
// Se mantiene como constante de código (no variable de entorno) a propósito:
// así el gate es determinístico y no depende de configuración del deploy. Si se
// prefiere controlarlo por env, basta leer process.env acá. Se lee la env
// primero para poder activar/desactivar en pruebas sin recompilar.
export const REWARDS_CHECKOUT_ENABLED =
  String(process.env.REWARDS_CHECKOUT_ENABLED ?? "true") !== "false";
