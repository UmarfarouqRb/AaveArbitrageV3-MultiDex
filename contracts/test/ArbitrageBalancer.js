
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArbitrageBalancer", function () {
  let arbitrageBalancer, owner;
  let tokenA, tokenB;
  let router1, router2;
  let mockVault;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // Deploy MockVault
    const MockVault = await ethers.getContractFactory("MockVault");
    mockVault = await MockVault.deploy();
    await mockVault.deployed();

    // Deploy ArbitrageBalancer
    const ArbitrageBalancerFactory = await ethers.getContractFactory("ArbitrageBalancer");
    arbitrageBalancer = await ArbitrageBalancerFactory.deploy(mockVault.address);
    await arbitrageBalancer.deployed();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Token A", "TKA", ethers.utils.parseEther("1000"));
    await tokenA.deployed();
    tokenB = await MockERC20.deploy("Token B", "TKB", ethers.utils.parseEther("1000"));
    await tokenB.deployed();

    // Deploy mock routers
    const MockRouter = await ethers.getContractFactory("MockRouter");
    router1 = await MockRouter.deploy();
    await router1.deployed();
    router2 = await MockRouter.deploy();
    await router2.deployed();

    // Mint tokens for the mock vault to provide as a flash loan
    await tokenA.mint(mockVault.address, ethers.utils.parseEther("100"));
    
    // Mint tokens for the routers to have liquidity for the swaps
    await tokenB.mint(router1.address, ethers.utils.parseEther("200")); // router1 needs tokenB to give out
    await tokenA.mint(router2.address, ethers.utils.parseEther("110")); // router2 needs tokenA to give out
  });

  it("Should execute a profitable flash loan arbitrage", async function () {
    const loanAmount = ethers.utils.parseEther("100");
    const minProfit = ethers.utils.parseEther("1");

    const paths = [
        [tokenA.address, tokenB.address], // Path for first swap
        [tokenB.address, tokenA.address]  // Path for second swap
    ];
    const routers = [router1.address, router2.address];

    // Simulate a price difference
    // Router 1 will give 2 TokenB for each TokenA
    await router1.setAmountOut(paths[0], loanAmount, loanAmount.mul(2));
    // Router 2 will give 1.01 TokenA for 2 TokenB, creating a profit of 1 tokenA
    await router2.setAmountOut(paths[1], loanAmount.mul(2), loanAmount.add(minProfit));


    const userData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'address', 'address[]', 'address[][]', 'uint256'],
        [tokenA.address, tokenB.address, tokenA.address, routers, paths, minProfit]
    );
    
    const ownerBalanceBefore = await tokenA.balanceOf(owner.address);
    const vaultBalanceBefore = await tokenA.balanceOf(mockVault.address);

    await arbitrageBalancer.startFlashloan(tokenA.address, loanAmount, userData);

    const ownerBalanceAfter = await tokenA.balanceOf(owner.address);
    const vaultBalanceAfter = await tokenA.balanceOf(mockVault.address);

    // The owner should have received the profit
    expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.gte(minProfit);
    // The vault should have been repaid the loan
    expect(vaultBalanceAfter).to.equal(vaultBalanceBefore);
  });
});
