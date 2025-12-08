const { div, mul } = require('../utils/bigints');

const Q96 = 2n ** 96n;

// Returns the price of token0 in terms of token1
function getPriceFromV3(sqrtPriceX96) {
    const Q192 = 2n ** 192n;
    const ONE_E18 = 10n ** 18n;
    return div(mul(sqrtPriceX96 ** 2n, ONE_E18), Q192);
}

function getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
        [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    const numerator1 = liquidity * Q96;
    const numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

    if (roundUp) {
        return (numerator1 * numerator2 + (sqrtRatioBX96 * sqrtRatioAX96) - 1n) / (sqrtRatioBX96 * sqrtRatioAX96);
    } else {
        return (numerator1 * numerator2) / (sqrtRatioBX96 * sqrtRatioAX96);
    }
}

function getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
        [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    if (roundUp) {
        return (liquidity * (sqrtRatioBX96 - sqrtRatioAX96) + Q96 - 1n) / Q96;
    } else {
        return liquidity * (sqrtRatioBX96 - sqrtRatioAX96) / Q96;
    }
}

function getNextSqrtPriceFromInput(sqrtPriceX96, liquidity, amountIn, zeroForOne) {
    if (liquidity === 0n) return sqrtPriceX96;
    const product = amountIn * sqrtPriceX96;
    
    if (zeroForOne) {
        const denominator = (liquidity * Q96) + product;
        if (denominator === 0n) return sqrtPriceX96;
        return (liquidity * Q96 * sqrtPriceX96) / denominator;
    } else {
        const numerator = (liquidity * Q96 * sqrtPriceX96) + (amountIn * Q96 * Q96);
        const denominator = (liquidity * Q96) + (amountIn * sqrtPriceX96);
        if(denominator === 0n) return sqrtPriceX96;
        return numerator / denominator;
    }
}

function getAmountOut(amountIn, sqrtPriceX96, liquidity, tokenIn, tokenOut) {
    const zeroForOne = tokenIn.toLowerCase() < tokenOut.toLowerCase();
    
    try {
        const sqrtPriceNextX96 = getNextSqrtPriceFromInput(sqrtPriceX96, liquidity, amountIn, zeroForOne);
        if (zeroForOne) {
            return getAmount1Delta(sqrtPriceNextX96, sqrtPriceX96, liquidity, false);
        } else {
            return getAmount0Delta(sqrtPriceX96, sqrtPriceNextX96, liquidity, false);
        }
    } catch (e) {
        return 0n;
    }
}

module.exports = { getPriceFromV3, getAmountOut };