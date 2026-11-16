// "Paga con cripto o transferencia" queda al limite (497px de 502). Lo
// acortamos a "Cripto o transferencia" para dejar aire.
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");

const before = s;
s = s.replace('label: "Pagá con cripto o transferencia"', 'label: "Cripto o transferencia"');

if (s === before) {
  console.log("No encontrado (revisar).");
  process.exit(1);
}
fs.writeFileSync(P, s, "utf8");

const check = fs.readFileSync(P, "utf8");
const ok = check.includes('label: "Cripto o transferencia"');
console.log(ok ? "OK: label acortado" : "FALLO");
process.exit(ok ? 0 : 1);
