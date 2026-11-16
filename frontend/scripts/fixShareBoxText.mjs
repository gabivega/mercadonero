// Reemplaza el texto de reciprocidad trabajando LINEA POR LINEA (inmune a
// diferencias de CRLF/LF e indentacion).
import fs from "fs";

const P = "src/components/ReferralShareBox.jsx";
const lines = fs.readFileSync(P, "utf8").split(/\r?\n/);

// Localizamos el bloque de 3 lineas:
//   <Sparkles ... />
//   Tu contacto también recibe su reintegro. Los dos ganan: por eso
//   compran.
const i = lines.findIndex((l) => l.includes("Tu contacto tambi"));
if (i === -1) {
  console.error("No encontre 'Tu contacto tambien'.");
  process.exit(1);
}

console.log("Linea encontrada:", i, "->", lines[i].trim());

const indent = lines[i].match(/^\s*/)[0];

// Reemplazamos desde el <Sparkles> (si esta justo arriba) hasta la linea que
// cierra con "compran."
const sparkleIdx = lines[i - 1]?.includes("Sparkles") ? i - 1 : i;

// Buscamos el fin del parrafo.
let end = i;
while (end < lines.length && !lines[end].includes("compran.")) end++;

const neu = [
  `${indent}<Sparkles size={12} className="text-[#F26722] shrink-0" />`,
  `${indent}<span>`,
  `${indent}  El comprador recibe{" "}`,
  `${indent}  <b className="text-gray-600 dark:text-gray-300">{compradorLabel}</b>{" "}`,
  `${indent}  adicional de reintegro.`,
  `${indent}</span>`,
];

lines.splice(sparkleIdx, end - sparkleIdx + 1, ...neu);

let out = lines.join("\n");

// El <p> contenedor: items-center -> items-start (ahora son 2 lineas).
out = out.replace(
  'className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1.5"',
  'className="text-[11px] text-gray-400 dark:text-gray-500 flex items-start gap-1.5 leading-snug"',
);

fs.writeFileSync(P, out, "utf8");

const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("El comprador recibe") &&
  check.includes("adicional de reintegro") &&
  !check.includes("Tu contacto también recibe");
console.log(ok ? "OK: texto actualizado" : "FALLO");
process.exit(ok ? 0 : 1);
