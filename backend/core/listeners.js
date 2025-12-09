const { ethers, getAddress, Interface, AbiCoder } = require('ethers');
const WebSocket = require('ws');
const { getScanningProvider } = require('./provider');
const { pools, updateV2Pool, updateV3Pool } = require('./poolState');
const { addDirtyPool } = require('./dirtyPools');
const IUniswapV3Pool_ABI = require('../abis/uniswapV3/pool.json');
const IUniswapV2Pair_ABI = require('../abis/uniswapV2/pair.json');

const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'status', data: { isOnline: true } }));
});

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function listenToSwaps() {
    const provider = getScanningProvider();
    const v2PairInterface = new Interface(IUniswapV2Pair_ABI);
    const v3PoolInterface = new Interface(IUniswapV3Pool_ABI);
    const swapV2Topic = v2PairInterface.getEvent('Swap').topicHash;
    const swapV3Topic = v3PoolInterface.getEvent('Swap').topicHash;

    console.log("Listening for real-time swap events...");

    provider.on('block', async (blockNumber) => {
        try {
            const logs = await provider.getLogs({ fromBlock: blockNumber, toBlock: blockNumber });

            for (const log of logs) {
                const topic = log.topics[0];
                if (topic !== swapV2Topic && topic !== swapV3Topic) continue;

                const poolAddress = getAddress(log.address);
                addDirtyPool(poolAddress);

                // Future optimization: Decode the log here and pass it to the update functions
                // to avoid a potential re-fetch of data that's already in the log.
                // For now, we just mark as dirty and let the reconciliation handle it.
            }
        } catch (error) {
            console.error("[EVENT_LISTENER] Error processing block:", error);
        }
    });
}

module.exports = { broadcast, listenToSwaps };