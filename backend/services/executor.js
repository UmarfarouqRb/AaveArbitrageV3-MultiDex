const { ethers, formatUnits, AbiCoder } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const { pools } = require('../core/poolState');
const { bn, div, mul, sub, expand } = require('../utils/bigints');
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
    const tradeTokenSymbol = pool.token0Symbol;

    let loanAmount;
    const loanPercentage = bn(BOT_CONFIG.LOAN_PERCENTAGE);

    if (buyDex.type === 'V2') {
        loanAmount = div(mul(buyDex.reserve1, loanPercentage), 100n);
    } else { // V3
        const Q96 = (1n << 96n);
        const reserve1_v3 = div(mul(buyDex.liquidity, buyDex.sqrtPriceX96), Q96);
        loanAmount = div(mul(reserve1_v3, loanPercentage), 100n);
    }

    if (loanAmount <= 0n) {
        console.log(`[${pairKey}] Discarded: Loan amount is zero or negative.`);
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
            console.log(`[${pairKey}] Discarded: Initial trade yields zero or negative.`);
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
            console.log(`[${pairKey}] Discarded: Second trade yields zero or negative.`);
            return;
        }
    } catch (e) {
        console.error(`Could not calculate trade outcome locally for ${pairKey}:`, e.message, e.stack);
        return;
    }

    const netProfit = sub(amountOutFromSell, loanAmount);
    const minProfit = ethers.parseUnits(BOT_CONFIG.MIN_PROFIT_THRESHOLD_ETH, TOKEN_DECIMALS.base[loanTokenSymbol]);

    if (netProfit <= minProfit) {
        console.log(`[${pairKey}] Discarded: Profit of ${formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} is below threshold.`);
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
        console.log(`
--------------------------------------------------------------------------------
[DRY RUN] Opportunity Found on ${pairKey}
--------------------------------------------------------------------------------
  - Loan: ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}
  - Path: ${buyDex.dex} -> ${sellDex.dex}
  - Steps:
    1. Flashloan ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} from Aave
    2. Swap ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} for ${formatUnits(amountOutFromBuy, TOKEN_DECIMALS.base[tradeTokenSymbol])} ${tradeTokenSymbol} on ${buyDex.dex}
    3. Swap ${formatUnits(amountOutFromBuy, TOKEN_DECIMALS.base[tradeTokenSymbol])} ${tradeTokenSymbol} for ${formatUnits(amountOutFromSell, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} on ${sellDex.dex}
    4. Repay ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol} to Aave
  - Gross Profit: ${profitString} ${loanTokenSymbol}
--------------------------------------------------------------------------------
`);

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
            console.log(`[${pairKey}] Discarded: Could not retrieve gas price.`);
            return;
        }

        const estimatedGas = await arbitrageContract.executeArbitrage.estimateGas(loanToken, loanAmount, swapPath, swapsV3, swapsV2);
        const gasLimit = div(mul(estimatedGas, 120n), 100n);
        const txCost = mul(gasPrice, gasLimit);

        const netProfitAfterGas = sub(netProfit, txCost);

        if (netProfitAfterGas <= 0n) {
            console.log(`[${pairKey}] Discarded: Profit of ${formatUnits(netProfit, 18)} is less than estimated gas cost of ${formatUnits(txCost, 18)}.`);
            return;
        }

        console.log(`
--------------------------------------------------------------------------------
>>> EXECUTING TRADE on ${pairKey}...
--------------------------------------------------------------------------------
  - Loan: ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}
  - Path: ${buyDex.dex} -> ${sellDex.dex}
  - Est. Gross Profit: ${formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}
  - Est. Tx Cost: ${formatUnits(txCost, 18)} ETH
  - Est. Net Profit: ${formatUnits(netProfitAfterGas, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}
--------------------------------------------------------------------------------
`);

        const tx = await arbitrageContract.executeArbitrage(loanToken, loanAmount, swapPath, swapsV3, swapsV2, { gasLimit: Number(gasLimit) });
        receipt = await tx.wait();

        const profitString = formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol]);

        if (receipt.status === 1) {
            console.log(`
--------------------------------------------------------------------------------
✅ TRADE CONFIRMED on ${pairKey}
--------------------------------------------------------------------------------
  - Tx Hash: ${receipt.transactionHash}
  - Gross Profit: ${profitString} ${loanTokenSymbol}
  - Gas Used: ${formatUnits(receipt.gasUsed, 0)}
  - Gas Price: ${formatUnits(receipt.effectiveGasPrice, 9)} Gwei
  - Tx Cost: ${formatUnits(mul(receipt.gasUsed, receipt.effectiveGasPrice), 18)} ETH
--------------------------------------------------------------------------------
`);
        } else {
            throw new Error('Transaction reverted on-chain');
        }

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
        console.error(`
--------------------------------------------------------------------------------
❌ TRADE FAILED on ${pairKey}
--------------------------------------------------------------------------------
`);
        if (receipt) {
            console.error(`  - Tx Hash: ${receipt.transactionHash}`);
            console.error(`  - Status: Reverted`);
            console.error(`  - Gas Used: ${formatUnits(receipt.gasUsed, 0)}`);
        }
        console.error(`  - Reason: ${error.reason || (error.error ? error.error.message : error.message)}`);
        console.error(`--------------------------------------------------------------------------------
`);

        broadcast({
            type: 'error',
            data: {
                message: `Trade failed for ${pairKey}: ${error.reason || (error.error ? error.error.message : error.message)}`
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
