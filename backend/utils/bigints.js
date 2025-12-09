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

function sqrt(value) {
    if (value < 0n) {
        throw 'square root of negative numbers is not supported'
    }

    if (value < 2n) {
        return value;
    }

    function newtonIteration(n, x0) {
        const x1 = ((n / x0) + x0) >> 1n;
        if (x0 === x1 || x0 === (x1 - 1n)) {
            return x0;
        }
        return newtonIteration(n, x1);
    }

    return newtonIteration(value, 1n);
}

module.exports = { bn, expand, div, mul, sub, add, sqrt };
