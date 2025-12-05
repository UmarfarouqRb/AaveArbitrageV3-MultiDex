const { ethers } = require('ethers');

const primaryProviderUrl = `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const executionProviderUrl = 'wss://falling-billowing-telescope.base-mainnet.quiknode.pro/743c8cd0a0e5c9d6dae8538b392e48cfd7b2cd20/';

let scanningProvider;
let executionProvider;

async function initializeProviders() {
    try {
        console.log("Initializing providers...");

        scanningProvider = new ethers.WebSocketProvider(primaryProviderUrl);
        await scanningProvider.getNetwork();
        console.log("Scanning provider (Alchemy) connected.");

        executionProvider = new ethers.WebSocketProvider(executionProviderUrl);
        await executionProvider.getNetwork();
        console.log("Execution provider (QuickNode) connected.");

    } catch (error) {
        console.error("FATAL: Could not initialize providers.", error);
        process.exit(1);
    }

    scanningProvider.on('error', (err) => {
        console.error('Scanning provider error, re-initializing...', err);
        initializeProviders();
    });

    executionProvider.on('error', (err) => {
        console.error('Execution provider error, re-initializing...', err);
        initializeProviders();
    });
}

function getScanningProvider() {
    if (!scanningProvider) {
        throw new Error("Scanning provider not initialized");
    }
    return scanningProvider;
}

function getExecutionProvider() {
    if (!executionProvider) {
        throw new Error("Execution provider not initialized");
    }
    return executionProvider;
}

module.exports = { initializeProviders, getScanningProvider, getExecutionProvider };
