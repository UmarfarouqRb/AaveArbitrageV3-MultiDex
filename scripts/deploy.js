const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const mockVaultAddress = "0x3Be85560080684eC884a140F7b3bDCe6A0a272F5"; // Replace with the actual address of the MockVault contract on Base Sepolia

  const ArbitrageBalancer = await ethers.getContractFactory("ArbitrageBalancer");
  const arbitrageBalancer = await ArbitrageBalancer.deploy(mockVaultAddress);
  await arbitrageBalancer.waitForDeployment();

  console.log("ArbitrageBalancer deployed to:", await arbitrageBalancer.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
