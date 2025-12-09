const { reconcilePools, pools } = require('./poolState');
const { getDirtyPools, clearDirtyPools } = require('./dirtyPools');
const { findAndExecuteOpportunity, calculateAndExecuteOpportunities } = require('../services/opportunity');
const { BOT_CONFIG, LOAN_TOKENS } = require('../config');
const { getAddress } = require('ethers');

let isFastLoopRunning = false;
let isSlowLoopRunning = false;

async function fastLoop() {
    if (isFastLoopRunning || isSlowLoopRunning) return;

    const dirtyPoolsList = getDirtyPools();
    if (dirtyPoolsList.length === 0) return;

    isFastLoopRunning = true;
    try {
        clearDirtyPools();

        const dirtyPairKeys = new Set();

        for (const poolAddress of dirtyPoolsList) {
            for (const pairKey of Object.keys(pools)) {
                const pool = pools[pairKey];
                if (!pool || !pool.dexes) continue;

                for (const dex of Object.keys(pool.dexes)) {
                    const dexData = pool.dexes[dex];
                    if (dexData.type === 'V2') {
                        if (dexData.address && getAddress(dexData.address) === poolAddress) {
                            dirtyPairKeys.add(pairKey);
                        }
                    } else if (dexData.type === 'V3') {
                        for (const fee in dexData.fees) {
                            if (dexData.fees[fee].address && getAddress(dexData.fees[fee].address) === poolAddress) {
                                dirtyPairKeys.add(pairKey);
                            }
                        }
                    }
                }
            }
        }

        if (dirtyPairKeys.size > 0) {
            console.log(`[FAST_LOOP] Swap detected! Checking ${dirtyPairKeys.size} dirty pair(s).`);
            for (const pairKey of dirtyPairKeys) {
                await calculateAndExecuteOpportunities(pairKey);
            }
        }

    } catch (error) {
        console.error('[FAST_LOOP] Error:', error);
    } finally {
        isFastLoopRunning = false;
    }
}

async function slowLoop() {
    if (isSlowLoopRunning) return;
    isSlowLoopRunning = true;

    const startTime = Date.now();
    console.log(`\n================================================================================\n[SLOW_LOOP] Starting reconciliation...`);
    console.log(`================================================================================`);

    try {
        await reconcilePools();

        console.log('\n[SLOW_LOOP] Checking for multi-hop opportunities...');
        for (const loanTokenSymbol of Object.keys(LOAN_TOKENS)) {
            await findAndExecuteOpportunity(loanTokenSymbol, true);
        }
        console.log('[SLOW_LOOP] Finished checking for multi-hop opportunities.');

    } catch (error) {
        console.error('[SLOW_LOOP] Error:', error);
    } finally {
        isSlowLoopRunning = false;
        const endTime = Date.now();
        console.log(`\n[SLOW_LOOP] Finished reconciliation. Time taken: ${endTime - startTime}ms`);
        console.log(`================================================================================`);
    }
}

function startLoops() {
    console.log("Starting loops...");

    // Start the fast loop
    setInterval(fastLoop, BOT_CONFIG.FAST_LOOP_INTERVAL);

    // Start the slow loop. Run it once on startup, then set the interval.
    slowLoop(); 
    setInterval(slowLoop, BOT_CONFIG.SLOW_LOOP_INTERVAL);
}

module.exports = { startLoops };