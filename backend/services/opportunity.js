const { getAddress, keccak256, toUtf8Bytes, formatUnits } = require('ethers');
const { pools, updateV2Pool, updateV3Pool } = require('../core/poolState');
const { bn, expand, div, mul, sub } = require('../utils/bigints');
const { getPriceFromV2 } = require('../core/v2');
const { getPriceFromV3 } = require('../core/v3');
const { executeArbitrage } = require('./executor');
const { BOT_CONFIG } = require('../config');
const { getScanningProvider } = require('../core/provider.js');

const SWAP_EVENT_TOPIC_V2 = keccak256(toUtf8Bytes("Sync(uint112,uint112)"));
const SWAP_EVENT_TOPIC_V3 = keccak256(toUtf8Bytes("Swap(address,address,int256,int256,uint160,uint128,int24)"));

let isScanning = false;

async function calculateAndExecuteOpportunities(pairKey) {
    const pool = pools[pairKey];
    if (!pool || !pool.dexes) return;

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
                    liquidity: feeData.liquidity
                });
            }
        }
    }

    if (prices.length < 2) return;

    const bestBuy = prices.reduce((a, b) => a.price < b.price ? a : b);
    const bestSell = prices.reduce((a, b) => a.price > b.price ? a : b);

    const profit = sub(bestSell.price, bestBuy.price);

    if (profit > 0n) {
        const requiredProfitBps = bn(BOT_CONFIG.MIN_PROFIT_BPS);
        const profitBps = div(mul(profit, 10000n), bestBuy.price);

        if (profitBps > requiredProfitBps) {
            const profitPercentage = (Number(profitBps) / 100).toFixed(2);
            console.log(`\n################################################################################\nOPPORTUNITY DETECTED on ${pairKey}\n--------------------------------------------------------------------------------\nBuy on: ${bestBuy.dex} (${bestBuy.type}${bestBuy.fee ? ` @ ${bestBuy.fee} fee` : ''})\nSell on: ${bestSell.dex} (${bestSell.type}${bestSell.fee ? ` @ ${bestSell.fee} fee` : ''})\nEst. Profit: ${formatUnits(profitBps, 2)} bps (~${profitPercentage}%)\n--------------------------------------------------------------------------------\n`);
            console.log('>>> Pausing for 1 second to avoid rate-limiting before execution...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await executeArbitrage(bestBuy, bestSell, pairKey);
        } else {
            // console.log(`- ${pairKey}: Discarded (profit of ${formatUnits(profitBps, 2)} bps is too low)`);
        }
    } else {
        // console.log(`- ${pairKey}: No arbitrage opportunity found`);
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
                // console.log(`[FAST PATH] V2 Sync detected on ${dex} for ${pairKey}.`);
                await updateV2Pool(pairKey, dex, log);
                updated = true;
                break;
            } else if (dexData.type === 'V3') {
                for (const fee in dexData.fees) {
                    if (getAddress(dexData.fees[fee].address) === poolAddress) {
                        // console.log(`[FAST PATH] V3 Swap detected on ${dex} (fee: ${fee}) for ${pairKey}.`);
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
    console.log("Reconciling V2 pools...");
    for (const pairKey of Object.keys(pools)) {
        const pool = pools[pairKey];
        for (const dex of Object.keys(pool.dexes)) {
            const dexData = pool.dexes[dex];
            if (dexData.type === 'V2') {
                console.log(`- Reconciling ${pairKey} on ${dex}`);
                promises.push(updateV2Pool(pairKey, dex));
            } else if (dexData.type === 'V3') {
                console.log("Reconciling V3 pools...");
                for (const fee in dexData.fees) {
                    console.log(`- Reconciling ${pairKey} on ${dex} (fee: ${fee})`);
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

    // 1. Fast Path: Real-time event listener
    provider.on({ topics: [[SWAP_EVENT_TOPIC_V2, SWAP_EVENT_TOPIC_V3]] }, (log) => {
        if (isScanning) return; // Don't process if a full block scan is in progress
        handleSwap(log).catch(err => {
            console.error(`[FAST PATH] Error processing swap event:`, err);
        });
    });

    // 2. Reconciliation Path: Block-by-block scanner
    provider.on('block', async (blockNumber) => {
        try {
            isScanning = true;
            console.log(`\n================================================================================\n[RECONCILIATION] Scanning block ${blockNumber}...\n================================================================================`);
            
            // First, update all pools to the latest state
            await reconcilePools();

            // Then, analyze all pairs with the fresh data
            for (const pairKey of Object.keys(pools)) {
                await calculateAndExecuteOpportunities(pairKey);
            }
        } catch (err) {
            console.error(`[RECONCILIATION] Error processing block ${blockNumber}:`, err);
        } finally {
            isScanning = false;
        }
    });
}

module.exports = { listenToEvents };
