
const { Wallet, JsonRpcProvider, Contract, AbiCoder, parseUnits, formatUnits } = require('ethers');
const { getDexConfig } = require('./utils');
const ARBITRAGE_BALANCER_ABI = ["constructor(address _vault, address _multiSig)","event FlashLoanExecuted(address indexed token, uint256 loanAmount, int256 netProfit)","event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)","event Paused(address account)","event ProfitWithdrawal(address indexed token, uint256 amount)","event RouterAdded(address indexed router)","event RouterRemoved(address indexed router)","event Unpaused(address account)","function addRouter(address router) external","function multiSig() external view returns (address)","function pause() external","function paused() external view returns (bool)","function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata feeAmounts, bytes calldata userData) external","function removeRouter(address router) external","function startFlashloan(address token, uint256 amount, bytes calldata userData) external","function transferOwnership(address newMultiSig) external","function unpause() external","function vault() external view returns (address)","function whitelistedRouters(address) external view returns (bool)","function withdraw(address tokenAddress) external"];
const ERC20_ABI = ["function decimals() external view returns (uint8)"];

const GAS_LIMIT = 800000;
const SLIPPAGE_BPS = 50; // 0.5%
const ORACLE_ADDRESS = "0x0000000000000000000000000000000000000000"; // Oracle disabled for manual trades

async function executeTrade(tradeParams) {
    const { network, tokenA, tokenB, dex1, dex2, loanAmount } = tradeParams;

    if (!process.env.PRIVATE_KEY || !process.env.INFURA_URL || !process.env.ARBITRAGE_BOT_ADDRESS) {
        throw new Error("Server is not configured for execution. Missing environment variables.");
    }

    const provider = new JsonRpcProvider(process.env.INFURA_URL);
    const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
    const arbitrageBot = new Contract(process.env.ARBITRAGE_BOT_ADDRESS, ARBITRAGE_BALANCER_ABI, wallet);

    const dexConfig1 = getDexConfig(dex1);
    const dexConfig2 = getDexConfig(dex2);

    const tokenAContract = new Contract(tokenA, ERC20_ABI, provider);
    const tokenADecimals = await tokenAContract.decimals();
    const loanAmountBigInt = parseUnits(loanAmount, tokenADecimals);
    const profitThresholdAmount = parseUnits('0.001', tokenADecimals); // Minimal profit for manual trade

    const minAmountOutFromFirstSwap = 0; // We accept any amount for manual trade - could be improved

    const flashLoanData = {
        inputToken: tokenA,
        middleToken: tokenB,
        routers: [dexConfig1.router, dexConfig2.router],
        paths: [[tokenA, tokenB], [tokenB, tokenA]],
        minProfit: profitThresholdAmount, 
        minAmountOutFromFirstSwap: minAmountOutFromFirstSwap,
        twapMaxDeviationBps: 0, 
        oracleAddress: ORACLE_ADDRESS,
        factory: dexConfig1.factory
    };

    const userData = new AbiCoder().encode(['(address,address,address[],address[][],uint256,uint256,uint256,address,address)'], [Object.values(flashLoanData)]);

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas;

    const tx = await arbitrageBot.startFlashloan(tokenA, loanAmountBigInt, userData, {
        gasLimit: GAS_LIMIT,
        gasPrice: gasPrice
    });

    console.log(`Manual trade transaction sent! Hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    const eventTopic = arbitrageBot.interface.getEventTopic('FlashLoanExecuted');
    const log = receipt.logs.find(x => x.topics[0] === eventTopic);
    let actualProfit = '0';
    let isProfitable = false;

    if (log) {
        const decodedLog = arbitrageBot.interface.decodeEventLog('FlashLoanExecuted', log.data, log.topics);
        actualProfit = formatUnits(decodedLog.netProfit, tokenADecimals);
        isProfitable = decodedLog.netProfit > 0;
    }

    return {
        isProfitable,
        profit: actualProfit,
        profitToken: tokenA,
        txHash: tx.hash,
    };
}

module.exports = { executeTrade };
