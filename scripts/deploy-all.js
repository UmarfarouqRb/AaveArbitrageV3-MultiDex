
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with', deployer.address);

  // SET YOUR DESIRED GAS PRICE HERE (in gwei)
  const gasPrice = ethers.utils.parseUnits('50', 'gwei');

  // Deploy MockERC20
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const mockERC20 = await MockERC20.deploy('Mock Token', 'MT', { gasPrice });
  await mockERC20.deployed();
  console.log('MockERC20 deployed to', mockERC20.address);

  // Deploy MockRouter
  const MockRouter = await ethers.getContractFactory('MockRouter');
  const mockRouter = await MockRouter.deploy({ gasPrice });
  await mockRouter.deployed();
  console.log('MockRouter deployed to', mockRouter.address);

  // Deploy UniswapV2TwapOracle
  const UniswapV2TwapOracle = await ethers.getContractFactory('UniswapV2TwapOracle');
  // In a real scenario, you would provide the actual Uniswap V2 pair address
  const uniswapV2TwapOracle = await UniswapV2TwapOracle.deploy(mockRouter.address, { gasPrice });
  await uniswapV2TwapOracle.deployed();
  console.log('UniswapV2TwapOracle deployed to', uniswapV2TwapOracle.address);

  // Deploy ArbitrageBalancer
  const vaultAddress = process.env.VAULT_ADDRESS || '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
  if (!vaultAddress) {
    console.error('Please set the VAULT_ADDRESS environment variable');
    process.exit(1);
  }
  const ArbitrageBalancer = await ethers.get_contract_factory('ArbitrageBalancer');
  const arbitrageBalancer = await ArbitrageBalancer.deploy(vaultAddress, { gasPrice });
  await arbitrageBalancer.deployed();
  console.log('ArbitrageBalancer deployed to', arbitrageBalancer.address);

  // Link to frontend
  const fs = require('fs');
  const contractsDir = __dirname + '/../../frontend/src/contracts';

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir);
  }

  fs.writeFileSync(
    contractsDir + '/contract-addresses.json',
    JSON.stringify({
      ArbitrageBalancer: arbitrageBalancer.address,
      MockERC20: mockERC20.address,
      MockRouter: mockRouter.address,
      UniswapV2TwapOracle: uniswapV2TwapOracle.address
    })
  );

  // Also save the ABIs
  const arbitrageBalancerArtifact = require('../artifacts/contracts/ArbitrageBalancer.sol/ArbitrageBalancer.json');

  fs.writeFileSync(
    contractsDir + '/ArbitrageBalancer.json',
    JSON.stringify(arbitrageBalancerArtifact.abi, null, 2)
  );
}

main().catch((err)=>{
  console.error(err);
  process.exit(1);
});
