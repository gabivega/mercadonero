// Aplica los ajustes de diseño del kit:
//   1. Reemplaza ICON_CRYPTO por ICON_CARD (crypto + transferencia) y suma
//      ICON_AWARD para el 4to bullet.
//   2. Reordena los beneficios y agrega "Nuevos y con garantía".
//   3. Saca el texto "por tu compra" de la caja del reintegro (se superponía).
//
// Se hace desde Node porque el checkout vive en OneDrive y las ediciones del
// editor no siempre llegan al disco real. Verificamos releyendo con fs.
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");
const before = s;

// ── 1) Íconos: reemplazar ICON_CRYPTO por ICON_CARD ──────────────────────
const oldCrypto = `  const ICON_CRYPTO = \`<circle cx="12" cy="12" r="9.5" fill="none" stroke="\${BRAND_SOFT}" stroke-width="2.2"/><path d="M12 7.5v9M9.5 9.8h3.6a2 2 0 010 4H9.5" fill="none" stroke="\${BRAND_SOFT}" stroke-width="2" stroke-linecap="round"/>\`;`;

const newCard = `  // Medios de pago: tarjeta (transferencia/cripto se resuelven igual para el
  // comprador: elige cómo pagar en el checkout).
  const ICON_CARD = \`<rect x="1.5" y="4.5" width="21" height="15" rx="2.5" fill="none" stroke="\${BRAND_SOFT}" stroke-width="2"/><path d="M1.5 9.5h21" stroke="\${BRAND_SOFT}" stroke-width="2"/><path d="M5 15h4" stroke="\${BRAND_SOFT}" stroke-width="2" stroke-linecap="round"/>\`;

  // Productos nuevos con garantía: sello con cinta (medalla).
  const ICON_AWARD = \`<circle cx="12" cy="9" r="6" fill="none" stroke="\${BRAND_SOFT}" stroke-width="2.2"/><path d="M8.5 14.2L7 22l5-2.6 5 2.6-1.5-7.8" fill="none" stroke="\${BRAND_SOFT}" stroke-width="2.2" stroke-linejoin="round"/>\`;`;

if (!s.includes(oldCrypto)) {
  console.error("No encontre ICON_CRYPTO. Abortando.");
  process.exit(1);
}
s = s.replace(oldCrypto, newCard);

// ── 2) Lista de beneficios: 4 items, acomodados por tema ─────────────────
const oldList = `  const beneficios = [
    { icon: ICON_SHIELD, label: "Compra 100% protegida" },
    { icon: ICON_CRYPTO, label: "Pagá con cripto o transferencia" },
    { icon: ICON_TRUCK, label: "Envío a todo el país" },
  ];`;

const newList = `  // Orden pensado para leer en Z: confianza → envío arriba; pago → garantía
  // abajo. Son 4 (había lugar para uno más y cierra mejor el bloque).
  const beneficios = [
    { icon: ICON_SHIELD, label: "Compra 100% protegida" },
    { icon: ICON_TRUCK, label: "Envío a todo el país" },
    { icon: ICON_CARD, label: "Pagá con cripto o transferencia" },
    { icon: ICON_AWARD, label: "Nuevos y con garantía" },
  ];`;

if (!s.includes(oldList)) {
  console.error("No encontre la lista de beneficios. Abortando.");
  process.exit(1);
}
s = s.replace(oldList, newList);

// ── 3) Caja del reintegro: sacar "por tu compra" ──────────────────────────
// El monto quedaba superpuesto con ese texto en montos de 3+ dígitos.
const oldText = `      <text x="\${MARGIN + 250}" y="896" font-family="\${fontFamily}" font-weight="500" font-size="23" fill="#d1d5db">por tu compra</text>`;
if (s.includes(oldText)) {
  s = s.replace(oldText + "\n", "");
} else {
  console.log("AVISO: no encontre el texto 'por tu compra' (puede ya estar removido).");
}

// ── 4) Comentario de la caja: ya no menciona el texto ────────────────────
s = s.replace(
  /\s*\/\/ Si no tenemos monto \(sin cotización\), omitimos la caja entera antes que\n\s*\/\/ mostrar un número que no cuadre con lo que realmente se acredita\./,
  `\n  // Si no tenemos monto (sin cotización), omitimos la caja entera antes que
  // mostrar un número que no cuadre con lo que realmente se acredita.
  // El monto va solo, sin texto al lado: con "por tu compra" se superponía
  // en montos de 3+ dígitos.`,
);

if (s !== before) fs.writeFileSync(P, s, "utf8");

// ── Verificación en disco ────────────────────────────────────────────────
const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("ICON_CARD") &&
  check.includes("ICON_AWARD") &&
  check.includes("Nuevos y con garantía") &&
  !check.includes("por tu compra");

console.log(ok ? "OK: cambios aplicados en disco" : "FALLO: revisar");
if (!ok) {
  console.log("  ICON_CARD:", check.includes("ICON_CARD"));
  console.log("  ICON_AWARD:", check.includes("ICON_AWARD"));
  console.log("  bullet nuevo:", check.includes("Nuevos y con garantía"));
  console.log("  'por tu compra' removido:", !check.includes("por tu compra"));
}
