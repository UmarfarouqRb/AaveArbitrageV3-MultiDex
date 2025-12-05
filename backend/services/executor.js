const { ethers, formatUnits, AbiCoder } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
const { bn, div, mul, sub, expand } = require('../utils/bigints');
const { ABIS, TOKEN_DECIMALS, BOT_CONFIG, DEX_CONFIG, SWAP_STEP_TYPES, V2_DEX_TYPES, V3_DEX_TYPES, LOAN_TOKENS } = require('../config');
const { getExecutionProvider } = require('../core/provider.js');
const { broadcast } = require('../core/listeners.js');
const { getArbitrageContract } = require('../core/wallet.js');

const TRADE_HISTORY_FILE = path.join(__dirname, '..', 'trade_history.json');

async function recordTrade(tradeData) {
    let history = [];
    try {
        const data = await fs.readFile(TRADE_HISTORY_FILE, 'utf8');
        history = JSON.parse(data);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error("Error reading trade history:", error);
            return;
        }
    }
    history.unshift(tradeData);
    if (history.length > 100) {
        history.pop();
    }
    try {
        await fs.writeFile(TRADE_HISTORY_FILE, JSON.stringify(history, null, 2));
        broadcast({ type: 'trade', data: tradeData });
        console.log("Successfully recorded and broadcasted trade.");
    } catch (error) {
        console.error("Error writing trade history:", error);
    }
}

async function executeArbitrage(loanTokenSymbol, loanAmount, swapPath, swapsV2, swapsV3, opportunityDetails) {
    const loanToken = LOAN_TOKENS[loanTokenSymbol];

    if (BOT_CONFIG.DRY_RUN) {
        console.log(`
--------------------------------------------------------------------------------
[DRY RUN] Opportunity Found
--------------------------------------------------------------------------------
  - Path: ${opportunityDetails.path}
  - Est. Profit: ${opportunityDetails.profit} ${loanTokenSymbol}
  - Steps: (see opportunity log for details)
--------------------------------------------------------------------------------
`);
        broadcast({
            type: 'opportunity',
            data: {
                path: opportunityDetails.path,
                profit: opportunityDetails.profit,
                token: loanTokenSymbol
            }
        });
        return;
    }

    let receipt;
    try {
        const arbitrageContract = getArbitrageContract();
        const provider = getExecutionProvider();
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        const tx = await arbitrageContract.executeArbitrage(loanToken, loanAmount, swapPath, swapsV3, swapsV2, { gasPrice });
        
        console.log(`
>>> EXECUTING TRADE on ${opportunityDetails.path} with loan ${formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol])} ${loanTokenSymbol}... (Tx: ${tx.hash})`);

        receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log(`
--------------------------------------------------------------------------------
✅ TRADE CONFIRMED on ${opportunityDetails.path}
--------------------------------------------------------------------------------
  - Tx Hash: ${receipt.transactionHash}
  - Gas Used: ${formatUnits(receipt.gasUsed, 0)}
  - Gas Price: ${formatUnits(receipt.effectiveGasPrice, 9)} Gwei
  - Tx Cost: ${formatUnits(mul(receipt.gasUsed, receipt.effectiveGasPrice), 18)} ETH
--------------------------------------------------------------------------------
`);
        } else {
            throw new Error('Transaction reverted on-chain');
        }

        await recordTrade({
            timestamp: new Date().toISOString(),
            path: opportunityDetails.path,
            loanAmount: formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol]),
            profit: 'N/A', // On-chain profit is the source of truth
            token: loanTokenSymbol,
            txHash: receipt.transactionHash,
            status: 'Success'
        });

    } catch (error) {
        console.error(`
--------------------------------------------------------------------------------
❌ TRADE FAILED on ${opportunityDetails.path}
--------------------------------------------------------------------------------
`);
        if (receipt) {
            console.error(`  - Tx Hash: ${receipt.transactionHash}`);
            console.error(`  - Status: Reverted`);
        }
        if (error.data) {
            const CUSTOM_ERRORS = {
                '0x90cd6f24': 'SwapFailed()',
                '0x025217a4': 'InvalidSwapPath()',
                '0x7211c21c': 'FlashloanFailed()',
                '0x63143588': 'TransferFailed()',
                '0x81994b33': 'RepaymentFailed()'
            };
            const errorSignature = error.data.slice(0, 10);
            if (CUSTOM_ERRORS[errorSignature]) {
                console.error(`  - Decoded Reason: ${CUSTOM_ERRORS[errorSignature]}`);
            }
        }
        console.error(`  - Reason: ${error.reason || (error.error ? error.error.message : error.message)}`);
        console.error(`--------------------------------------------------------------------------------
`);

        broadcast({
            type: 'error',
            data: {
                message: `Trade failed for ${opportunityDetails.path}: ${error.reason || (error.error ? error.error.message : error.message)}`
            }
        });

        if (receipt) {
            await recordTrade({
                timestamp: new Date().toISOString(),
                path: opportunityDetails.path,
                loanAmount: formatUnits(loanAmount, TOKEN_DECIMALS.base[loanTokenSymbol]),
                profit: '0',
                token: loanTokenSymbol,
                txHash: receipt.transactionHash,
                status: 'Fail'
            });
        }
    } finally {
        console.log(`--- COOLDOWN: Pausing for ${BOT_CONFIG.RECONCILIATION_TIMEOUT / 1000} seconds before next scan. ---`);
        await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.RECONCILIATION_TIMEOUT));
    }
}

module.exports = { executeArbitrage, recordTrade };