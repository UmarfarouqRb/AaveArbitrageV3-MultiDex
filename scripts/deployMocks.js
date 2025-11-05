const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy MockVault
  const MockVault = await ethers.getContractFactory("MockVault");
  const mockVault = await MockVault.deploy();
  await mockVault.waitForDeployment();
  console.log("MockVault deployed to:", await mockVault.getAddress());

  // Deploy MockToken (WETH)
  const MockTokenWETH = await ethers.getContractFactory("MockERC20");
  const mockTokenWETH = await MockTokenWETH.deploy("Wrapped Ether", "WETH", 1000000);
  await mockTokenWETH.waitForDeployment();
  console.log("MockToken (WETH) deployed to:", await mockTokenWETH.getAddress());

  // Deploy MockToken (DAI)
  const MockTokenDAI = await ethers.getContractFactory("MockERC20");
  const mockTokenDAI = await MockTokenDAI.deploy("Dai Stablecoin", "DAI", 1000000);
  await mockTokenDAI.waitForDeployment();
  console.log("MockToken (DAI) deployed to:", await mockTokenDAI.getAddress());

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
