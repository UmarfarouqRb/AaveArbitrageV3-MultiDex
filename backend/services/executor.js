const { ethers, formatUnits, AbiCoder } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const { pools } = require('../core/poolState');
const { bn, div, mul, sub } = require('../utils/bigints');
const { TOKEN_DECIMALS, BOT_CONFIG, DEX_ROUTERS, SWAP_STEP_TYPES, V2_DEX_TYPES, V3_DEX_TYPES, DEX_QUOTERS, V3_FEE_TIERS } = require('../config');
const IUniswapV2Router_ABI = require('../abis/IUniswapV2Router.json').abi;
const IAerodromeRouter_ABI = require('../abis/IAerodromeRouter.json').abi;
const IQuoterV2_ABI = require('../abis/IUniswapV3QuoterV2.json').abi;
const IUniswapV3Factory_ABI = require('../abis/IUniswapV3Factory.json').abi;
const { getProvider } = require('../core/provider.js');
const { broadcast } = require('../core/listeners');
const { wallet, arbitrageContract } = require('../core/wallet');

const TRADE_HISTORY_FILE = path.join(__dirname, '..', 'trade_history.json');

function sortTokens(a, b) {
    return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

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

async function getV2Quote(dex, tokenIn, tokenOut, amountIn) {
    const provider = getProvider();
    const routerAddress = DEX_ROUTERS.base[dex].router;

    if (V2_DEX_TYPES[dex] === V2_DEX_TYPES.AerodromeV2) {
        const router = new ethers.Contract(routerAddress, IAerodromeRouter_ABI, provider);
        const routes = [{
            from: tokenIn,
            to: tokenOut,
            stable: pools[`${tokenIn}-${tokenOut}`] ? pools[`${tokenIn}-${tokenOut}`].dexes[dex].stable : false,
            factory: DEX_ROUTERS.base[dex].factory
        }];
        const amountsOut = await router.getAmountsOut(amountIn, routes);
        return amountsOut[1];
    } else {
        const router = new ethers.Contract(routerAddress, IUniswapV2Router_ABI, provider);
        const amountsOut = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        return amountsOut[1];
    }
}

async function getV3Quote(dex, tokenIn, tokenOut, fee, amountIn) {
    const provider = getProvider();
    const quoterAddress = DEX_QUOTERS.base[dex];
    const factoryAddress = DEX_ROUTERS.base[dex].factory_v3;

    if (!V3_FEE_TIERS[dex].includes(fee)) {
        console.log(`Invalid fee tier for ${dex}: ${fee}`);
        return 0n;
    }

    const [token0, token1] = sortTokens(tokenIn, tokenOut);

    const factory = new ethers.Contract(factoryAddress, IUniswapV3Factory_ABI, provider);
    const poolAddress = await factory.getPool(token0, token1, fee);

    if (poolAddress === ethers.ZeroAddress) {
        console.log(`Pool doesn't exist for ${dex} with fee ${fee}`);
        return 0n;
    }

    const quoter = new ethers.Contract(quoterAddress, IQuoterV2_ABI, provider);

    let amountOut;
    try {
        const quote = await quoter.quoteExactInputSingle.staticCall({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            amountIn: amountIn,
            sqrtPriceLimitX96: 0
        });
        amountOut = quote.amountOut;
    } catch (err) {
        console.log(`Quote reverted for ${dex}: skipping this arbitrage`);
        return 0n;
    }

    if (!amountOut || amountOut === 0n) {
        console.log(`Empty quote (0x) for ${dex} -> No liquidity or revert`);
        return 0n;
    }

    return amountOut;
}

async function executeArbitrage(buyDex, sellDex, pairKey) {
    console.log(`EXECUTING: ${pairKey} | Buy on ${buyDex.dex} | Sell on ${sellDex.dex}`);

    const pool = pools[pairKey];
    const loanToken = pool.token1; 
    const tradeToken = pool.token0;
    const loanTokenSymbol = pool.token1Symbol;

    let loanAmount;
    const loanPercentage = bn(BOT_CONFIG.LOAN_PERCENTAGE);
    
    if (buyDex.type === 'V2') {
        loanAmount = div(mul(buyDex.reserve1, loanPercentage), 100n);
    } else { 
        loanAmount = div(mul(buyDex.liquidity, loanPercentage), 100n);
    }

    if (loanAmount <= 0n) {
        console.log("Discarded: Calculated loan amount is zero or negative.");
        return;
    }
    
    let amountOutFromBuy;
    let amountOutFromSell;

    try {
        if (buyDex.type === 'V2') {
            amountOutFromBuy = await getV2Quote(buyDex.dex, loanToken, tradeToken, loanAmount);
        } else { // V3
            amountOutFromBuy = await getV3Quote(buyDex.dex, loanToken, tradeToken, buyDex.fee, loanAmount);
        }

        if (amountOutFromBuy === 0n) {
            console.log("Could not get buy quote, aborting arbitrage.");
            return;
        }

        if (sellDex.type === 'V2') {
            amountOutFromSell = await getV2Quote(sellDex.dex, tradeToken, loanToken, amountOutFromBuy);
        } else { // V3
            amountOutFromSell = await getV3Quote(sellDex.dex, tradeToken, loanToken, sellDex.fee, amountOutFromBuy);
        }

        if (amountOutFromSell === 0n) {
            console.log("Could not get sell quote, aborting arbitrage.");
            return;
        }

    } catch (e) {
        console.error("Could not get accurate quotes, aborting arbitrage.", e.reason || e.message);
        return;
    }

    const netProfit = sub(amountOutFromSell, loanAmount);
    const minProfit = ethers.parseUnits(BOT_CONFIG.MIN_PROFIT_THRESHOLD_ETH, TOKEN_DECIMALS.base[loanTokenSymbol]);

    if (netProfit <= minProfit) {
        return;
    }

    // --- Construct Swap Data ---
    const swapPath = [];
    const swapsV3 = [];
    const swapsV2 = [];

    // BUY STEP
    if (buyDex.type === 'V2') {
        swapPath.push({ stepType: SWAP_STEP_TYPES.V2, index: swapsV2.length });
        const dexConfig = DEX_ROUTERS.base[buyDex.dex];
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
            router: DEX_ROUTERS.base[buyDex.dex].router,
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
        const dexConfig = DEX_ROUTERS.base[sellDex.dex];
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
            router: DEX_ROUTERS.base[sellDex.dex].router,
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

    try {
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
            console.log(`DISCARDED: Profit is less than estimated gas cost.`);
            return;
        }

        const tx = await arbitrageContract.executeArbitrage(loanToken, loanAmount, swapPath, swapsV3, swapsV2, { gasLimit: Number(gasLimit) });
        const receipt = await tx.wait();

        const profitString = formatUnits(netProfit, TOKEN_DECIMALS.base[loanTokenSymbol]);

        console.log(`\nTRADE SUCCESSFUL:`);
        console.log(`- Tx Hash: ${receipt.transactionHash}`);
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
            status: 'Success'
        });

    } catch (error) {
        const errorMessage = error.reason || (error.error ? error.error.message : "Unknown error");
        console.error(`\nTRADE FAILED:`, errorMessage);
        broadcast({
            type: 'error',
            data: {
                message: `Trade failed for ${pairKey}: ${errorMessage}`
            }
        });
    }
}


module.exports = { executeArbitrage };
