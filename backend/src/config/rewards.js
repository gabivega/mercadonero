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
// con poner `REWARDS_CHECKOUT_ENABLED=true` (env del backend) y el flag
// equivalente del frontend (VITE_REWARDS_CHECKOUT_ENABLED=true) y redeployar.
//
// ¿Por qué el DEFAULT es `false` (y no `true` como antes)? Este flag mueve
// plata real: si el backend no se entera de la variable (env ausente, deploy
// nuevo, typo en el nombre), un default permisivo habilitaba el gasto de
// saldo en producción por descuido. El "fail-closed" garantiza que, ante la
// duda, NADIE gasta recompensas: la función queda apagada hasta que alguien
// la active EXPLÍCITAMENTE. Para habilitarla hay que setear la env en "true".
export const REWARDS_CHECKOUT_ENABLED =
  String(process.env.REWARDS_CHECKOUT_ENABLED ?? "false") === "true";

