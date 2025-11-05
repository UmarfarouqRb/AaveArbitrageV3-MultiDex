
const { ethers } = require("ethers");
const { abi: IUniswapV2RouterABI } = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json');
const { abi: ArbitrageBalancerABI } = require('../artifacts/contracts/ArbitrageBalancer.sol/ArbitrageBalancer.json');
const { abi: UniswapV2TwapOracleABI } = require('../artifacts/contracts/UniswapV2TwapOracle.sol/UniswapV2TwapOracle.json');
const contractAddresses = require('../../frontend/src/contracts/contract-addresses.json');

require("dotenv").config();

// 1. SETUP
const provider = new ethers.providers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const wallet = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY, provider);

const arbitrageBalancer = new ethers.Contract(contractAddresses.ArbitrageBalancer, ArbitrageBalancerABI, wallet);
const twapOracle = new ethers.Contract(contractAddresses.UniswapV2TwapOracle, UniswapV2TwapOracleABI, wallet);

// Sample Routers (replace with actual Sepolia router addresses)
const ROUTER1_ADDRESS = "0xC532a74256D3Db421739eff4E6041Abd1e20e6E4"; // Example: Uniswap on Sepolia
const ROUTER2_ADDRESS = "0x88dF01DB2b28a993A54202103E841a42556a0292"; // Example: Sushiswap on Sepolia

// Sample Tokens (replace with actual Sepolia token addresses)
const TOKEN_A = "0x779877A7B0D5E86032E80FC37341Bf7Ac444d179"; // e.g., WETH
const TOKEN_B = "0x606554dCDE67812F284D7221330654878a834433"; // e.g., DAI

// 2. The Arbitrage Logic
async function findArbitrage() {
    console.log("-----------------------------------------");
    console.log("Running arbitrage check at", new Date().toLocaleTimeString());

    try {
        // In a real bot, you'd get prices from multiple DEX APIs.
        // Here, we'll use the on-chain `consult` for demonstration.
        // This shows how to use the oracle, but isn't a real arbitrage strategy.

        const amountIn = ethers.utils.parseUnits("1", 18); // 1 Token A

        // Use the TWAP oracle to get a reliable, manipulation-resistant price.
        const expectedAmountOut = await twapOracle.consult(amountIn, { gasLimit: 300000 });

        console.log(`Oracle Price: 1 Token A = ${ethers.utils.formatUnits(expectedAmountOut, 18)} Token B`);

        // Now, get a spot price from another DEX (for comparison)
        const router2 = new ethers.Contract(ROUTER2_ADDRESS, IUniswapV2RouterABI, provider);
        const amountsOut = await router2.getAmountsOut(amountIn, [TOKEN_A, TOKEN_B]);
        const spotPriceAmountOut = amountsOut[1];

        console.log(`Spot Price:   1 Token A = ${ethers.utils.formatUnits(spotPriceAmountOut, 18)} Token B`);

        // *** CORE ARBITRAGE CONDITION ***
        // If the spot price is significantly higher than the oracle's average price,
        // it might indicate an arbitrage opportunity.
        const PROFIT_THRESHOLD = ethers.utils.parseUnits("0.01", 18); // Minimum 0.01 Token B profit

        if (spotPriceAmountOut.gt(expectedAmountOut.add(PROFIT_THRESHOLD))) {
            console.log("Found a potential arbitrage opportunity! Executing flash loan...");

            // This is a simplified path for demonstration.
            const path1 = [TOKEN_A, TOKEN_B]; // Trade on Router 1
            const path2 = [TOKEN_B, TOKEN_A]; // Trade back on Router 2

            const minProfit = ethers.utils.parseUnits("0.005", 18); // Target profit of 0.005 Token A

            // Encode the data for the flash loan
            const userData = ethers.utils.defaultAbiCoder.encode(
                ['address', 'address', 'address', 'address[]', 'address[][]', 'uint256'],
                [TOKEN_A, TOKEN_B, TOKEN_A, [ROUTER1_ADDRESS, ROUTER2_ADDRESS], [path1, path2], minProfit]
            );

            // Estimate gas for the transaction
            const gasEstimate = await arbitrageBalancer.estimateGas.startFlashloan(TOKEN_A, amountIn, userData);
            console.log(`Estimated Gas: ${gasEstimate.toString()}`);

            // Execute the flash loan with a higher gas price for priority
            const tx = await arbitrageBalancer.startFlashloan(TOKEN_A, amountIn, userData, {
                gasLimit: gasEstimate.mul(12).div(10), // Add 20% buffer
                gasPrice: ethers.utils.parseUnits('60', 'gwei') // Set a competitive gas price
            });

            console.log("Flash loan transaction sent! Tx hash:", tx.hash);
            const receipt = await tx.wait();
            console.log("Transaction confirmed!", receipt);

            const flashLoanEvent = receipt.events?.find(e => e.event === 'FlashLoanExecuted');
            if (flashLoanEvent) {
                const netProfit = ethers.utils.formatUnits(flashLoanEvent.args.netProfit, 18);
                console.log(`\x1b[32m%s\x1b[0m`, `*** SUCCESS! Net Profit: ${netProfit} ${TOKEN_A} ***`);
            }

        } else {
            console.log("No profitable opportunity found this time.");
        }

    } catch (error) {
        console.error("\x1b[31m%s\x1b[0m", "An error occurred:", error.message);
    }
}

// 3. RUN THE BOT
// Run the check every 30 seconds
console.log("Starting Arbitrage Bot...");
findArbitrage(); // Run once immediately
setInterval(findArbitrage, 30 * 1000);