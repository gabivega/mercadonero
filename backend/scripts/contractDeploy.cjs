// scripts/contractDeploy.js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Desplegando contrato con la cuenta:", deployer.address);

  const NeroCollateral = await hre.ethers.getContractFactory("NeroCollateral");
  const contract = await NeroCollateral.deploy();

  await contract.waitForDeployment();

  console.log("NeroCollateral deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});