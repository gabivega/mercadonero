// Ajusta la geometria de la fila de beneficios para acomodar 4 items sin
// que choquen con la caja del reintegro (que arranca en y=806).
import fs from "fs";

const P = "src/services/referralKitService.js";
let s = fs.readFileSync(P, "utf8");

const oldBlock = `  // Dos en la primera fila, una en la segunda.
  const benefitSvg = beneficios
    .map(({ icon, label }, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 470;
      const y = 716 + row * 54;`;

const newBlock = `  // Grilla de 2 columnas x 2 filas (4 items). Arranca en y=700 y cada fila
  // baja 50px: la ultima linea cae en y=750, con margen hasta la caja del
  // reintegro (y=806). La columna 2 va a x=MARGIN+450 (no 470) para que
  // "Paga con cripto o transferencia" no se pase del margen derecho.
  const benefitSvg = beneficios
    .map(({ icon, label }, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * 450;
      const y = 700 + row * 50;`;

if (!s.includes(oldBlock)) {
  console.error("No encontre el bloque de benefitSvg. Abortando.");
  process.exit(1);
}
s = s.replace(oldBlock, newBlock);

// El separador estaba en y=670: lo subimos a 662 para dar aire a 2 filas.
s = s.replace(
  `<rect x="\${MARGIN}" y="670" width="\${KIT_SIZE - MARGIN * 2}" height="1.5"`,
  `<rect x="\${MARGIN}" y="662" width="\${KIT_SIZE - MARGIN * 2}" height="1.5"`,
);

fs.writeFileSync(P, s, "utf8");

const check = fs.readFileSync(P, "utf8");
const ok = check.includes("y = 700 + row * 50") && check.includes("MARGIN + col * 450");
console.log(ok ? "OK: geometria actualizada" : "FALLO");
process.exit(ok ? 0 : 1);
