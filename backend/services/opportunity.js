const { ethers, getAddress, keccak256, toUtf8Bytes, formatUnits } = require('ethers');
const { pools, updateV2Pool, updateV3Pool } = require('../core/poolState');
const { bn, expand, div, mul, sub } = require('../utils/bigints');
const { getPriceFromV2 } = require('../core/v2');
const { getPriceFromV3 } = require('../core/v3');
const { executeArbitrage } = require('./executor');
const { BOT_CONFIG, LOAN_TOKENS, TOKEN_DECIMALS } = require('../config');
const { getScanningProvider } = require('../core/provider.js');
const { getAmountOut: getV2AmountOut } = require('../core/v2.js');
const { getAmountOut: getV3AmountOut } = require('../core/v3.js');

const SWAP_EVENT_TOPIC_V2 = keccak256(toUtf8Bytes("Sync(uint112,uint112)"));
const SWAP_EVENT_TOPIC_V3 = keccak256(toUtf8Bytes("Swap(address,address,int256,int256,uint160,uint128,int24)"));

let isScanning = false;

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
            const adjustedPrice = div(mul(price, expand(1n, pool.decimals0)), expand(1n, pool.decimals1));
            prices.push({
                dex,
                price: adjustedPrice,
                type: 'V2',
                reserve0: dexData.reserve0,
                reserve1: dexData.reserve1
            });
        } else if (dexData.type === 'V3') {
            for (const fee in dexData.fees) {
                const feeData = dexData.fees[fee];
                if (!feeData.sqrtPriceX96 || !feeData.liquidity) continue;
                const price = getPriceFromV3(feeData.sqrtPriceX96);
                if (price === 0n) continue;
                const adjustedPrice = div(mul(price, expand(1n, pool.decimals0)), expand(1n, pool.decimals1));
                prices.push({
                    dex,
                    fee,
                    price: adjustedPrice,
                    type: 'V3',
                    liquidity: feeData.liquidity,
                    sqrtPriceX96: feeData.sqrtPriceX96
                });
            }
        }
    }
    return prices;
}

async function findBestMultiHopOpportunity(loanTokenSymbol) {
    const loanTokenAddress = LOAN_TOKENS[loanTokenSymbol];
    console.log(`\n[MULTI-HOP] Searching for ${loanTokenSymbol} arbitrage routes...`);

    for (const token1Symbol in pools) {
        if (!token1Symbol.startsWith(loanTokenSymbol) && !token1Symbol.endsWith(loanTokenSymbol)) continue;

        const pair1Key = token1Symbol;
        const prices1 = getPrices(pair1Key);
        if (prices1.length === 0) continue;

        const otherTokenSymbol = token1Symbol.replace(loanTokenSymbol, '').replace('-', '');

        for (const token2Symbol in pools) {
            if (token2Symbol.startsWith(otherTokenSymbol) && !token2Symbol.endsWith(loanTokenSymbol)) {
                const pair2Key = token2Symbol;
                const prices2 = getPrices(pair2Key);
                if (prices2.length === 0) continue;

                const finalTokenSymbol = token2Symbol.replace(otherTokenSymbol, '').replace('-', '');
                if (finalTokenSymbol !== loanTokenSymbol) continue; // We must end with the loan token

                for (const price1 of prices1) {
                    for (const price2 of prices2) {
                        // This is a placeholder for a more complex multi-hop profit calculation
                        // For now, we just log the path
                        console.log(`[MULTI-HOP PATH] ${loanTokenSymbol} -> ${otherTokenSymbol} -> ${finalTokenSymbol} via ${price1.dex} and ${price2.dex}`)
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

    const profit = sub(bestSell.price, bestBuy.price);

    if (profit > 0n) {
        const pool = pools[pairKey];
        const loanToken = pool.token1;
        const tradeToken = pool.token0;
        const loanTokenSymbol = pool.token1Symbol;
        const tradeTokenSymbol = pool.token0Symbol;

        let loanAmount;
        const loanPercentage = bn(BOT_CONFIG.LOAN_PERCENTAGE);

        if (bestBuy.type === 'V2') {
            loanAmount = div(mul(bestBuy.reserve1, loanPercentage), 100n);
        } else { // V3
            const Q96 = (1n << 96n);
            const reserve1_v3 = div(mul(bestBuy.liquidity, bestBuy.sqrtPriceX96), Q96);
            loanAmount = div(mul(reserve1_v3, loanPercentage), 100n);
        }

        if (loanAmount <= 0n) {
            return;
        }

        let amountOutFromBuy;
        let amountOutFromSell;

        try {
            if (bestBuy.type === 'V2') {
                const buyPool = pools[pairKey].dexes[bestBuy.dex];
                amountOutFromBuy = getV2AmountOut(loanAmount, buyPool.reserve1, buyPool.reserve0);
            } else { // V3
                const buyPool = pools[pairKey].dexes[bestBuy.dex].fees[bestBuy.fee];
                amountOutFromBuy = getV3AmountOut(loanAmount, buyPool.sqrtPriceX96, buyPool.liquidity, pool.token1, pool.token0, pool.decimals1, pool.decimals0);
            }

            if (amountOutFromBuy <= 0n) {
                return;
            }

            if (bestSell.type === 'V2') {
                const sellPool = pools[pairKey].dexes[bestSell.dex];
                amountOutFromSell = getV2AmountOut(amountOutFromBuy, sellPool.reserve0, sellPool.reserve1);
            } else { // V3
                const sellPool = pools[pairKey].dexes[bestSell.dex].fees[bestSell.fee];
                amountOutFromSell = getV3AmountOut(amountOutFromBuy, sellPool.sqrtPriceX96, sellPool.liquidity, pool.token0, pool.token1, pool.decimals0, pool.decimals1);
            }

            if (amountOutFromSell <= 0n) {
                return;
            }
        } catch (e) {
            return;
        }

        const netProfit = sub(amountOutFromSell, loanAmount);
        const minProfit = ethers.parseUnits(BOT_CONFIG.MIN_PROFIT_THRESHOLD_ETH, TOKEN_DECIMALS.base[loanTokenSymbol]);

        if (netProfit > minProfit) {
            const profitBps = div(mul(netProfit, 10000n), loanAmount);
            const profitPercentage = (Number(profitBps) / 100).toFixed(2);

            console.log(`\n################################################################################\nOPPORTUNITY DETECTED on ${pairKey}\n--------------------------------------------------------------------------------\nBuy on: ${bestBuy.dex} (${bestBuy.type}${bestBuy.fee ? ` @ ${bestBuy.fee} fee` : ''})\nSell on: ${bestSell.dex} (${bestSell.type}${bestSell.fee ? ` @ ${bestSell.fee} fee` : ''})\nEst. Profit: ${formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} (~${profitPercentage}%)\n--------------------------------------------------------------------------------\n`);
            console.log('>>> Pausing for 20 second to avoid rate-limiting before execution...');
            await new Promise(resolve => setTimeout(resolve, 20000));
            await executeArbitrage(bestBuy, bestSell, pairKey);
        } else {
            // console.log(`- ${pairKey}: Discarded (profit of ${formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} is too low)`);
        }
    }
}

async function handleSwap(log) {
    const poolAddress = getAddress(log.address);

    for (const pairKey of Object.keys(pools)) {
        const pool = pools[pairKey];
        let updated = false;

        for (const dex of Object.keys(pool.dexes)) {
            const dexData = pool.dexes[dex];
            if (dexData.type === 'V2' && getAddress(dexData.address) === poolAddress) {
                await updateV2Pool(pairKey, dex, log);
                updated = true;
                break;
            } else if (dexData.type === 'V3') {
                for (const fee in dexData.fees) {
                    if (getAddress(dexData.fees[fee].address) === poolAddress) {
                        await updateV3Pool(pairKey, dex, fee, log);
                        updated = true;
                        break;
                    }
                }
            }
            if (updated) break;
        }

        if (updated) {
            await calculateAndExecuteOpportunities(pairKey);
            break;
        }
    }
}

async function reconcilePools() {
    const promises = [];
    console.log("\nReconciling all pools (V2 & V3)...");
    for (const pairKey of Object.keys(pools)) {
        const pool = pools[pairKey];
        for (const dex of Object.keys(pool.dexes)) {
            const dexData = pool.dexes[dex];
            if (dexData.type === 'V2') {
                promises.push(updateV2Pool(pairKey, dex));
            } else if (dexData.type === 'V3') {
                for (const fee in dexData.fees) {
                    promises.push(updateV3Pool(pairKey, dex, fee));
                }
            }
        }
    }
    
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Reconciliation timeout')), BOT_CONFIG.RECONCILIATION_TIMEOUT)
    );

    try {
        await Promise.race([Promise.all(promises), timeoutPromise]);
        console.log("Reconciliation complete.");
    } catch (error) {
        console.error("Reconciliation failed or timed out:", error.message);
    }
}

function listenToEvents() {
    const provider = getScanningProvider();

    console.log("Starting hybrid event detection...");

    provider.on({ topics: [[SWAP_EVENT_TOPIC_V2, SWAP_EVENT_TOPIC_V3]] }, (log) => {
        if (isScanning) return;
        handleSwap(log).catch(err => {
            console.error(`[FAST PATH] Error processing swap event:`, err);
        });
    });

    provider.on('block', async (blockNumber) => {
        try {
            isScanning = true;
            console.log(`\n================================================================================\n[RECONCILIATION] Scanning block ${blockNumber}...\n================================================================================`);
            
            await reconcilePools();

            for (const pairKey of Object.keys(pools)) {
                await calculateAndExecuteOpportunities(pairKey);
            }

            // Multi-hop search
            for (const loanTokenSymbol of Object.keys(LOAN_TOKENS)) {
                await findBestMultiHopOpportunity(loanTokenSymbol);
            }

        } catch (err) {
            console.error(`[RECONCILIATION] Error processing block ${blockNumber}:`, err);
        } finally {
            isScanning = false;
        }
    });
}

module.exports = { listenToEvents };
