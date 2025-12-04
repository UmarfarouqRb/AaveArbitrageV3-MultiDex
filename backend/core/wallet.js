const { ethers } = require('ethers');
const { BOT_CONFIG } = require('../config');
const AaveArbitrageV3_ABI = require('../abis/AaveArbitrageV3.json').abi;
const { provider } = require('./provider');

let wallet;
let arbitrageContract;

async function initializeWalletAndContract() {
    if (!process.env.PRIVATE_KEY) {
        console.error('!!! FATAL: PRIVATE_KEY environment variable is not set!');
        process.exit(1);
    }
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log(`Wallet Address: ${wallet.address}`);
    arbitrageContract = new ethers.Contract(BOT_CONFIG.ARBITRAGE_CONTRACT_ADDRESS, AaveArbitrageV3_ABI, wallet);
}

module.exports = { initializeWalletAndContract, wallet, arbitrageContract };
