const { div, mul } = require('../utils/bigints');

// Price of token0 in terms of token1
function getPriceFromV3(sqrtPriceX96) {
    const Q192 = 2n ** 192n;
    const ONE_E18 = 10n ** 18n;
    return div(mul(sqrtPriceX96 ** 2n, ONE_E18), Q192);
}

module.exports = { getPriceFromV3 };
