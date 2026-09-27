/**
 * Genera el indice liviano de codigos postales de Argentina a partir del
 * archivo fuente `src/Utils/codigos-postales-argentina.xls`.
 *
 * Uso:  npm run build:cp
 *
 * Salida: src/data/codigosPostales.json
 *
 * Forma del JSON (objeto plano para busqueda O(1) en el browser):
 *   {
 *     "meta": { "generado": "<ISO date>", "totalCPs": 1234, "totalFilas": 23072 },
 *     "cp": {
 *       "2000": [["Santa Fe", "Rosario"], ["Santa Fe", "Villa Angelica"]],
 *       "1043": [["Capital Federal", "CABA - Retiro"]]
 *     }
 *   }
 *
 * El formato [provincia, localidad] por cada CP evita repetir claves y
 * mantiene el archivo compacto.
 *
 * IMPORTANTE: el .xls NO se carga en runtime. Se pre-procesa aca una sola vez
 * (y cuando se actualice el .xls) para no meter la libreria `xlsx` ni parsear
 * 23k filas en el cliente.
 */

import XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUT = resolve(__dirname, '../src/Utils/codigos-postales-argentina.xls');
const OUTPUT = resolve(__dirname, '../src/data/codigosPostales.json');

console.log(`[build:cp] Leyendo ${INPUT} ...`);
const wb = XLSX.readFile(INPUT);
const ws = wb.Sheets['Hoja1'] || wb.Sheets[wb.SheetNames[0]];
if (!ws) {
  console.error('[build:cp] No se encontro ninguna hoja en el .xls.');
  process.exit(1);
}

// header:1 -> matriz de arrays. Primera fila = encabezado (CP, Provincia, Localidad).
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const [header, ...body] = rows;

console.log(`[build:cp] Encabezado detectado: ${JSON.stringify(header)}`);

/** Normaliza una cadena: trim + colapsa espacios internos. */
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

/** @type {Record<string, Array<[string, string]>>} */
const cp = Object.create(null);
let filasValidas = 0;
let filasOmitidas = 0;

for (const row of body) {
  const rawCp = clean(row[0]);
  const provincia = clean(row[1]);
  const localidad = clean(row[2]);

  // Solo CP de 4 digitos (sistema viejo de Argentina — es lo que tiene el archivo).
  const cp4 = rawCp.replace(/\D/g, '');
  if (cp4.length !== 4 || !provincia || !localidad) {
    filasOmitidas += 1;
    continue;
  }

  if (!cp[cp4]) cp[cp4] = [];
  // Evitamos duplicados exactos (mismo par provincia+localidad).
  const yaExiste = cp[cp4].some(([p, l]) => p === provincia && l === localidad);
  if (!yaExiste) cp[cp4].push([provincia, localidad]);
  filasValidas += 1;
}

// Orden estable de las localidades de cada CP (provincia -> localidad).
for (const key of Object.keys(cp)) {
  cp[key].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

const totalCPs = Object.keys(cp).length;
const output = {
  meta: {
    generado: new Date().toISOString(),
    totalCPs,
    totalFilas: filasValidas,
  },
  cp,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(output), 'utf8');

console.log(
  `[build:cp] OK -> ${OUTPUT}\n` +
    `[build:cp]   CPs unicos: ${totalCPs}\n` +
    `[build:cp]   Filas validas: ${filasValidas}\n` +
    `[build:cp]   Filas omitidas: ${filasOmitidas}`,
);
