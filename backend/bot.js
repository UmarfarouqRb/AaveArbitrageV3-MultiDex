require('dotenv').config();
const { initializeProviders } = require('./core/provider');
const { initializeWalletAndContract } = require('./core/wallet');
const { initializePools } = require('./core/poolState');
const { startLoops } = require('./core/loops');
const { listenToSwaps, broadcast } = require('./core/listeners');

BigInt.prototype.toJSON = function() { return this.toString(); };

async function run() {
    console.log('========================================');
    console.log('      Aave Arbitrage Bot Starting...');
    console.log('========================================');
    broadcast({ type: 'status', data: { isOnline: true, message: 'Bot Starting...' } });

    await initializeProviders();
    await initializeWalletAndContract();
    await initializePools();
    
    listenToSwaps();
    startLoops();

    console.log('========================================');
    console.log('      Bot is now running!           ');
    console.log('========================================');
    broadcast({ type: 'status', data: { isOnline: true, message: 'Bot is Running' } });
}

run().catch(error => {
    console.error("An unexpected error occurred:", error);
    broadcast({ type: 'status', data: { isOnline: false, message: 'Bot Stopped due to Error' } });
    process.exit(1);
});
