const { ethers, getAddress, AbiCoder, Interface } = require('ethers');
const { ARBITRAGE_PAIRS, TOKENS, TOKEN_DECIMALS, DEX_CONFIG } = require('../config');
const { bn } = require('../utils/bigints');
const IUniswapV3Pool_ABI = require('../abis/uniswapV3/pool.json');
const IPancakeV3Pool_ABI = require('../abis/pancakeV3/pool.json');
const IUniswapV2Factory_ABI = require('../abis/uniswapV2/factory.json');
const IUniswapV2Pair_ABI = require('../abis/uniswapV2/pair.json');
const ISushiV2Factory_ABI = require('../abis/sushiV2/factory.json');
const ISushiV2Pair_ABI = require('../abis/sushiV2/pair.json');
const IAerodromeFactory_ABI = require('../abis/aerodrome/factory.json');
const IAerodromePair_ABI = require('../abis/aerodrome/pair.json');
const { getScanningProvider, getMulticallContract } = require('./provider.js');

const pools = {};

async function initializePools() {
    console.log("Initializing pools for USDC and WETH pairs...");
    const provider = getScanningProvider();

    const uniquePairs = new Map();
    // ARBITRAGE_PAIRS is defined as loan tokens vs all other tokens.
    // This creates duplicates like [WETH, USDC] and [USDC, WETH]. We need to dedupe.
    for (const pair of ARBITRAGE_PAIRS) {
        // Sort by address to create a canonical representation of the pair
        const sortedPair = pair.sort((a, b) => getAddress(a).localeCompare(getAddress(b)));
        const pairKey = sortedPair.map(getAddress).join('-');
        if (!uniquePairs.has(pairKey)) {
            uniquePairs.set(pairKey, sortedPair);
        }
    }

    const pairsToProcess = Array.from(uniquePairs.values());

    for (const pair of pairsToProcess) {
        let [tokenA_address, tokenB_address] = pair;

        // This sorting is now redundant due to the canonical representation above, but harmless to keep
        if (getAddress(tokenA_address) > getAddress(tokenB_address)) {
            [tokenA_address, tokenB_address] = [tokenB_address, tokenA_address];
        }

        const tokenA_symbol = Object.keys(TOKENS.base).find(key => getAddress(TOKENS.base[key]) === getAddress(tokenA_address));
        const tokenB_symbol = Object.keys(TOKENS.base).find(key => getAddress(TOKENS.base[key]) === getAddress(tokenB_address));
        
        if (!tokenA_symbol || !tokenB_symbol) continue;

        const pairKey = `${tokenA_symbol}-${tokenB_symbol}`;
        
        pools[pairKey] = {
            token0: tokenA_address,
            token1: tokenB_address,
            token0Symbol: tokenA_symbol,
            token1Symbol: tokenB_symbol,
            decimals0: TOKEN_DECIMALS.base[tokenA_symbol],
            decimals1: TOKEN_DECIMALS.base[tokenB_symbol],
            dexes: {}
        };

        for (const dex in DEX_CONFIG.base) {
            const dexConfig = DEX_CONFIG.base[dex];
            if (dexConfig.type === 'V2') {
                let factoryAbi;
                if (dex === 'AerodromeV2') {
                    factoryAbi = IAerodromeFactory_ABI;
                } else if (dex === 'SushiswapV2') {
                    factoryAbi = ISushiV2Factory_ABI;
                } else {
                    factoryAbi = IUniswapV2Factory_ABI;
                }
                const factoryContract = new ethers.Contract(dexConfig.factory, factoryAbi, provider);

                if (dex === 'AerodromeV2') {
                    try {
                        let isStable = true;
                        let pairAddress = await factoryContract.getPair(tokenA_address, tokenB_address, isStable);

                        if (!pairAddress || getAddress(pairAddress) === ethers.ZeroAddress) {
                            isStable = false;
                            pairAddress = await factoryContract.getPair(tokenA_address, tokenB_address, isStable);
                        }

                        if (pairAddress && getAddress(pairAddress) !== ethers.ZeroAddress) {
                            const code = await provider.getCode(pairAddress);
                            if (code !== '0x') {
                                pools[pairKey].dexes[dex] = { type: 'V2', address: pairAddress, stable: isStable };
                            }
                        }
                    } catch (e) { /* Ignore */ }
                } else {
                    try {
                        const pairAddress = await factoryContract.getPair(tokenA_address, tokenB_address);
                        if (pairAddress && getAddress(pairAddress) !== ethers.ZeroAddress) {
                            const code = await provider.getCode(pairAddress);
                            if (code !== '0x') {
                                pools[pairKey].dexes[dex] = { type: 'V2', address: pairAddress, stable: false };
                            }
                        }
                    } catch (e) { /* Ignore */ }
                }
            } else if (dexConfig.type === 'V3') {
                const factoryContract = new ethers.Contract(dexConfig.factory, ['function getPool(address, address, uint24) view returns (address)'], provider);
                pools[pairKey].dexes[dex] = { type: 'V3', fees: {} };
                for (const fee of dexConfig.fees) {
                    try {
                        const poolAddress = await factoryContract.getPool(tokenA_address, tokenB_address, fee);
                        if (poolAddress && getAddress(poolAddress) !== ethers.ZeroAddress) {
                            const code = await provider.getCode(poolAddress);
                            if (code === '0x') continue;
                            const poolContract = new ethers.Contract(poolAddress, IUniswapV3Pool_ABI, provider);
                            const tickSpacing = await poolContract.tickSpacing();
                            pools[pairKey].dexes[dex].fees[fee] = { address: poolAddress, tickSpacing: Number(tickSpacing) };
                        }
                    } catch (e) { /* Ignore */ }
                }
            }
        }
    }
    await reconcilePools();
    console.log("Pools initialized and initial state reconciled.");
}

async function updateV2Pool(pairKey, dex, log = null) {
    const poolData = pools[pairKey]?.dexes[dex];
    if (!poolData || poolData.type !== 'V2') return;

    if (log) {
        const [reserve0, reserve1] = new AbiCoder().decode(['uint112', 'uint112'], log.data);
        poolData.reserve0 = bn(reserve0);
        poolData.reserve1 = bn(reserve1);
    } 
}

async function updateV3Pool(pairKey, dex, fee, log = null) {
    const feeData = pools[pairKey]?.dexes[dex]?.fees[fee];
    if (!feeData) return;

    if (log) {
        const [, , sqrtPriceX96, liquidity] = new AbiCoder().decode(['int256', 'int256', 'uint160', 'uint128', 'int24'], log.data);
        feeData.sqrtPriceX96 = bn(sqrtPriceX96);
        feeData.liquidity = bn(liquidity);
    }
}

async function reconcilePools() {
    const multicall = getMulticallContract();
    const calls = [];

    const v2PairInterface = new Interface(IUniswapV2Pair_ABI);
    const v3PoolInterface = new Interface(IUniswapV3Pool_ABI);

    for (const pairKey of Object.keys(pools)) {
        const pool = pools[pairKey];
        for (const dex in pool.dexes) {
            const dexData = pool.dexes[dex];
            if (dexData.type === 'V2') {
                calls.push({
                    target: dexData.address,
                    allowFailure: true,
                    callData: v2PairInterface.encodeFunctionData('getReserves'),
                });
            } else if (dexData.type === 'V3') {
                for (const fee in dexData.fees) {
                    const feeData = dexData.fees[fee];
                    calls.push({
                        target: feeData.address,
                        allowFailure: true,
                        callData: v3PoolInterface.encodeFunctionData('slot0'),
                    });
                    calls.push({
                        target: feeData.address,
                        allowFailure: true,
                        callData: v3PoolInterface.encodeFunctionData('liquidity'),
                    });
                }
            }
        }
    }

    if (calls.length === 0) return;

    const results = await multicall.aggregate3(calls);

    let callIndex = 0;
    for (const pairKey of Object.keys(pools)) {
        const pool = pools[pairKey];
        for (const dex in pool.dexes) {
            const dexData = pool.dexes[dex];
            if (dexData.type === 'V2') {
                const result = results[callIndex++];
                if (result.success && result.returnData !== '0x') {
                    const [reserve0, reserve1] = v2PairInterface.decodeFunctionResult('getReserves', result.returnData);
                    dexData.reserve0 = bn(reserve0);
                    dexData.reserve1 = bn(reserve1);
                }
            } else if (dexData.type === 'V3') {
                for (const fee in dexData.fees) {
                    const feeData = dexData.fees[fee];
                    const slot0Result = results[callIndex++];
                    const liquidityResult = results[callIndex++];

                    if (slot0Result.success && slot0Result.returnData !== '0x') {
                        const [sqrtPriceX96] = v3PoolInterface.decodeFunctionResult('slot0', slot0Result.returnData);
                        feeData.sqrtPriceX96 = bn(sqrtPriceX96);
                    }
                    if (liquidityResult.success && liquidityResult.returnData !== '0x') {
                        const [liquidity] = v3PoolInterface.decodeFunctionResult('liquidity', liquidityResult.returnData);
                        feeData.liquidity = bn(liquidity);
                    }
                }
            }
        }
    }
}

module.exports = { pools, initializePools, updateV2Pool, updateV3Pool, reconcilePools };