const { ethers } = require('ethers');
const { BOT_CONFIG, ABIS } = require('../config');
const { getExecutionProvider } = require('./provider');

let wallet;
let arbitrageContract;

async function initializeWalletAndContract() {
    if (!process.env.PRIVATE_KEY) {
        console.error('!!! FATAL: PRIVATE_KEY environment variable is not set!');
        process.exit(1);
    }
    const provider = getExecutionProvider();
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log(`Wallet Address: ${wallet.address}`);
    arbitrageContract = new ethers.Contract(BOT_CONFIG.ARBITRAGE_CONTRACT_ADDRESS, ABIS.AaveArbitrageV3, wallet);
}

function getWallet() {
    if (!wallet) {
        throw new Error("Wallet has not been initialized.");
    }
    return wallet;
}

function getArbitrageContract() {
    if (!arbitrageContract) {
        throw new Error("Arbitrage contract has not been initialized.");
    }
    return arbitrageContract;
}

module.exports = { initializeWalletAndContract, getWallet, getArbitrageContract };
