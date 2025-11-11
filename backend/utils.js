
const DEX_CONFIG = {
    BaseSwap: { router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', factory: '0x89C836e1E496839b20675B3fE398158c069D26db' },
    SushiSwap: { router: '0x8cde23bfcc333490347344f2A14a60C803275f4D', factory: '0x01b004245785055233513229562711422B4bA2E1' },
    Aerodrome: { router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', factory: '0x420DD3817f364D72123541178a35624794890312' },
    Wovenswap: { router: '0x9948293913214153d1021714457543E5A447617A', factory: '0x3f353B02633041F1A121515574512534563aA18b' },
    SwapBased: { router: '0x1a713915139d8995111b51a54763B13809633aC8', factory: '0xE4CF472E32724A3e8a4a329aaa3A6A48713d2903' },
    RocketSwap: { router: '0x7aA010850A264eB919F58a5e542B76d26A4734a7', factory: '0x1A2555543c360155b10313f8A7836881a56f6bB6' },
};

function getDexConfig(dexName) {
    const config = DEX_CONFIG[dexName];
    if (!config) {
        throw new Error(`DEX configuration not found for: ${dexName}`);
    }
    return config;
}

module.exports = { getDexConfig };
