const { ethers, formatUnits, AbiCoder } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const { pools } = require('../core/poolState');
const { bn, div, mul, sub } = require('../utils/bigints');
const { ABIS, TOKEN_DECIMALS, BOT_CONFIG, DEX_CONFIG, SWAP_STEP_TYPES, V2_DEX_TYPES, V3_DEX_TYPES } = require('../config');
const { getExecutionProvider } = require('../core/provider.js');
const { broadcast } = require('../core/listeners');
const { getArbitrageContract } = require('../core/wallet');
const { getAmountOut: getV2AmountOut } = require('../core/v2.js');
const { getAmountOut: getV3AmountOut } = require('../core/v3.js');

const TRADE_HISTORY_FILE = path.join(__dirname, '..', 'trade_history.json');

async function recordTrade(tradeData) {
    let history = [];
    try {
        const data = await fs.readFile(TRADE_HISTORY_FILE, 'utf8');
        history = JSON.parse(data);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error("Error reading trade history:", error);
            return;
        }
    }
    history.unshift(tradeData);
    if (history.length > 100) {
        history.pop();
    }
    try {
        await fs.writeFile(TRADE_HISTORY_FILE, JSON.stringify(history, null, 2));
        broadcast({ type: 'trade', data: tradeData });
        console.log("Successfully recorded and broadcasted trade.");
    } catch (error) {
        console.error("Error writing trade history:", error);
    }
}

async function executeArbitrage(buyDex, sellDex, pairKey) {
    const pool = pools[pairKey];
    const loanToken = pool.token1;
    const tradeToken = pool.token0;
    const loanTokenSymbol = pool.token1Symbol;

    let loanAmount;
    const loanPercentage = bn(BOT_CONFIG.LOAN_PERCENTAGE);

    if (buyDex.type === 'V2') {
        loanAmount = div(mul(buyDex.reserve1, loanPercentage), 100n);
    } else { // V3
        loanAmount = div(mul(buyDex.liquidity, loanPercentage), 100n);
    }

    if (loanAmount <= 0n) {
        return;
    }

    let amountOutFromBuy;
    let amountOutFromSell;

    try {
        if (buyDex.type === 'V2') {
            const buyPool = pools[pairKey].dexes[buyDex.dex];
            amountOutFromBuy = getV2AmountOut(loanAmount, buyPool.reserve1, buyPool.reserve0);
        } else { // V3
            const buyPool = pools[pairKey].dexes[buyDex.dex].fees[buyDex.fee];
            amountOutFromBuy = getV3AmountOut(loanAmount, buyPool.sqrtPriceX96, buyPool.liquidity, pool.token1, pool.token0, pool.decimals1, pool.decimals0);
        }

        if (amountOutFromBuy <= 0n) {
            return;
        }

        if (sellDex.type === 'V2') {
            const sellPool = pools[pairKey].dexes[sellDex.dex];
            amountOutFromSell = getV2AmountOut(amountOutFromBuy, sellPool.reserve0, sellPool.reserve1);
        } else { // V3
            const sellPool = pools[pairKey].dexes[sellDex.dex].fees[sellDex.fee];
            amountOutFromSell = getV3AmountOut(amountOutFromBuy, sellPool.sqrtPriceX96, sellPool.liquidity, pool.token0, pool.token1, pool.decimals0, pool.decimals1);
        }

        if (amountOutFromSell <= 0n) {
            return;
        }
    } catch (e) {
        console.error(`Could not calculate trade outcome locally for ${pairKey}:`, e.message, e.stack);
        return;
    }

    const netProfit = sub(amountOutFromSell, loanAmount);
    const minProfit = ethers.parseUnits(BOT_CONFIG.MIN_PROFIT_THRESHOLD_ETH, TOKEN_DECIMALS.base[loanTokenSymbol]);

    if (netProfit <= minProfit) {
        return;
    }

    const swapPath = [];
    const swapsV3 = [];
    const swapsV2 = [];

    // BUY STEP
    if (buyDex.type === 'V2') {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
        const dexConfig = DEX_CONFIG.base[buyDex.dex];
        let swapData = '0x';
        if (V2_DEX_TYPES[buyDex.dex] === V2_DEX_TYPES.AerodromeV2) {
            const path = [loanToken, tradeToken];
            const stable = [pool.dexes[buyDex.dex].stable];
            const factory = dexConfig.factory;
            swapData = AbiCoder.defaultAbiCoder().encode(
                ['address[]', 'bool[]', 'address'],
                [path, stable, factory]
            );
        }
        swapsV2.push({
            router: dexConfig.router,
            path: [loanToken, tradeToken],
            amountOutMin: 0,
            dexType: V2_DEX_TYPES[buyDex.dex],
            data: swapData
        });
    } else { // V3
        swapPath.push({ stepType: SWAP_STEP_TYPES.V3, index: swapsV3.length });
        swapsV3.push({
            router: DEX_CONFIG.base[buyDex.dex].router,
            pool: pools[pairKey].dexes[buyDex.dex].fees[buyDex.fee].address,
            tokenIn: loanToken,
            tokenOut: tradeToken,
            amountOutMin: 0,
            dexType: V3_DEX_TYPES[buyDex.dex]
        });
    }

    // SELL STEP
    if (sellDex.type === 'V2') {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
        const dexConfig = DEX_CONFIG.base[sellDex.dex];
        let swapData = '0x';
        if (V2_DEX_TYPES[sellDex.dex] === V2_DEX_TYPES.AerodromeV2) {
            const path = [tradeToken, loanToken];
            const stable = [pool.dexes[sellDex.dex].stable];
            const factory = dexConfig.factory;
            swapData = AbiCoder.defaultAbiCoder().encode(
                ['address[]', 'bool[]', 'address'],
                [path, stable, factory]
            );
        }
        swapsV2.push({
            router: dexConfig.router,
            path: [tradeToken, loanToken],
            amountOutMin: 0,
            dexType: V2_DEX_TYPES[sellDex.dex],
            data: swapData
        });
    } else { // V3
        swapPath.push({ stepType: SWAP_STEP_TYPES.V3, index: swapsV3.length });
        swapsV3.push({
            router: DEX_CONFIG.base[sellDex.dex].router,
            pool: pools[pairKey].dexes[sellDex.dex].fees[sellDex.fee].address,
            tokenIn: tradeToken,
            tokenOut: loanToken,
            amountOutMin: 0,
            dexType: V3_DEX_TYPES[sellDex.dex]
        });
    }

    if (BOT_CONFIG.DRY_RUN) {
        const profitString = formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol]);
        console.log(`\nOPPORTUNITY FOUND (DRY RUN):`);
        console.log(`- Loan: ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}`);
        console.log(`- Path: ${buyDex.dex} -> ${sellDex.dex}`);
        console.log(`- Est. Profit: ${profitString} ${loanTokenSymbol}\n`);

        broadcast({
            type: 'opportunity',
            data: {
                pair: pairKey,
                buyDex: buyDex.dex,
                sellDex: sellDex.dex,
                profit: profitString,
                token: loanTokenSymbol
            }
        });
        return;
    }
    let receipt;
    try {
        const arbitrageContract = getArbitrageContract();
        const provider = getExecutionProvider();
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        if (!gasPrice || gasPrice === 0n) {
            console.log(`DISCARDED: Could not retrieve gas price.`);
            return;
        }

        const estimatedGas = await arbitrageContract.executeArbitrage.estimateGas(loanToken, loanAmount, swapPath, swapsV3, swapsV2);
        const gasLimit = div(mul(estimatedGas, 120n), 100n);
        const txCost = mul(gasPrice, gasLimit);

        if (sub(netProfit, txCost) <= 0n) {
            console.log(`DISCARDED: Profit of ${formatUnits(netProfit, 18)} is less than estimated gas cost of ${formatUnits(txCost, 18)}.`);
            return;
        }
        console.log(`\n>>> EXECUTING TRADE on ${pairKey} for an est. profit of ${formatUnits(sub(netProfit, txCost), TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}...`);

        const tx = await arbitrageContract.executeArbitrage(loanToken, loanAmount, swapPath, swapsV3, swapsV2, { gasLimit: Number(gasLimit) });
        receipt = await tx.wait();

        const profitString = formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol]);

        console.log(`\nTRADE CONFIRMED:`);
        console.log(`- Tx Hash: ${receipt.transactionHash}`);
        console.log(`- Status: ${receipt.status === 1 ? 'Confirmed' : 'Reverted'}`);
        console.log(`- Profit: ${profitString} ${loanTokenSymbol}\n`);

        await recordTrade({
            timestamp: new Date().toISOString(),
            pair: pairKey,
            buyDex: buyDex.dex,
            sellDex: sellDex.dex,
            loanAmount: formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol]),
            profit: profitString,
            token: loanTokenSymbol,
            txHash: receipt.transactionHash,
            status: receipt.status === 1 ? 'Success' : 'Fail'
        });

    } catch (error) {
        console.error("\nTRADE FAILED. Full error:", error);
        const errorMessage = error.reason || (error.error ? error.error.message : (receipt ? "Transaction Reverted" : "Unknown error"));
        broadcast({
            type: 'error',
            data: {
                message: `Trade failed for ${pairKey}: ${errorMessage}`
            }
        });
        if (receipt) {
            await recordTrade({
                timestamp: new Date().toISOString(),
                pair: pairKey,
                buyDex: buyDex.dex,
                sellDex: sellDex.dex,
                loanAmount: formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol]),
                profit: '0',
                token: loanTokenSymbol,
                txHash: receipt.transactionHash,
                status: 'Fail'
            });
        }
    } finally {
        console.log(`--- COOLDOWN: Pausing for ${BOT_CONFIG.RECONCILIATION_TIMEOUT / 1000} seconds before next scan. ---`);
        await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.RECONCILIATION_TIMEOUT));
    }
}

module.exports = { executeArbitrage };
