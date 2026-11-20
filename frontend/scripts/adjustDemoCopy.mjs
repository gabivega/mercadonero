// Ajusta el copy: "Cuando seas referidor..." -> condicional segun sesion.
import fs from "fs";

const P = "src/pages/dashboard/Referrals.jsx";
const lines = fs.readFileSync(P, "utf8").split(/\r?\n/);

// Buscamos la linea que arranca con "Ejemplos ilustrativos..."
const start = lines.findIndex((l) => l.includes("Ejemplos ilustrativos con montos reales"));
if (start === -1) {
  console.error("No encontre el parrafo.");
  process.exit(1);
}

// El bloque va desde 'start' hasta la linea que contiene
// "vas a ver así cada producto habilitado."
let end = start;
while (end < lines.length && !lines[end].includes("vas a ver así cada producto habilitado.")) end++;

console.log("Parrafo: lineas", start, "a", end);
console.log("Texto actual:", lines.slice(start, end + 1).map((l) => l.trim()).join(" "));

const indent = lines[start].match(/^\s*/)[0];

const neu = [
  `${indent}Ejemplos ilustrativos con montos reales según el reparto vigente`,
  `${indent}({Math.round(referrerSharePercent)}/`,
  `${indent}{Math.round(100 - referrerSharePercent)}).{" "}`,
  `${indent}{isLoggedIn`,
  `${indent}  ? "Cuando te aprueben como referidor vas a ver así cada producto habilitado."`,
  `${indent}  : "Cuando seas referidor vas a ver así cada producto habilitado."}`,
];

lines.splice(start, end - start + 1, ...neu);
fs.writeFileSync(P, lines.join("\n"), "utf8");

const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("Cuando te aprueben como referidor") &&
  check.includes("{isLoggedIn");
console.log("");
console.log(ok ? "OK: copy ajustado" : "FALLO");
process.exit(ok ? 0 : 1);
