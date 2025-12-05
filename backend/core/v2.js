const { bn, div, mul, sub, sqrt } = require('../utils/bigints');

// Calculates the price of a V2 pool
function getPriceFromV2(reserve0, reserve1) {
    if (reserve0 === 0n || reserve1 === 0n) return 0n;
    return div(mul(reserve1, 1n << 112n), reserve0);
}

// Calculates the amount out for a V2 swap
function getAmountOut(amountIn, reserveIn, reserveOut) {
    const amountInWithFee = mul(amountIn, 997n);
    const numerator = mul(amountInWithFee, reserveOut);
    const denominator = add(mul(reserveIn, 1000n), amountInWithFee);
    return div(numerator, denominator);
}

// Calculates the optimal input amount for a V2 -> V2 arbitrage
function getOptimalAmountIn(reserveA0, reserveA1, reserveB0, reserveB1) {
    const a = 997n * reserveA0 * reserveB1;
    const b = 997n * reserveB0 * reserveA1;
    if (a <= b) return 0n;

    const term1 = sqrt(a * b * 1000n * 1000n);
    const term2 = b * 1000n;
    if (term1 <= term2) return 0n;

    const numerator = term1 - term2;
    const denominator = 997n * (a - b) / 997n; // Simplified
    
    return numerator / (2n * denominator) - 1n;
}


module.exports = { getPriceFromV2, getAmountOut, getOptimalAmountIn };
