// scripts/contractDeploy.cjs
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Desplegando contrato con la cuenta:", deployer.address);

  const NeroCollateral = await hre.ethers.getContractFactory("NeroCollateral");
  const contract = await NeroCollateral.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("NeroCollateral deployed to:", address);

  // ---- Actualizar CONTRACT_ADDRESS en .env ----
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    // Reemplaza la línea CONTRACT_ADDRESS si existe, sino la agrega al final
    const regex = /^CONTRACT_ADDRESS\s*=.*$/m;
    const line = `CONTRACT_ADDRESS = "${address}"`;
    env = regex.test(env) ? env.replace(regex, line) : env + "\n" + line;
    fs.writeFileSync(envPath, env, "utf8");
    console.log("CONTRACT_ADDRESS actualizada en .env");
  } else {
    console.warn("No se encontró .env para actualizar CONTRACT_ADDRESS");
  }

  return address;
}

main()
  .then((addr) => console.log("✅ Listo. Contrato:", addr))
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
});