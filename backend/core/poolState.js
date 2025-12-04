const { ethers, getAddress, AbiCoder } = require('ethers');
const { ARBITRAGE_PAIRS, TOKENS, TOKEN_DECIMALS, DEX_ROUTERS, V3_FEE_TIERS } = require('../config');
const { bn } = require('../utils/bigints');
const IUniswapV3Pool_ABI = require('../abis/IUniswapV3Pool.json').abi;
const { getProvider } = require('./provider.js');

const pools = {};

async function initializePools() {
    console.log("Initializing pools...");
    const provider = getProvider();

    for (const pair of ARBITRAGE_PAIRS) {
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

        for (const dex in DEX_ROUTERS.base) {
            const routerConfig = DEX_ROUTERS.base[dex];
            if (routerConfig.factory) { // V2-like DEX
                const factoryContract = new ethers.Contract(routerConfig.factory, ['function getPair(address, address, bool) view returns (address)'], provider);
                for (const isStable of [true, false]) {
                     try {
                        const pairAddress = await factoryContract.getPair(tokenA_address, tokenB_address, isStable);
                        if (pairAddress && getAddress(pairAddress) !== ethers.ZeroAddress) {
                            pools[pairKey].dexes[dex] = { type: 'V2', address: pairAddress, stable: isStable };
                            await updateV2Pool(pairKey, dex);
                            console.log(`Initialized V2 pool for ${pairKey} on ${dex} (stable: ${isStable})`);
                        }
                    } catch (e) { /* silent fail */ }
                }
            } else if (routerConfig.factory_v3) { // V3-like DEX
                if (!V3_FEE_TIERS[dex]) continue;
                const factoryContract = new ethers.Contract(routerConfig.factory_v3, ['function getPool(address, address, uint24) view returns (address)'], provider);
                pools[pairKey].dexes[dex] = { type: 'V3', fees: {} };
                for (const fee of V3_FEE_TIERS[dex]) {
                    try {
                        const poolAddress = await factoryContract.getPool(tokenA_address, tokenB_address, fee);
                        if (poolAddress && getAddress(poolAddress) !== ethers.ZeroAddress) {
                            pools[pairKey].dexes[dex].fees[fee] = { address: poolAddress };
                            await updateV3Pool(pairKey, dex, fee);
                            console.log(`Initialized V3 pool for ${pairKey} on ${dex} with fee ${fee}`);
                        }
                    } catch (e) { /* silent fail */ }
                }
            }
        }
    }
}

async function updateV2Pool(pairKey, dex, log = null) {
    const provider = getProvider();
    const poolData = pools[pairKey]?.dexes[dex];
    if (!poolData || poolData.type !== 'V2') return;

    if (log) {
        const [reserve0, reserve1] = new AbiCoder().decode(['uint112', 'uint112'], log.data);
        poolData.reserve0 = bn(reserve0);
        poolData.reserve1 = bn(reserve1);
    } else {
        try {
            const pairContract = new ethers.Contract(poolData.address, ['function getReserves() view returns (uint112, uint112, uint32)'], provider);
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
    const provider = getProvider();
    const feeData = pools[pairKey]?.dexes[dex]?.fees[fee];
    if (!feeData) return;

    if (log) {
        const [, , sqrtPriceX96, liquidity] = new AbiCoder().decode(['int256', 'int256', 'uint160', 'uint128', 'int24'], log.data);
        feeData.sqrtPriceX96 = bn(sqrtPriceX96);
        feeData.liquidity = bn(liquidity);
    } else {
        try {
            const poolContract = new ethers.Contract(feeData.address, IUniswapV3Pool_ABI, provider);
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