const bn = (x) => BigInt(x);

const expand = (value, decimals) => {
    return value * (10n ** BigInt(decimals));
};

const div = (a, b) => {
    if (b === 0n) return 0n;
    return a / b;
};

const mul = (a, b) => a * b;

const sub = (a, b) => a - b;

const add = (a, b) => a + b;

module.exports = { bn, expand, div, mul, sub, add };
