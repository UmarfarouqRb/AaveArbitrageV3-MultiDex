const { ethers, getAddress, keccak256, toUtf8Bytes, formatUnits, AbiCoder } = require('ethers');
const { pools, updateV2Pool, updateV3Pool, reconcilePools } = require('../core/poolState');
const { bn, expand, div, mul, sub } = require('../utils/bigints');
const { getPriceFromV2 } = require('../core/v2');
const { getPriceFromV3 } = require('../core/v3');
const { executeArbitrage } = require('./executor');
const { BOT_CONFIG, LOAN_TOKENS, TOKEN_DECIMALS, DEX_CONFIG, SWAP_STEP_TYPES, V2_DEX_TYPES, V3_DEX_TYPES, TOKENS } = require('../config');
const { getScanningProvider, getExecutionProvider } = require('../core/provider.js');
const { getAmountOut: getV2AmountOut, getOptimalAmountIn: getOptimalV2AmountIn } = require('../core/v2.js');
const { getAmountOut: getV3AmountOut } = require('../core/v3.js');
const { getArbitrageContract } = require('../core/wallet.js');

const SWAP_EVENT_TOPIC_V2 = keccak256(toUtf8Bytes("Sync(uint112,uint112)"));
const SWAP_EVENT_TOPIC_V3 = keccak256(toUtf8Bytes("Swap(address,address,int256,int256,uint160,uint128,int24)"));

let isScanning = false;
let isTrading = false;

// --- Helper Functions ---

function getEthPriceInToken(loanTokenSymbol) {
    const wethAddress = TOKENS.base.WETH;
    const loanTokenAddress = LOAN_TOKENS[loanTokenSymbol];
    const pairKey = `${loanTokenSymbol}-WETH`;
    const reversedPairKey = `WETH-${loanTokenSymbol}`;

    const pool = pools[pairKey] || pools[reversedPairKey];
    if (!pool || !pool.dexes) return 0n;

    let bestPrice = 0n;

    for (const dex in pool.dexes) {
        const dexData = pool.dexes[dex];
        let price = 0n;
        if (dexData.type === 'V2') {
            if (!dexData.reserve0 || !dexData.reserve1) continue;
            const reserves = (getAddress(pool.token0) === wethAddress) ? [dexData.reserve0, dexData.reserve1] : [dexData.reserve1, dexData.reserve0];
            price = div(mul(reserves[1], expand(1n, 18)), reserves[0]);
        } else if (dexData.type === 'V3') {
            let feeData = null;
            for (const fee in dexData.fees) { // Get the most liquid pool
                const currentFeeData = dexData.fees[fee];
                if (!currentFeeData.sqrtPriceX96 || !currentFeeData.liquidity) continue;
                if (!feeData || currentFeeData.liquidity > feeData.liquidity) {
                    feeData = currentFeeData;
                }
            }
            if (!feeData) continue;
            price = getPriceFromV3(feeData.sqrtPriceX96, pool.token0, pool.token1);
            if (getAddress(pool.token0) !== wethAddress) {
                price = div(expand(1n, 36), price);
            }
        }
        if (price > bestPrice) {
            bestPrice = price;
        }
    }
    return bestPrice;
}


function getBestLoanAmount(price1, price2, loanTokenSymbol, intermediateTokenSymbol, loanTokenAddress, intermediateTokenAddress) {
    // For V2 -> V2, we have a deterministic formula
    if (price1.type === 'V2' && price2.type === 'V2') {
        return getOptimalV2AmountIn(price1.reserve1, price1.reserve0, price2.reserve0, price2.reserve1);
    }

    // For paths involving V3, we iterate to find the best loan amount
    let bestLoanAmount = 0n;
    let maxProfit = -1n; // Use -1 to ensure any positive profit is chosen

    // Determine a reasonable starting reserve to base our iterations on
    const startingReserve = price1.type === 'V2' ? price1.reserve1 : (
        price1.liquidity > 0n ? div(mul(price1.liquidity, price1.sqrtPriceX96), (1n << 96n)) : 0n
    );

    if (startingReserve === 0n) return 0n;

    for (let i = 1; i <= BOT_CONFIG.V3_LOAN_AMOUNT_ITERATIONS; i++) {
        const increment = bn(BOT_CONFIG.V3_LOAN_AMOUNT_INCREMENT_BPS * i);
        const loanAmount = div(mul(startingReserve, increment), 10000n);
        if (loanAmount <= 0n) continue;

        try {
            const amountOut1 = (price1.type === 'V2')
                ? getV2AmountOut(loanAmount, price1.reserve1, price1.reserve0)
                : getV3AmountOut(loanAmount, price1.sqrtPriceX96, price1.liquidity, loanTokenAddress, intermediateTokenAddress, price1.tickSpacing, TOKEN_DECIMALS.base[loanTokenSymbol], TOKEN_DECIMALS.base[intermediateTokenSymbol]);

            const finalAmountOut = (price2.type === 'V2')
                ? getV2AmountOut(amountOut1, price2.reserve0, price2.reserve1)
                : getV3AmountOut(amountOut1, price2.sqrtPriceX96, price2.liquidity, intermediateTokenAddress, loanTokenAddress, price2.tickSpacing, TOKEN_DECIMALS.base[intermediateTokenSymbol], TOKEN_DECIMALS.base[loanTokenSymbol]);

            const grossProfit = sub(finalAmountOut, loanAmount);

            if (grossProfit > maxProfit) {
                maxProfit = grossProfit;
                bestLoanAmount = loanAmount;
            }
        } catch (e) {
            continue; // Calculation failed for this amount, try next
        }
    }

    return bestLoanAmount;
}


// --- Main Arbitrage Logic ---

async function findAndExecuteOpportunity(loanTokenSymbol, findMultiHop = false) {
    if (isTrading) return;

    if (findMultiHop) {
        await findBestMultiHopOpportunity(loanTokenSymbol);
    } else {
        for (const pairKey of Object.keys(pools)) {
            await calculateAndExecuteOpportunities(pairKey);
        }
    }
}

function getPrices(pairKey) {
    const pool = pools[pairKey];
    if (!pool || !pool.dexes) return [];

    const prices = [];

    for (const dex in pool.dexes) {
        const dexData = pool.dexes[dex];
        if (dexData.type === 'V2') {
            if (!dexData.reserve0 || !dexData.reserve1) continue;
            const price = getPriceFromV2(dexData.reserve0, dexData.reserve1);
            if (price === 0n) continue;
            prices.push({ dex, price, type: 'V2', reserve0: dexData.reserve0, reserve1: dexData.reserve1 });
        } else if (dexData.type === 'V3') {
            for (const fee in dexData.fees) {
                const feeData = dexData.fees[fee];
                if (!feeData.sqrtPriceX96 || !feeData.liquidity) continue;
                const price = getPriceFromV3(feeData.sqrtPriceX96, pool.token0, pool.token1);
                if (price === 0n) continue;
                prices.push({ dex, fee, price, type: 'V3', liquidity: feeData.liquidity, sqrtPriceX96: feeData.sqrtPriceX96, tickSpacing: feeData.tickSpacing });
            }
        }
    }
    return prices;
}

async function findBestMultiHopOpportunity(loanTokenSymbol) {
    const loanTokenAddress = LOAN_TOKENS[loanTokenSymbol];

    for (const pair1Key in pools) {
        const [token0, token1] = pair1Key.split('-');
        if (token0 !== loanTokenSymbol && token1 !== loanTokenSymbol) continue;

        const prices1 = getPrices(pair1Key);
        if (prices1.length === 0) continue;

        const intermediateTokenSymbol = (token0 === loanTokenSymbol) ? token1 : token0;
        const intermediateTokenAddress = (getAddress(pools[pair1Key].token0) === loanTokenAddress) ? getAddress(pools[pair1Key].token1) : getAddress(pools[pair1Key].token0);

        for (const pair2Key in pools) {
            const [token2, token3] = pair2Key.split('-');
            if ((token2 === intermediateTokenSymbol && token3 === loanTokenSymbol) || (token3 === intermediateTokenSymbol && token2 === loanTokenSymbol)) {

                const prices2 = getPrices(pair2Key);
                if (prices2.length === 0) continue;

                for (const price1 of prices1) {
                    for (const price2 of prices2) {
                        
                        const loanAmount = getBestLoanAmount(price1, price2, loanTokenSymbol, intermediateTokenSymbol, loanTokenAddress, intermediateTokenAddress);

                        if (loanAmount <= 0n) continue;

                        let amountOut1, finalAmountOut;
                        try {
                            if (price1.type === 'V2') {
                                amountOut1 = getV2AmountOut(loanAmount, price1.reserve1, price1.reserve0);
                            } else {
                                amountOut1 = getV3AmountOut(loanAmount, price1.sqrtPriceX96, price1.liquidity, loanTokenAddress, intermediateTokenAddress, price1.tickSpacing, TOKEN_DECIMALS.base[loanTokenSymbol], TOKEN_DECIMALS.base[intermediateTokenSymbol]);
                            }

                            if (price2.type === 'V2') {
                                finalAmountOut = getV2AmountOut(amountOut1, price2.reserve0, price2.reserve1);
                            } else {
                                finalAmountOut = getV3AmountOut(amountOut1, price2.sqrtPriceX96, price2.liquidity, intermediateTokenAddress, loanTokenAddress, price2.tickSpacing, TOKEN_DECIMALS.base[intermediateTokenSymbol], TOKEN_DECIMALS.base[loanTokenSymbol]);
                            }
                        } catch (e) {
                            continue;
                        }

                        const grossProfit = sub(finalAmountOut, loanAmount);
                        const aaveFee = div(mul(loanAmount, bn(BOT_CONFIG.AAVE_FLASH_LOAN_FEE_BPS)), 10000n);
                        let netProfit = sub(grossProfit, aaveFee);

                        if (netProfit <= 0n) continue;

                        const swapPath = [];
                        const swapsV2 = [];
                        const swapsV3 = [];

                        // Hop 1
                        if (price1.type === 'V2') {
                            swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
                            const dexConfig = DEX_CONFIG.base[price1.dex];
                            const swapData = AbiCoder.defaultAbiCoder().encode(['address[]','bool[]','address'], [[loanTokenAddress, intermediateTokenAddress], [pools[pair1Key].dexes[price1.dex].stable], dexConfig.factory]);
                            swapsV2.push({ router: dexConfig.router, path: [loanTokenAddress, intermediateTokenAddress], amountOutMin: 0, dexType: V2_DEX_TYPES[price1.dex], data: swapData });
                        } else {
                            swapPath.push({ stepType: SWAP_STEP_TYPES.V3, index: swapsV3.length });
                            swapsV3.push({ router: DEX_CONFIG.base[price1.dex].router, pool: pools[pair1Key].dexes[price1.dex].fees[price1.fee].address, tokenIn: loanTokenAddress, tokenOut: intermediateTokenAddress, amountOutMin: 0, dexType: V3_DEX_TYPES[price1.dex] });
                        }

                        // Hop 2
                        if (price2.type === 'V2') {
                            swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
                            const dexConfig = DEX_CONFIG.base[price2.dex];
                            const swapData = AbiCoder.defaultAbiCoder().encode(['address[]','bool[]','address'], [[intermediateTokenAddress, loanTokenAddress], [pools[pair2Key].dexes[price2.dex].stable], dexConfig.factory]);
                            swapsV2.push({ router: dexConfig.router, path: [intermediateTokenAddress, loanTokenAddress], amountOutMin: 0, dexType: V2_DEX_TYPES[price2.dex], data: swapData });
                        } else {
                            swapPath.push({ stepType: SWAP_STEP_TYPES.V3, index: swapsV3.length });
                            swapsV3.push({ router: DEX_CONFIG.base[price2.dex].router, pool: pools[pair2Key].dexes[price2.dex].fees[price2.fee].address, tokenIn: intermediateTokenAddress, tokenOut: loanTokenAddress, amountOutMin: 0, dexType: V3_DEX_TYPES[price2.dex] });
                        }
                        
                        let txCostInLoanToken = 0n;
                        try {
                            const arbitrageContract = getArbitrageContract();
                            const provider = getExecutionProvider();
                            const feeData = await provider.getFeeData();
                            const gasPrice = feeData.gasPrice;
                            if (!gasPrice || gasPrice === 0n) continue;

                            const estimatedGas = await arbitrageContract.executeArbitrage.estimateGas(loanTokenAddress, loanAmount, swapPath, swapsV3, swapsV2);
                            const gasLimit = div(mul(estimatedGas, 120n), 100n);
                            const txCost = mul(gasPrice, gasLimit);
                            
                            const ethPriceInLoanToken = getEthPriceInToken(loanTokenSymbol);
                            if (ethPriceInLoanToken <= 0n) continue;

                            txCostInLoanToken = div(mul(txCost, ethPriceInLoanToken), expand(1n, 18));
                            netProfit = sub(netProfit, txCostInLoanToken);

                        } catch(e) {
                            continue;
                        }

                        if (netProfit <= 0n) continue;
                        
                        const profitBps = div(mul(netProfit, 10000n), loanAmount);
                        if (profitBps >= bn(BOT_CONFIG.MIN_PROFIT_BPS)) {
                            const profitPercentage = (Number(profitBps) / 100).toFixed(2);
                            const opportunityPath = `${loanTokenSymbol} -> ${intermediateTokenSymbol} -> ${loanTokenSymbol} via ${price1.dex} & ${price2.dex}`;
                            const decimals = TOKEN_DECIMALS.base[loanTokenSymbol];

                            console.log(`
################################################################################
MULTI-HOP OPPORTUNITY DETECTED
--------------------------------------------------------------------------------
  Path:           ${opportunityPath}
  Loan Amount:    ${formatUnits(loanAmount, decimals)} ${loanTokenSymbol}
--------------------------------------------------------------------------------
  Gross Profit:   ${formatUnits(grossProfit, decimals)} ${loanTokenSymbol}
  Aave Fee:       ${formatUnits(aaveFee, decimals)} ${loanTokenSymbol}
  Gas Cost:       ${formatUnits(txCostInLoanToken, decimals)} ${loanTokenSymbol}
--------------------------------------------------------------------------------
  Net Profit:     ${formatUnits(netProfit, decimals)} ${loanTokenSymbol} (~${profitPercentage}%)
################################################################################
`);
                            isTrading = true;
                            await executeArbitrage(loanTokenSymbol, loanAmount, swapPath, swapsV2, swapsV3, { path: opportunityPath, profit: formatUnits(netProfit, decimals) });
                            console.log(`[COOLDOWN] Waiting for ${BOT_CONFIG.POST_TRADE_COOLDOWN / 1000} seconds before resuming scanning...`);
                            await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.POST_TRADE_COOLDOWN));
                            isTrading = false;
                            return; // Exit after finding and executing one opportunity
                        }
                    }
                }
            }
        }
    }
}

async function calculateAndExecuteOpportunities(pairKey) {
    const prices = getPrices(pairKey);
    if (prices.length < 2) return;

    const bestBuy = prices.reduce((a, b) => a.price < b.price ? a : b);
    const bestSell = prices.reduce((a, b) => a.price > b.price ? a : b);

    if (bestSell.price <= bestBuy.price) return;

    const pool = pools[pairKey];
    const loanToken = pool.token1;
    const tradeToken = pool.token0;
    const loanTokenSymbol = pool.token1Symbol;
    const tradeTokenSymbol = pool.token0Symbol;

    const loanAmount = getBestLoanAmount(bestBuy, bestSell, loanTokenSymbol, tradeTokenSymbol, loanToken, tradeToken);

    if (loanAmount <= 0n) return;

    let amountOutFromBuy, amountOutFromSell;
    try {
        if (bestBuy.type === 'V2') {
            amountOutFromBuy = getV2AmountOut(loanAmount, bestBuy.reserve1, bestBuy.reserve0);
        } else {
            amountOutFromBuy = getV3AmountOut(loanAmount, bestBuy.sqrtPriceX96, bestBuy.liquidity, pool.token1, pool.token0, bestBuy.tickSpacing, pool.decimals1, pool.decimals0);
        }

        if (bestSell.type === 'V2') {
            amountOutFromSell = getV2AmountOut(amountOutFromBuy, bestSell.reserve0, bestSell.reserve1);
        } else {
            amountOutFromSell = getV3AmountOut(amountOutFromBuy, bestSell.sqrtPriceX96, bestSell.liquidity, pool.token0, pool.token1, bestSell.tickSpacing, pool.decimals0, pool.decimals1);
        }
    } catch (e) {
        return;
    }

    const grossProfit = sub(amountOutFromSell, loanAmount);
    const aaveFee = div(mul(loanAmount, bn(BOT_CONFIG.AAVE_FLASH_LOAN_FEE_BPS)), 10000n);
    let netProfit = sub(grossProfit, aaveFee);

    if (netProfit <= 0n) return;

    const swapPath = [];
    const swapsV2 = [];
    const swapsV3 = [];

    if (bestBuy.type === 'V2') {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
        const dexConfig = DEX_CONFIG.base[bestBuy.dex];
        const swapData = AbiCoder.defaultAbiCoder().encode(['address[]','bool[]','address'], [[loanToken, tradeToken], [pool.dexes[bestBuy.dex].stable], dexConfig.factory]);
        swapsV2.push({ router: dexConfig.router, path: [loanToken, tradeToken], amountOutMin: 0, dexType: V2_DEX_TYPES[bestBuy.dex], data: swapData });
    } else {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V3, index: swapsV3.length });
        swapsV3.push({ router: DEX_CONFIG.base[bestBuy.dex].router, pool: pools[pairKey].dexes[bestBuy.dex].fees[bestBuy.fee].address, tokenIn: loanToken, tokenOut: tradeToken, amountOutMin: 0, dexType: V3_DEX_TYPES[bestBuy.dex] });
    }

    if (bestSell.type === 'V2') {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
        const dexConfig = DEX_CONFIG.base[bestSell.dex];
        const swapData = AbiCoder.defaultAbiCoder().encode(['address[]','bool[]','address'], [[tradeToken, loanToken], [pool.dexes[bestSell.dex].stable], dexConfig.factory]);
        swapsV2.push({ router: dexConfig.router, path: [tradeToken, loanToken], amountOutMin: 0, dexType: V2_DEX_TYPES[bestSell.dex], data: swapData });
    } else {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V3, index: swapsV3.length });
        swapsV3.push({ router: DEX_CONFIG.base[bestSell.dex].router, pool: pools[pairKey].dexes[bestSell.dex].fees[bestSell.fee].address, tokenIn: tradeToken, tokenOut: loanToken, amountOutMin: 0, dexType: V3_DEX_TYPES[bestSell.dex] });
    }

    let txCostInLoanToken = 0n;
    try {
        const arbitrageContract = getArbitrageContract();
        const provider = getExecutionProvider();
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        if (!gasPrice || gasPrice === 0n) return;

        const estimatedGas = await arbitrageContract.executeArbitrage.estimateGas(loanToken, loanAmount, swapPath, swapsV3, swapsV2);
        const gasLimit = div(mul(estimatedGas, 120n), 100n);
        const txCost = mul(gasPrice, gasLimit);
        
        const ethPriceInLoanToken = getEthPriceInToken(loanTokenSymbol);
        if (ethPriceInLoanToken <= 0n) return;

        txCostInLoanToken = div(mul(txCost, ethPriceInLoanToken), expand(1n, 18));
        netProfit = sub(netProfit, txCostInLoanToken);

    } catch (e) {
        return;
    }

    if (netProfit <= 0n) return;

    const profitBps = div(mul(netProfit, 10000n), loanAmount);

    if (profitBps >= bn(BOT_CONFIG.MIN_PROFIT_BPS)) {
        const profitPercentage = (Number(profitBps) / 100).toFixed(2);
        const opportunityPath = `${bestBuy.dex} -> ${bestSell.dex}`;
        const decimals = TOKEN_DECIMALS.base[loanTokenSymbol];

        console.log(`
################################################################################
OPPORTUNITY DETECTED on ${pairKey}
--------------------------------------------------------------------------------
  Path:           ${opportunityPath}
  Loan Amount:    ${formatUnits(loanAmount, decimals)} ${loanTokenSymbol}
--------------------------------------------------------------------------------
  Gross Profit:   ${formatUnits(grossProfit, decimals)} ${loanTokenSymbol}
  Aave Fee:       ${formatUnits(aaveFee, decimals)} ${loanTokenSymbol}
  Gas Cost:       ${formatUnits(txCostInLoanToken, decimals)} ${loanTokenSymbol}
--------------------------------------------------------------------------------
  Net Profit:     ${formatUnits(netProfit, decimals)} ${loanTokenSymbol} (~${profitPercentage}%)
################################################################################
`);

        isTrading = true;
        await executeArbitrage(loanTokenSymbol, loanAmount, swapPath, swapsV2, swapsV3, { path: opportunityPath, profit: formatUnits(netProfit, decimals) });
        console.log(`[COOLDOWN] Waiting for ${BOT_CONFIG.POST_TRADE_COOLDOWN / 1000} seconds before resuming scanning...`);
        await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.POST_TRADE_COOLDOWN));
        isTrading = false;
    }
}

async function handleSwap(log) {
    if (isTrading) return;
    const poolAddress = getAddress(log.address);

    for (const pairKey of Object.keys(pools)) {
        const pool = pools[pairKey];
        let updated = false;

        for (const dex of Object.keys(pool.dexes)) {
            const dexData = pool.dexes[dex];
            if (dexData.type === 'V2' && getAddress(dexData.address) === poolAddress) {
                updateV2Pool(pairKey, dex, log);
                updated = true;
                break; // Found the V2 pool, no need to check other DEXs for this pair
            } else if (dexData.type === 'V3') {
                for (const fee in dexData.fees) {
                    if (getAddress(dexData.fees[fee].address) === poolAddress) {
                        updateV3Pool(pairKey, dex, fee, log);
                        updated = true;
                        break; // Found the V3 fee tier, no need to check other fees for this DEX
                    }
                }
            }
            if (updated) break; // Found the DEX, no need to check other DEXs for this pair
        }

        if (updated) {
            await calculateAndExecuteOpportunities(pairKey);
            break; // Found the pair, no need to check other pairs
        } 
    }
}

function listenToEvents() {
    const provider = getScanningProvider();

    console.log("Starting hybrid event detection...");

    provider.on({ topics: [[SWAP_EVENT_TOPIC_V2, SWAP_EVENT_TOPIC_V3]] }, (log) => {
        if (isScanning || isTrading) return;
        handleSwap(log).catch(err => {
            console.error(`[FAST PATH] Error processing swap event:`, err);
        });
    });

    provider.on('block', async (blockNumber) => {
        if (isTrading) return;
        const startTime = Date.now();
        try {
            isScanning = true;
            console.log(`
================================================================================
[RECONCILIATION] Scanning block ${blockNumber}...
================================================================================`);
            
            await reconcilePools();

            console.log('\n[RECONCILIATION] Checking for single-pair opportunities...');
            await findAndExecuteOpportunity(null, false);

            console.log('\n[RECONCILIATION] Checking for multi-hop opportunities...');
            for (const loanTokenSymbol of Object.keys(LOAN_TOKENS)) {
                await findAndExecuteOpportunity(loanTokenSymbol, true);
            }
            console.log('[RECONCILIATION] Finished checking for multi-hop opportunities.');

        } catch (err) {
            console.error(`[RECONCILIATION] Error processing block ${blockNumber}:`, err);
        } finally {
            isScanning = false;
            const endTime = Date.now();
            console.log(`
[RECONCILIATION] Finished processing block ${blockNumber}. Time taken: ${endTime - startTime}ms`);
            console.log(`================================================================================`);
        }
    });
}

module.exports = { listenToEvents };