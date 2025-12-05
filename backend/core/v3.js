const { div, mul } = require('../utils/bigints');

// Price of token0 in terms of token1
function getPriceFromV3(sqrtPriceX96) {
    const Q192 = 2n ** 192n;
    const ONE_E18 = 10n ** 18n;
    return div(mul(sqrtPriceX96 ** 2n, ONE_E18), Q192);
}

/**
 * Calculates the output amount of a swap on a Uniswap V3-like pool.
 * This is a simplified implementation and assumes the swap does not cross a tick boundary.
 * @param {bigint} amountIn The amount of tokens being swapped in.
 * @param {bigint} sqrtPriceX96 The current sqrt price of the pool.
 * @param {bigint} liquidity The current liquidity of the pool.
 * @param {string} tokenIn The address of the input token.
 * @param {string} tokenOut The address of the output token.
 * @returns {bigint} The calculated amount of tokens received.
 */
function getAmountOut(amountIn, sqrtPriceX96, liquidity, tokenIn, tokenOut) {
    const Q96 = 2n ** 96n;
    const FEE = 3000n; // Using a hardcoded 0.3% fee

    if (liquidity === 0n) {
        return 0n;
    }

    const zeroForOne = tokenIn.toLowerCase() < tokenOut.toLowerCase();
    const amountInWithFee = mul(amountIn, 1000000n - FEE) / 1000000n;

    let amountOut;

    if (zeroForOne) {
        // Swapping token0 for token1 (e.g., WETH for USDC)
        // amountIn is token0, amountOut is token1
        const product = amountInWithFee * sqrtPriceX96;
        const denominator = (liquidity << 96n) + product;
        if (denominator === 0n) return 0n;
        const nextSqrtPriceX96 = ((liquidity << 96n) * sqrtPriceX96) / denominator;

        const amountOutNum = liquidity * (sqrtPriceX96 - nextSqrtPriceX96);
        amountOut = amountOutNum / Q96;
    } else {
        // Swapping token1 for token0 (e.g., USDC for WETH)
        // amountIn is token1, amountOut is token0
        const nextSqrtPriceX96 = sqrtPriceX96 + (amountInWithFee << 96n) / liquidity;

        const numerator = liquidity * (nextSqrtPriceX96 - sqrtPriceX96) * Q96;
        const denominator = nextSqrtPriceX96 * sqrtPriceX96;
        if (denominator === 0n) return 0n;
        amountOut = numerator / denominator;
    }

    return amountOut > 0n ? amountOut : 0n;
}

module.exports = { getPriceFromV3, getAmountOut };
