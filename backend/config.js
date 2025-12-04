const { getAddress, parseUnits } = require('ethers');

// --- Network Configuration ---
const NETWORKS = {
    base: {
        chainId: 8453,
        rpcUrl: 'https://base-mainnet.infura.io/v3/', // Project ID will be appended in bot.js
        explorerUrl: 'https://basescan.org',
    }
};

// --- Token Configuration ---
const TOKENS = {
    base: {
        WETH: getAddress('0x4200000000000000000000000000000000000006'),
        USDC: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
        cbBTC: getAddress('0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'),
        DAI: getAddress('0x50c5725949a6f0c72e6c4a641f24049a917db0cb'),
        DEGEN: getAddress('0x4ed4e862860bed51a9570b96d89af5e1b0efefed'),
        BRETT: getAddress('0x532f27101965dd16442e59d40670faf2ebb144e4'),
        AERO: getAddress('0x940181a94a35a4569e4529a3cdfb74e38fd98631'),
        cbETH: getAddress('0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22'),
        HIGHER: getAddress('0x0578d8a44db98b23bf096a382e016e29a5ce0ffe'),
        FRIEND: getAddress('0x0bd488718c4651a08528b931081a24607220556f'),
        MFER: getAddress('0xe3086852a4b125803c815a1582f17cc4a1226956'),
        TOSHI: getAddress('0xac1bd2486aaf3bf5c03df39e8499452d84e04049'),
        DOGINME: getAddress('0x6921b130d297cc43754afba22e5eac0f3f3da462'),
        TYBG: getAddress('0x0d9c429813e335506451e257017d50b8e2b21a81'),
        BALD: getAddress('0x27d2decb4a5353dc9f39075e55104935f7956b62'),
        SEAM: getAddress('0x1c7a460413dd4e964f96d8dfc56e7223ce82cf0a'),
        TN100X: getAddress('0x554c9251a3501f65523f22144d13374b43aa9d6b'),
        NORMIE: getAddress('0x7f12d13b34f5f4f0a9449c16bcd42f0da47af200'),
    }
};

const TOKEN_DECIMALS = {
    base: {
        WETH: 18, USDC: 6, cbBTC: 8, DAI: 18, DEGEN: 18, BRETT: 18, AERO: 18, cbETH: 18,
        HIGHER: 18, FRIEND: 18, MFER: 18, TOSHI: 18, DOGINME: 18, TYBG: 18, BALD: 18,
        SEAM: 18, TN100X: 18, NORMIE: 18,
    }
};

// --- DEX Configuration ---
const DEX_ROUTERS = {
    base: {
        'AerodromeV2': {
            router: getAddress('0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43'),
            factory: getAddress('0x420dd381b31aef6683db6b902084cb0ffcec40da'),
            stable: false, // Default to volatile
        },
        'PancakeV3': {
            router: getAddress('0x1b81D678ffb9C0263b24A97847620C99d213eB14'),
            factory_v3: getAddress('0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'),
        },
        'UniswapV3': {
            router: getAddress('0x1b81D678ffb9C0263b24A97847620C99d213eB14'),
            factory_v3: getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'),
        },
        'UniswapV2': {
            router: getAddress('0x1b81D678ffb9C0263b24A97847620C99d213eB14'),
            factory: getAddress('0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'),
        },
        'SushiswapV2': {
            router: getAddress('0x6bded42c6da8fbf0d2ba55b2fa120c5e0c8d7891'),
            factory: getAddress('0x71524B4f93c58fcbF659783284E38825f0622859'),
        }
    }
};

const DEX_QUOTERS = {
    base: {
        'PancakeV3': getAddress('0x2fF35e3A5ddBb1e90b43a1CdE3c5aaB2F24806A8'),
        'UniswapV3': getAddress('0x3d4Cba59AAE52d07b34E78E254e49fD94f93bD71'),
    }
};

const V3_FEE_TIERS = {
    'PancakeV3': [100, 500, 2500, 10000],
    'UniswapV3': [100, 500, 3000, 10000],
};

// --- Contract Enum Mappings ---
// These MUST match the enums in the smart contract

const SWAP_STEP_TYPES = {
    V3: 0,
    V2: 1
};

const V3_DEX_TYPES = {
    'UniswapV3': 0,
    'PancakeV3': 1
};

const V2_DEX_TYPES = {
    'UniswapV2': 0,
    'AerodromeV2': 1,
    'SushiswapV2': 2
};

// --- Arbitrage Configuration ---

const LOAN_TOKENS = {
    USDC: TOKENS.base.USDC,
    WETH: TOKENS.base.WETH,
};

// Automatically generate pairs for all tokens against all loan tokens
const ARBITRAGE_PAIRS = Object.values(LOAN_TOKENS).flatMap(loanToken =>
    Object.values(TOKENS.base)
        .filter(targetToken => targetToken !== loanToken) // Ensure loan token is not the same as target token
        .map(targetToken => [loanToken, targetToken])
);


// --- Bot Configuration ---
const BOT_CONFIG = {
    DRY_RUN: false,
    ARBITRAGE_CONTRACT_ADDRESS: getAddress('0x8b4714d43343afc179a34ced72e4a5672d8c4395'),
    MIN_PROFIT_THRESHOLD_ETH: '0.0001', // Minimum profit in ETH to trigger a trade
    MIN_PROFIT_BPS: 20,
    GAS_PRICE_STRATEGY: 'fast',
    GAS_LIMIT: '1000000',
    AAVE_FLASH_LOAN_FEE: 0.0009, // 0.09%
    ESTIMATED_GAS_COST_ETH: '0', // Estimated gas cost in ETH
    LOAN_PERCENTAGE: 1, // 1% of the pool's reserve
};

module.exports = {
    NETWORKS,
    TOKENS,
    TOKEN_DECIMALS,
    DEX_ROUTERS,
    DEX_QUOTERS,
    V3_FEE_TIERS,
    SWAP_STEP_TYPES,
    V2_DEX_TYPES,
    V3_DEX_TYPES,
    LOAN_TOKENS,
    ARBITRAGE_PAIRS,
    BOT_CONFIG,
};
