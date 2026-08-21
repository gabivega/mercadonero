/**
 * SOLO COMPILA el contrato NeroCollateral (sin deploy).
 * Valida el .sol y escribe contracts/NeroCollateralABI.json
 *
 * Uso: node scripts/compileCollateral.mjs
 */
import solc from "solc";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const sourcePath = path.join(rootDir, "contracts", "NeroCollateral.sol");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: { "NeroCollateral.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === "error");
  if (errors.length) {
    console.error("❌ Errores de compilación:");
    errors.forEach((e) => console.error("   ", e.formattedMessage));
    process.exit(1);
  }
  output.errors
    .filter((e) => e.severity === "warning")
    .forEach((e) => console.warn("⚠️  ", e.formattedMessage));
}

const contract = output.contracts["NeroCollateral.sol"].NeroCollateral;
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

const abiPath = path.join(rootDir, "contracts", "NeroCollateralABI.json");
fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2), "utf8");

console.log("✅ Compilación OK");
console.log("➤ ABI      :", abiPath, `(${abi.length} entradas)`);
console.log("➤ Bytecode :", bytecode.length, "hex chars");

console.log("\nFunciones del contrato compilado:");
abi.filter((i) => i.type === "function").forEach((f) => {
  const inputs = f.inputs.map((x) => `${x.type} ${x.name}`).join(", ");
  console.log(`   ${f.stateMutability} ${f.name}(${inputs})`);
});
