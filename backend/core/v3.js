const { div, mul } = require('../utils/bigints');
const { getTickAtSqrtRatio, MIN_TICK, MAX_TICK } = require('./tick');

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

function getAmountOut(amountIn, sqrtPriceX96, liquidity, tokenIn, tokenOut, tickSpacing) {
    const zeroForOne = tokenIn.toLowerCase() < tokenOut.toLowerCase();
    let amountOut = 0n;
    let remainingAmountIn = amountIn;

    while (remainingAmountIn > 0n) {
        const currentTick = getTickAtSqrtRatio(sqrtPriceX96);
        
        const nextTick = zeroForOne ? currentTick - tickSpacing : currentTick + tickSpacing;
        if (nextTick < MIN_TICK || nextTick > MAX_TICK) {
            break; 
        }

        const sqrtPriceNextX96 = getNextSqrtPriceFromInput(sqrtPriceX96, liquidity, remainingAmountIn, zeroForOne);

        let amountInToNextTick, amountOutFromNextTick;

        if (zeroForOne) {
            amountInToNextTick = getAmount0Delta(sqrtPriceNextX96, sqrtPriceX96, liquidity, true);
            amountOutFromNextTick = getAmount1Delta(sqrtPriceNextX96, sqrtPriceX96, liquidity, false);
        } else {
            amountInToNextTick = getAmount1Delta(sqrtPriceX96, sqrtPriceNextX96, liquidity, true);
            amountOutFromNextTick = getAmount0Delta(sqrtPriceX96, sqrtPriceNextX96, liquidity, false);
        }

        if (remainingAmountIn >= amountInToNextTick) {
            amountOut += amountOutFromNextTick;
            remainingAmountIn -= amountInToNextTick;
            sqrtPriceX96 = sqrtPriceNextX96;
        } else {
            const finalAmountOut = getAmountOutSimple(remainingAmountIn, sqrtPriceX96, liquidity, tokenIn, tokenOut);
            amountOut += finalAmountOut;
            remainingAmountIn = 0n;
        }
    }

    return amountOut;
}

function getAmountOutSimple(amountIn, sqrtPriceX96, liquidity, tokenIn, tokenOut) {
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