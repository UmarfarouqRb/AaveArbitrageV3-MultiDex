const { JsonRpcProvider, Contract, Wallet, isAddress, parseUnits } = require('ethers');
const { decrypt } = require('./utils/crypto'); // Assuming a crypto utility

const routerABI = require('../../frontend/src/utils/abi').uniswapV2RouterABI;
const erc20ABI = [ "function approve(address spender, uint256 amount) public returns (bool)" ];

const GAS_LIMIT_EXECUTE = 600000; // A safe limit for a swap + approve

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // --- AUTH & SETUP ---
    const infuraProjectId = process.env.VITE_INFURA_PROJECT_ID;
    if (!infuraProjectId) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Server config error.' }) };
    }

    let body;
    try { body = JSON.parse(event.body); } 
    catch (e) { return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON' }) }; }

    const { 
        encryptedWallet, password, loanAmount, minAmountOut, tradePath, gasPrice 
    } = body;

    // --- INPUT VALIDATION ---
    if (!encryptedWallet || !password || !loanAmount || !minAmountOut || !tradePath || !gasPrice) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing required trade parameters.' }) };
    }
    if (!tradePath.every(p => isAddress(p.from) && isAddress(p.to) && isAddress(p.router))) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid trade path address.' }) };
    }

    let privateKey;
    try {
        privateKey = decrypt(encryptedWallet, password);
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
    } catch (e) {
        return { statusCode: 403, body: JSON.stringify({ message: 'Invalid password or corrupted wallet.' }) };
    }

    const provider = new JsonRpcProvider(`https://base-mainnet.infura.io/v3/${infuraProjectId}`);
    const wallet = new Wallet(privateKey, provider);

    try {
        const [firstLeg, secondLeg] = tradePath;
        const amountIn = parseUnits(loanAmount, 18); // Assuming 18 decimals

        // --- TRADE EXECUTION ---
        const nonce = await wallet.getNonce('latest');
        const tokenContract = new Contract(firstLeg.from, erc20ABI, wallet);
        const routerContract = new Contract(firstLeg.router, routerABI, wallet);

        // 1. Approve the first router to spend the token
        const approveTx = await tokenContract.approve(firstLeg.router, amountIn, {
            gasPrice: parseUnits(gasPrice, 'gwei'),
            gasLimit: 80000, // Standard approval gas limit
            nonce: nonce
        });
        await approveTx.wait(); // Wait for approval to be mined

        // 2. Execute the swap
        const deadline = Math.floor(Date.now() / 1000) + 60 * 5; // 5 minute deadline
        const swapTx = await routerContract.swapExactTokensForTokens(
            amountIn,
            parseUnits(minAmountOut, 18), // Slippage protection
            [firstLeg.from, firstLeg.to],
            wallet.address,
            deadline,
            {
                gasPrice: parseUnits(gasPrice, 'gwei'),
                gasLimit: GAS_LIMIT_EXECUTE,
                nonce: nonce + 1 // Increment nonce for the second transaction
            }
        );
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, txHash: swapTx.hash })
        };

    } catch (error) {
        console.error('Trade execution error:', error);
        // Try to provide a more specific error reason if available
        const reason = error.reason || 'An unknown error occurred during the transaction.';
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to execute trade.', error: reason }) };
    }
};