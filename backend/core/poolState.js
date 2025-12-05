const { ethers, getAddress, AbiCoder } = require('ethers');
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
const { getScanningProvider } = require('./provider.js');

const pools = {};

async function initializePools() {
    console.log("Initializing pools...");
    const provider = getScanningProvider();

    const allTokens = Object.values(TOKENS.base);
    const allPairs = [];
    for (let i = 0; i < allTokens.length; i++) {
        for (let j = i + 1; j < allTokens.length; j++) {
            allPairs.push([allTokens[i], allTokens[j]]);
        }
    }

    for (const pair of allPairs) {
        let [tokenA_address, tokenB_address] = pair;

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
                                await updateV2Pool(pairKey, dex);
                                console.log(`Initialized V2 pool for ${pairKey} on ${dex} (stable: ${isStable})`);
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
                                await updateV2Pool(pairKey, dex);
                                console.log(`Initialized V2 pool for ${pairKey} on ${dex}`);
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
                            pools[pairKey].dexes[dex].fees[fee] = { address: poolAddress };
                            await updateV3Pool(pairKey, dex, fee);
                            console.log(`Initialized V3 pool for ${pairKey} on ${dex} with fee ${fee}`);
                        }
                    } catch (e) { /* Ignore */ }
                }
            }
        }
    }
}

async function updateV2Pool(pairKey, dex, log = null) {
    const provider = getScanningProvider();
    const poolData = pools[pairKey]?.dexes[dex];
    if (!poolData || poolData.type !== 'V2') return;

    if (log) {
        const [reserve0, reserve1] = new AbiCoder().decode(['uint112', 'uint112'], log.data);
        poolData.reserve0 = bn(reserve0);
        poolData.reserve1 = bn(reserve1);
    } else {
        try {
            let pairAbi;
            if (dex === 'AerodromeV2') {
                pairAbi = IAerodromePair_ABI;
            } else if (dex === 'SushiswapV2') {
                pairAbi = ISushiV2Pair_ABI;
            } else {
                pairAbi = IUniswapV2Pair_ABI;
            }
            const pairContract = new ethers.Contract(poolData.address, pairAbi, provider);
            const reserves = await pairContract.getReserves();
            if (reserves && reserves.length >= 2) {
                poolData.reserve0 = bn(reserves[0]);
                poolData.reserve1 = bn(reserves[1]);
            }
        } catch (e) {
            console.error(`Error updating V2 pool ${dex} for ${pairKey}:`, e.message);
        }
    }
}

async function updateV3Pool(pairKey, dex, fee, log = null) {
    const provider = getScanningProvider();
    const feeData = pools[pairKey]?.dexes[dex]?.fees[fee];
    if (!feeData) return;

    if (log) {
        const [, , sqrtPriceX96, liquidity] = new AbiCoder().decode(['int256', 'int256', 'uint160', 'uint128', 'int24'], log.data);
        feeData.sqrtPriceX96 = bn(sqrtPriceX96);
        feeData.liquidity = bn(liquidity);
    } else {
        try {
            let poolAbi;
            if (dex === 'PancakeV3') {
                poolAbi = IPancakeV3Pool_ABI;
            } else { // Default to Uniswap V3 ABI
                poolAbi = IUniswapV3Pool_ABI;
            }
            const poolContract = new ethers.Contract(feeData.address, poolAbi, provider);
            const [slot0, liquidity] = await Promise.all([
                poolContract.slot0(),
                poolContract.liquidity()
            ]);
            if (slot0 && slot0.sqrtPriceX96 > 0n) {
                feeData.sqrtPriceX96 = bn(slot0.sqrtPriceX96);
            }
            if (liquidity && liquidity > 0n) {
                feeData.liquidity = bn(liquidity);
            }
        } catch (e) {
            console.error(`Error updating V3 pool ${dex} (fee: ${fee}) for ${pairKey}:`, e.message);
        }
    }
}

module.exports = { pools, initializePools, updateV2Pool, updateV3Pool };
