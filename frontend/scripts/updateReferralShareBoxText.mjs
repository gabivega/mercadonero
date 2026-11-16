// Actualiza el texto de reciprocidad en ReferralShareBox (ficha del producto)
// para que muestre el MONTO real del comprador, igual que el panel de /referidos.
import fs from "fs";

const P = "src/components/ReferralShareBox.jsx";
let s = fs.readFileSync(P, "utf8");

const old = `            <Sparkles size={12} className="text-[#F26722]" />
            Tu contacto también recibe su reintegro. Los dos ganan: por eso
            compran.`;

const neu = `            <Sparkles size={12} className="text-[#F26722] shrink-0" />
            <span>
              El comprador recibe{" "}
              <b className="text-gray-600 dark:text-gray-300">{compradorLabel}</b>{" "}
              adicional de reintegro.
            </span>`;

if (!s.includes(old)) {
  console.error("No encontre el texto. Abortando.");
  process.exit(1);
}
s = s.replace(old, neu);

// El <p> contenedor usa items-center; con 2 lineas conviene items-start.
s = s.replace(
  'className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1.5"',
  'className="text-[11px] text-gray-400 dark:text-gray-500 flex items-start gap-1.5 leading-snug"',
);

fs.writeFileSync(P, s, "utf8");

const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("El comprador recibe") &&
  check.includes("adicional de reintegro") &&
  !check.includes("Tu contacto también recibe");
console.log(ok ? "OK: texto actualizado" : "FALLO");
process.exit(ok ? 0 : 1);
