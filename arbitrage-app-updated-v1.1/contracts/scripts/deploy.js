
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with', deployer.address);

  // Replace with Balancer Vault on target network
  const vaultAddress = process.env.VAULT_ADDRESS || '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
  const Arb = await ethers.getContractFactory('ArbitrageBalancer');
  const arb = await Arb.deploy(vaultAddress);
  await arb.deployed();
  console.log('ArbitrageBalancer deployed to', arb.address);
}

main().catch((err)=>{
  console.error(err);
  process.exit(1);
});
