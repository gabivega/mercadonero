// Muestra la grilla de EJEMPLO también a logueados sin aprobar.
// Reemplazo linea por linea (inmune a CRLF/LF).
import fs from "fs";

const P = "src/pages/dashboard/Referrals.jsx";
const raw = fs.readFileSync(P, "utf8");
const lines = raw.split(/\r?\n/);

const ci = lines.findIndex((l) => l.includes("GRILLA DE EJEMPLO"));
if (ci === -1) {
  console.error("No encontre el comentario de la grilla.");
  process.exit(1);
}

let condIdx = -1;
for (let i = ci; i < Math.min(ci + 10, lines.length); i++) {
  if (lines[i].includes("!isLoggedIn && (")) {
    condIdx = i;
    break;
  }
}
if (condIdx === -1) {
  console.error("No encontre la condicion !isLoggedIn && (");
  process.exit(1);
}

console.log("Comentario en linea", ci, "| condicion en linea", condIdx);

const indent = lines[condIdx].match(/^\s*/)[0];
const newComment = [
  `${indent}{/* ── GRILLA DE EJEMPLO (visitantes y usuarios sin aprobar) ──`,
  `${indent}    Mostramos 5 cards IDÉNTICAS a las que ve un referidor aprobado`,
  `${indent}    (misma ProductCard + misma franja de ganancia), pero con datos`,
  `${indent}    hardcodeados.`,
  `${indent}    La condición es \`!isApproved\` (no \`!isLoggedIn\`): así también la`,
  `${indent}    ve quien tiene cuenta pero todavía no fue aprobado, que es justamente`,
  `${indent}    quien necesita entender el programa antes de pedir acceso. Al`,
  `${indent}    aprobado no se le muestra porque abajo ya tiene la grilla REAL. */}`,
];

lines.splice(ci, condIdx - ci + 1, ...newComment, `${indent}{!isApproved && (`);

fs.writeFileSync(P, lines.join("\n"), "utf8");

const check = fs.readFileSync(P, "utf8");
const ok = check.includes("{!isApproved && (") && check.includes("<ReferralDemoGrid");
console.log(ok ? "OK: grilla visible para no aprobados" : "FALLO");
process.exit(ok ? 0 : 1);
