
const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Arbitrage integration test with mocks', function(){
  it('executes receiveFlashLoan using mock routers and yields profit', async function(){
    const [deployer] = await ethers.getSigners();

    // Deploy Mock ERC20 tokens
    const MockERC = await ethers.getContractFactory('MockERC20');
    const tokenA = await MockERC.deploy('TokenA','TKA', ethers.parseUnits('1000000',18));
    await tokenA.deployed();
    const tokenB = await MockERC.deploy('TokenB','TKB', ethers.parseUnits('1000000',18));
    await tokenB.deployed();

    // Deploy mock routers:
    // Router A will convert 1 TKA -> 2 TKB (multiplier 2)
    // Router B will convert 1 TKB -> 1.6 TKA (multiplier 8/5)
    const MockRouter = await ethers.getContractFactory('MockRouter');
    const routerA = await MockRouter.deploy(2,1); // x2
    await routerA.deployed();
    const routerB = await MockRouter.deploy(8,5); // x1.6
    await routerB.deployed();

    // Deploy a dummy Vault address (use deployer as vault)
    const vaultAddr = deployer.address;

    // Deploy ArbitrageBalancer with oracle placeholder = zero
    const Arb = await ethers.getContractFactory('ArbitrageBalancer');
    const arb = await Arb.deploy(vaultAddr, ethers.ZeroAddress);
    await arb.deployed();

    // Prepare tokens/amounts as if vault sent them
    const tokens = [tokenA.address];
    const amounts = [ethers.parseUnits('10',18)];
    const feeAmounts = [ethers.parseUnits('0',18)];

    // Prepare userData: inputToken, middleToken, outputToken, routers, paths, minOutsSecondSwap, minTwap
    const routers = [routerA.address, routerB.address];
    const paths = [[tokenA.address, tokenB.address], [tokenB.address, tokenA.address]];
    const minOutsSecondSwap = 1;
    const minTwap = 0;

    const abiCoder = new ethers.AbiCoder();
    const userData = abiCoder.encode(
      ['address','address','address','address[]','address[][]','uint256','uint256'],
      [tokenA.address, tokenB.address, tokenA.address, routers, paths, minOutsSecondSwap, minTwap]
    );

    // Call receiveFlashLoan directly as if vault (vault == deployer address)
    // But first, mint tokens to the contract so it has the loaned funds
    await tokenA.mint(arb.address, ethers.parseUnits('10',18));

    // Now call
    const tx = await arb.receiveFlashLoan(tokens, amounts, feeAmounts, userData);
    const receipt = await tx.wait();

    // Expect event with netProfit > 0
    const iface = arb.interface;
    const ev = receipt.events.find(e => e.event === 'FlashLoanExecuted');
    expect(ev).to.not.be.undefined;
    const net = ev.args.netProfit;
    // net should be > 0 (since 10 *2 *1.6 = 32 -> repay 10 -> profit 22)
    expect(net).to.be.gt(0);
  });
});
