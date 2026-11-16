// Arregla el template literal roto al quitar la linea "por tu compra":
// la linea del monto perdio su cierre de backtick + comilla.
import fs from "fs";

const P = "src/services/referralKitService.js";
let lines = fs.readFileSync(P, "utf8").split("\n");

const idx = lines.findIndex(
  (l) => l.includes("formatUsd(buyerRewardUsd)") && l.includes("<text"),
);

if (idx === -1) {
  console.log("No encontre la linea del monto.");
  process.exit(1);
}

console.log("ANTES:", lines[idx]);

// Debe cerrar con: > ... </text>`  (backtick final del template literal)
if (!lines[idx].trimEnd().endsWith("</text>`")) {
  // Le falta el cierre del template literal.
  const trimmed = lines[idx].trimEnd().replace(/<\/text>\s*$/, "</text>`");
  lines[idx] = trimmed;
}

console.log("DESPUES:", lines[idx]);

fs.writeFileSync(P, lines.join("\n"), "utf8");

// Verificacion en disco.
const check = fs.readFileSync(P, "utf8");
const hasClose = check.includes("buyerRewardUsd)}</text>`");
const noPorTuCompra = !check.includes(">por tu compra<");
console.log("");
console.log("cierre del template:", hasClose);
console.log("'por tu compra' removido:", noPorTuCompra);
process.exit(hasClose && noPorTuCompra ? 0 : 1);
