const { ethers } = require('ethers');

const primaryProviderUrl = `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const fallbackProviderUrl = `https://base.quicknode.com/your-quicknode-api-key`; // Replace with your QuickNode key

let provider;

async function initializeProvider() {
    try {
        console.log("Attempting to connect to primary provider (Alchemy)...");
        provider = new ethers.WebSocketProvider(primaryProviderUrl);
        await provider.getNetwork();
        console.log("Successfully connected to primary provider.");
    } catch (error) {
        console.error("Primary provider connection failed, attempting fallback...", error);
        try {
            provider = new ethers.WebSocketProvider(fallbackProviderUrl);
            await provider.getNetwork();
            console.log("Successfully connected to fallback provider (QuickNode).");
        } catch (fallbackError) {
            console.error("FATAL: All provider connections failed.", fallbackError);
            process.exit(1);
        }
    }

    provider.on('error', (err) => {
        console.error('Provider error, re-initializing...', err);
        initializeProvider();
    });
}

function getProvider() {
    if (!provider) {
        throw new Error("Provider not initialized");
    }
    return provider;
}

module.exports = { initializeProvider, getProvider };
