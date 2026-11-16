// Quita la línea "por tu compra" de la caja del reintegro.
// Se superponía con el monto en importes de 3+ dígitos.
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");

// Buscamos la línea completa por su fragmento único.
const lines = s.split("\n");
const idx = lines.findIndex((l) => l.includes("por tu compra") && l.includes("<text"));

if (idx === -1) {
  console.log("No encontrada (ya removida).");
  process.exit(0);
}

console.log("Removiendo:", lines[idx].trim());
lines.splice(idx, 1);
s = lines.join("\n");

fs.writeFileSync(P, s, "utf8");

// Verificación en disco.
const check = fs.readFileSync(P, "utf8");
const ok = !check.includes("por tu compra");
console.log(ok ? "OK: removido en disco" : "FALLO");
process.exit(ok ? 0 : 1);
