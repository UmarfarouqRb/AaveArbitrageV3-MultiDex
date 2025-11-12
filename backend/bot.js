
require('dotenv').config();
const { ethers } = require('ethers');
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
const { NETWORKS, TOKENS, DEX_ROUTERS, DEX_FACTORIES, BOT_CONFIG } = require('./config');
const { calculateDynamicProfit, getDynamicGasPrice } = require('./services');
const { multicall } = require('./multicall');

// --- Pre-flight Checks ---
function checkEnvironment() {
    console.log("Performing environment pre-flight checks...");
    if (!process.env.PRIVATE_KEY) {
        throw new Error("FATAL: PRIVATE_KEY environment variable is not set.");
    }
    if (!process.env.INFURA_PROJECT_ID) {
         console.warn("WARN: INFURA_PROJECT_ID is not set. The application might fail if the RPC URL in config.js depends on it.");
    }
    console.log("Environment checks passed.");
}

async function run() {
    try {
        checkEnvironment();

        // --- Basic Setup ---
        console.log("Initializing provider and wallet...");
        const provider = new ethers.JsonRpcProvider(NETWORKS.base.rpcUrl);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        console.log(`Wallet initialized for address: ${wallet.address}`);

        // --- Caching ---
        const pairCache = new Map();
        const CACHE_TTL = 3600 * 1000; // 1 hour

        // --- Main Logic ---
        console.log('Arbitrage Bot Starting...');
        const flashbotsProvider = await FlashbotsBundleProvider.create(provider, wallet);
        console.log("Flashbots provider created.");

        provider.on('block', async (blockNumber) => {
            console.log(`[BLOCK ${blockNumber}] Scanning for arbitrage opportunities...`);
            try {
                const opportunities = await findArbitrageOpportunities();
                if (opportunities.length > 0) {
                    console.log(`Found ${opportunities.length} potential opportunities. Analyzing profitability...`);
                    for (const opportunity of opportunities) {
                        const netProfit = await calculateDynamicProfit(opportunity, provider);
                        if (netProfit > ethers.utils.parseUnits(BOT_CONFIG.MIN_PROFIT_THRESHOLD, 18)) {
                            console.log(`Profitable opportunity found! Net profit: ${ethers.utils.formatEther(netProfit)} ETH`);
                            await executeTrade(opportunity, flashbotsProvider, blockNumber);
                        }
                    }
                }
            } catch (scanError) {
                console.error(`[ERROR] An error occurred during the block scan at block ${blockNumber}:`, scanError.message);
            }
        });

        async function findArbitrageOpportunities() {
            let opportunities = [];
            const hardcodedOpportunities = await analyzeTokenPairs(getTokenPairs());
            opportunities = opportunities.concat(hardcodedOpportunities);
            const discoveredOpportunities = await discoverAndAnalyzeNewPairs();
            opportunities = opportunities.concat(discoveredOpportunities);
            return opportunities;
        }

        async function analyzeTokenPairs(tokenPairs) {
            const opportunities = [];
            for (const pair of tokenPairs) {
                for (const dex1 of Object.keys(DEX_ROUTERS.base)) {
                    for (const dex2 of Object.keys(DEX_ROUTERS.base)) {
                        if (dex1 === dex2) continue;
                        const opportunity = await analyzePair(pair, dex1, dex2);
                        if (opportunity) {
                            opportunities.push(opportunity);
                        }
                    }
                }
            }
            return opportunities;
        }

        async function discoverAndAnalyzeNewPairs() {
            let discoveredOpportunities = [];
            for (const dex of Object.keys(DEX_FACTORIES.base)) {
                try {
                    let pairs = pairCache.get(dex);
                    if (!pairs || Date.now() > pairs.timestamp + CACHE_TTL) {
                        const fetchedPairs = await fetchAllPairsInBatches(dex);
                        pairs = { list: fetchedPairs, timestamp: Date.now() };
                        pairCache.set(dex, pairs);
                    }
                    if (!pairs.list || pairs.list.length === 0) continue;
                    const pairsToScan = pairs.list.slice(0, 100);
                    const reserves = await getReservesWithMulticall(pairsToScan);
                    for (let i = 0; i < pairsToScan.length; i++) {
                        if (!reserves[i]) continue;
                        const [reserve0, reserve1] = reserves[i];
                        const pair = pairsToScan[i];
                        if (reserve0 > ethers.utils.parseUnits('1', 12) && reserve1 > ethers.utils.parseUnits('1', 12)) {
                            const opportunities = await analyzeTokenPairs([[pair.token0, pair.token1]]);
                            discoveredOpportunities = discoveredOpportunities.concat(opportunities);
                        }
                    }
                } catch (error) {
                    console.error(`Error discovering pairs from ${dex}:`, error.message);
                }
            }
            return discoveredOpportunities;
        }

        async function fetchAllPairsInBatches(dex) {
            let factory;
            try {
                const factoryAddress = ethers.getAddress(DEX_FACTORIES.base[dex]);
                factory = new ethers.Contract(factoryAddress, [
                    'function allPairs(uint) view returns (address)',
                    'function allPairsLength() view returns (uint)'
                ], provider);
            } catch (e) {
                if (e.code === 'INVALID_ARGUMENT') {
                    console.warn(`[WARN] Invalid factory address for ${dex}. Skipping. ${e.message}`);
                    return [];
                }
                throw e;
            }

            const allPairsLength = await factory.allPairsLength();
            const BATCH_SIZE = 100;
            let allPairs = [];
            for (let i = 0; i < allPairsLength; i += BATCH_SIZE) {
                const batchEnd = i + BATCH_SIZE < allPairsLength ? i + BATCH_SIZE : Number(allPairsLength);
                const pairAddressCalls = [];
                for (let j = i; j < batchEnd; j++) {
                    pairAddressCalls.push({ target: await factory.getAddress(), callData: factory.interface.encodeFunctionData('allPairs', [j]) });
                }
                try {
                    const pairAddressesResult = await multicall(provider, pairAddressCalls);
                    const resolvedAddresses = pairAddressesResult.map(res => ethers.utils.defaultAbiCoder.decode(['address'], res)[0]);
                    const pairInterface = new ethers.Interface(['function token0() view returns (address)', 'function token1() view returns (address)']);
                    const tokenCalls = resolvedAddresses.map(address => ({ target: address, callData: pairInterface.encodeFunctionData('token0') }));
                    tokenCalls.push(...resolvedAddresses.map(address => ({ target: address, callData: pairInterface.encodeFunctionData('token1') })));
                    const tokenResults = await multicall(provider, tokenCalls);
                    for (let k = 0; k < resolvedAddresses.length; k++) {
                        try {
                            const address = ethers.getAddress(resolvedAddresses[k]);
                            const token0 = ethers.getAddress(ethers.utils.defaultAbiCoder.decode(['address'], tokenResults[k])[0]);
                            const token1 = ethers.getAddress(ethers.utils.defaultAbiCoder.decode(['address'], tokenResults[k + resolvedAddresses.length])[0]);
                            allPairs.push({ address, token0, token1 });
                        } catch (e) {
                            if (e.code === 'INVALID_ARGUMENT') {
                                console.warn(`[WARN] Found and skipped a malformed pair/token address from ${dex}.`);
                            } else {
                                throw e;
                            }
                        }
                    }
                } catch (batchError) {
                    console.error(`[ERROR] Failed to process a batch for ${dex}. Skipping batch.`, batchError.message);
                }
            }
            return allPairs;
        }

        async function getReservesWithMulticall(pairs) {
            const pairInterface = new ethers.Interface(['function getReserves() view returns (uint112, uint112, uint32)']);
            const calls = pairs.map(pair => ({ target: pair.address, callData: pairInterface.encodeFunctionData('getReserves') }));
            const results = await multicall(provider, calls);
            return results.map((result, i) => {
                try {
                    return ethers.utils.defaultAbiCoder.decode(['uint112', 'uint112', 'uint32'], result);
                } catch (e) {
                    return null;
                }
            });
        }

        async function analyzePair(pair, dex1, dex2) {
            const [tokenA, tokenB] = pair;
            try {
                const amountIn = ethers.utils.parseUnits('1', 18);
                const router1 = new ethers.Contract(DEX_ROUTERS.base[dex1], ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'], provider);
                const router2 = new ethers.Contract(DEX_ROUTERS.base[dex2], ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'], provider);
                const amounts1 = await router1.getAmountsOut(amountIn, [tokenA, tokenB]);
                const amountOut1 = amounts1[1];
                const amounts2 = await router2.getAmountsOut(amountOut1, [tokenB, tokenA]);
                const amountOut2 = amounts2[1];
                if (amountOut2 > amountIn) {
                    return { tokenA, tokenB, dex1, dex2, amountIn, amountOut: amountOut2 };
                }
            } catch (error) {}
            return null;
        }

        async function executeTrade(opportunity, flashbotsProvider, blockNumber) {
            console.log(`Executing trade for ${opportunity.tokenA}/${opportunity.tokenB} on ${opportunity.dex1}/${opportunity.dex2}`)
            const arbitrageContract = new ethers.Contract(BOT_CONFIG.ARBITRAGE_CONTRACT_ADDRESS, ['function executeArbitrage(address tokenIn, address tokenOut, uint amountIn, address dexRouter1, address dexRouter2) external'], wallet);
            const gasPrice = await getDynamicGasPrice(provider);
            const tx = await arbitrageContract.populateTransaction.executeArbitrage(
                opportunity.tokenA,
                opportunity.tokenB,
                opportunity.amountIn,
                DEX_ROUTERS.base[opportunity.dex1],
                DEX_ROUTERS.base[opportunity.dex2],
                { gasPrice, gasLimit: BOT_CONFIG.GAS_LIMIT }
            );
            const bundle = [{ transaction: tx, signer: wallet }];
            try {
                const signedBundle = await flashbotsProvider.signBundle(bundle);
                const simulation = await flashbotsProvider.simulate(signedBundle, blockNumber + 1);
                if (simulation.results[0].error) {
                    console.error(`[EXECUTION FAILED] Simulation error: ${simulation.results[0].error}`);
                } else {
                    console.log('[EXECUTION SUCCEEDED] Trade simulated successfully. Sending bundle...');
                    const receipt = await flashbotsProvider.sendRawBundle(signedBundle, blockNumber + 1);
                    console.log(`Bundle sent! Transaction hash: ${receipt.bundleHash}`);
                }
            } catch (e) {
                console.error('[CRITICAL] Flashbots submission error:', e.message);
            }
        }

        function getTokenPairs() {
            const tokens = Object.values(TOKENS.base);
            const pairs = [];
            for (let i = 0; i < tokens.length; i++) {
                for (let j = i + 1; j < tokens.length; j++) {
                    pairs.push([tokens[i], tokens[j]]);
                }
            }
            return pairs;
        }

    } catch (error) {
        console.error("A fatal error occurred during bot initialization:", error);
        process.exit(1);
    }
}

run();
