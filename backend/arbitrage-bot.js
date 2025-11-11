
require('dotenv').config();
const { Wallet, JsonRpcProvider, Contract, AbiCoder, parseUnits, formatUnits } = require('ethers');

// --- CONFIGURATION ---
const ARBITRAGE_BOT_ADDRESS = process.env.ARBITRAGE_BOT_ADDRESS || '0x7Af71A0700380Ffb51c1fB15c2cf71e6551630B2';
const PROFIT_THRESHOLD = process.env.PROFIT_THRESHOLD || '0.01'; // Minimum profit
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const GAS_STRATEGY = process.env.GAS_STRATEGY || 'medium'; // medium, fast, urgent
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS) || 60000; // 1 minute

// ABI for the ArbitrageBalancer contract
const ARBITRAGE_BALANCER_ABI = ["constructor(address _vault, address _multiSig)","event FlashLoanExecuted(address indexed token, uint256 loanAmount, int256 netProfit)","event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)","event Paused(address account)","event ProfitWithdrawal(address indexed token, uint256 amount)","event RouterAdded(address indexed router)","event RouterRemoved(address indexed router)","event Unpaused(address account)","function addRouter(address router) external","function multiSig() external view returns (address)","function pause() external","function paused() external view returns (bool)","function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata feeAmounts, bytes calldata userData) external","function removeRouter(address router) external","function startFlashloan(address token, uint256 amount, bytes calldata userData) external","function transferOwnership(address newMultiSig) external","function unpause() external","function vault() external view returns (address)","function whitelistedRouters(address) external view returns (bool)","function withdraw(address tokenAddress) external"];

// ABIs for DEX interaction
const ERC20_ABI = ["function balanceOf(address account) external view returns (uint256)", "function decimals() external view returns (uint8)"];
const PAIR_ABI = ['function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)', 'function token0() external view returns (address)'];
const ROUTER_ABI = ['function factory() external pure returns (address)', 'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'];
const FACTORY_ABI = ['function getPair(address tokenA, address tokenB) external view returns (address pair)'];

// DEX and Token Configuration
const DEX_CONFIG = [
    { name: 'BaseSwap', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', factory: '0x89C836e1E496839b20675B3fE398158c069D26db' },
    { name: 'SushiSwap', router: '0x8cde23bfcc333490347344f2A14a60C803275f4D', factory: '0x01b004245785055233513229562711422B4bA2E1' },
    { name: 'Aerodrome', router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', factory: '0x420DD3817f364D72123541178a35624794890312' },
    { name: 'Wovenswap', router: '0x9948293913214153d1021714457543E5A447617A', factory: '0x3f353B02633041F1A121515574512534563aA18b' },
    { name: 'SwapBased', router: '0x1a713915139d8995111b51a54763B13809633aC8', factory: '0xE4CF472E32724A3e8a4a329aaa3A6A48713d2903' },
    { name: 'RocketSwap', router: '0x7aA010850A264eB919F58a5e542B76d26A4734a7', factory: '0x1A2555543c360155b10313f8A7836881a56f6bB6' },
];

const TOKEN_PAIRS = [
    { name: 'WETH/USDC', a: '0x4200000000000000000000000000000000000006', b: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    { name: 'WETH/DAI', a: '0x4200000000000000000000000000000000000006', b: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' },
];

const GAS_LIMIT = 800000;
const SLIPPAGE_BPS = 50; // 0.5%
const DYNAMIC_LOAN_PERCENTAGE = 5; // 0.5% of pool liquidity

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runBot() {
    console.log("Initializing arbitrage bot...");

    if (!PRIVATE_KEY || !INFURA_PROJECT_ID) {
        console.error("CRITICAL: PRIVATE_KEY or INFURA_PROJECT_ID environment variable is not set.");
        process.exit(1);
    }

    const provider = new JsonRpcProvider(`https://base-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    console.log(`Bot started. Wallet address: ${wallet.address}`);
    console.log(`Scanning for arbitrage opportunities every ${SCAN_INTERVAL_MS / 1000} seconds...`);
    console.log(`Profit threshold set to ${PROFIT_THRESHOLD}`);

    const allPaths = [];
    for (const pair of TOKEN_PAIRS) {
        for (let i = 0; i < DEX_CONFIG.length; i++) {
            for (let j = 0; j < DEX_CONFIG.length; j++) {
                if (i === j) continue;
                allPaths.push({ pair, dex1: DEX_CONFIG[i], dex2: DEX_CONFIG[j] });
            }
        }
    }
    
    while (true) {
        try {
            console.log(`
--- Starting new scan at ${new Date().toISOString()} ---`);
            const promises = allPaths.map(path => findAndExecuteArbitrage(wallet, provider, path));
            await Promise.allSettled(promises);
        } catch (error) {
            console.error("An unexpected error occurred during the main loop:", error);
        }
        await delay(SCAN_INTERVAL_MS);
    }
}

async function findAndExecuteArbitrage(wallet, provider, path) {
    try {
        const { pair, dex1, dex2 } = path;
        const tokenA = pair.a;
        const tokenB = pair.b;

        const tokenAContract = new Contract(tokenA, ERC20_ABI, provider);
        const tokenADecimals = await tokenAContract.decimals();

        const factory1 = new Contract(dex1.factory, FACTORY_ABI, provider);
        const pairAddress = await factory1.getPair(tokenA, tokenB);

        if (pairAddress === '0x0000000000000000000000000000000000000000') {
             // console.log(`No pair found for ${pair.name} on ${dex1.name}`);
            return;
        }

        const pairContract = new Contract(pairAddress, PAIR_ABI, provider);
        const reserves = await pairContract.getReserves();
        const token0 = await pairContract.token0();

        const reserve = (tokenA.toLowerCase() === token0.toLowerCase()) ? reserves[0] : reserves[1];
        const loanAmount = (reserve * BigInt(DYNAMIC_LOAN_PERCENTAGE)) / 1000n;

        if (loanAmount <= 0) return;

        const router1 = new Contract(dex1.router, ROUTER_ABI, provider);
        const amountsOut1 = await router1.getAmountsOut(loanAmount, [tokenA, tokenB]);
        const amountOutFromFirstSwap = amountsOut1[1];
        
        const router2 = new Contract(dex2.router, ROUTER_ABI, provider);
        const finalAmountsOut = await router2.getAmountsOut(amountOutFromFirstSwap, [tokenB, tokenA]);
        const simulatedFinalAmount = finalAmountsOut[1];

        const netProfit = simulatedFinalAmount - loanAmount; // Simplified profit calculation
        const profitThresholdAmount = parseUnits(PROFIT_THRESHOLD, tokenADecimals);

        if (netProfit > profitThresholdAmount) {
            console.log(`[${new Date().toLocaleTimeString()}] Profitable trade FOUND:`);
            console.log(`  Pair: ${pair.name}`);
            console.log(`  Route: ${dex1.name} -> ${dex2.name}`);
            console.log(`  Loan Amount: ${formatUnits(loanAmount, tokenADecimals)} ${pair.name.split('/')[0]}`);
            console.log(`  Estimated Profit: ${formatUnits(netProfit, tokenADecimals)} ${pair.name.split('/')[0]}`);
            
            await executeTrade(wallet, provider, tokenA, tokenB, dex1, dex2, loanAmount, profitThresholdAmount, tokenADecimals);
        }
    } catch (error) {
        // console.error(`Error scanning path ${path.pair.name} on ${path.dex1.name} -> ${path.dex2.name}:`, error.reason || error.message);
    }
}

async function executeTrade(wallet, provider, tokenA, tokenB, dex1, dex2, loanAmount, profitThresholdAmount, tokenADecimals) {
    const arbitrageBot = new Contract(ARBITRAGE_BOT_ADDRESS, ARBITRAGE_BALANCER_ABI, wallet);

    const minAmountOutFromFirstSwap = (await new Contract(dex1.router, ROUTER_ABI, provider).getAmountsOut(loanAmount, [tokenA, tokenB]))[1] * (10000n - BigInt(SLIPPAGE_BPS)) / 10000n;

    const flashLoanData = {
        inputToken: tokenA,
        middleToken: tokenB,
        routers: [dex1.router, dex2.router],
        paths: [[tokenA, tokenB], [tokenB, tokenA]],
        minProfit: profitThresholdAmount,
        minAmountOutFromFirstSwap,
        twapMaxDeviationBps: 0,
        oracleAddress: '0x0000000000000000000000000000000000000000', // Oracle disabled
        factory: dex1.factory
    };

    const userData = new AbiCoder().encode(['(address,address,address[],address[][],uint256,uint256,uint256,address,address)'], [Object.values(flashLoanData)]);

    const feeData = await provider.getFeeData();
    let gasPrice;
    switch(GAS_STRATEGY) {
        case 'fast': gasPrice = feeData.maxFeePerGas * 12n / 10n; break;
        case 'urgent': gasPrice = feeData.maxFeePerGas * 15n / 10n; break;
        default: gasPrice = feeData.maxFeePerGas;
    }

    try {
        const tx = await arbitrageBot.startFlashloan(tokenA, loanAmount, userData, {
            gasLimit: GAS_LIMIT,
            gasPrice: gasPrice
        });

        console.log(`  >>> Flash loan transaction sent! Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`  >>> Transaction confirmed in block ${receipt.blockNumber}`);
        
        // Find and log the FlashLoanExecuted event
        const eventTopic = arbitrageBot.interface.getEventTopic('FlashLoanExecuted');
        const log = receipt.logs.find(x => x.topics[0] === eventTopic);
        if (log) {
            const decodedLog = arbitrageBot.interface.decodeEventLog('FlashLoanExecuted', log.data, log.topics);
            const actualProfit = formatUnits(decodedLog.netProfit, tokenADecimals);
            console.log(`  ✅ SUCCESS! Actual Profit: ${actualProfit} ${pair.name.split('/')[0]}`);
        }

    } catch (executionError) {
        console.error(`  ❌ FAILED to execute trade:`, executionError.reason || executionError.message);
    }
}

module.exports = { runBot };
