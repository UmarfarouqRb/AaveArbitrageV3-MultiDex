const { div, mul } = require('../utils/bigints');

// Price of token0 in terms of token1
function getPriceFromV2(reserve0, reserve1) {
    if (reserve0 === 0n || reserve1 === 0n) return 0n;
    const ONE_E18 = 10n ** 18n;
    return div(mul(reserve1, ONE_E18), reserve0);
}

module.exports = { getPriceFromV2 };
