// scripts/compileCollateral.js
// Compila NeroCollateral.sol con solcjs (sin depender de la versión de hardhat,
// que ahora está desalineada). Genera ABI + bytecode en build/NeroCollateral.json.
import solc from "solc";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.resolve(__dirname, "../contracts/NeroCollateral.sol");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: { "NeroCollateral.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Depurar errores
if (output.errors) {
  for (const e of output.errors) {
    console.error(`\n[${e.severity}] ${e.formattedMessage}`);
  }
  const fatal = output.errors.filter((e) => e.severity === "error").length;
  if (fatal > 0) {
    console.error(`\n✗ Compilación con ${fatal} errores. Abortando.`);
    process.exit(1);
  }
}

const contract = output.contracts["NeroCollateral.sol"]["NeroCollateral"];
const abi = contract.abi;
const bytecode = "0x" + contract.evm.bytecode.object;

// Persistir build (para el paso de deploy)
const outPath = path.resolve(__dirname, "../build/NeroCollateral.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ abi, bytecode, source: "NeroCollateral.sol" }, null, 2),
);

console.log("✔ Compilación OK.");
console.log("  ABI       :", abi.length, "entradas");
console.log("  bytecode  :", (bytecode.length / 2 - 1), "bytes");
console.log("  guardado  :", outPath);
