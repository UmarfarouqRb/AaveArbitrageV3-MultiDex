
const { JsonRpcProvider, Contract, parseUnits, formatUnits } = require('ethers');
const { getDexConfig } = require('./utils'); // We will create this util file next
const ROUTER_ABI = ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'];
const ERC20_ABI = ["function decimals() external view returns (uint8)"];

async function simulateTrade(tradeParams) {
    const { network, tokenA, tokenB, dex1, dex2, loanAmount } = tradeParams;

    if (!tokenA || !tokenB || !dex1 || !dex2 || !loanAmount) {
        throw new Error("Missing required simulation parameters.");
    }

    // We will need to create a function to get network-specific info
    const provider = new JsonRpcProvider(process.env.INFURA_URL); 
    const dexConfig1 = getDexConfig(dex1);
    const dexConfig2 = getDexConfig(dex2);

    const tokenAContract = new Contract(tokenA, ERC20_ABI, provider);
    const tokenADecimals = await tokenAContract.decimals();
    const loanAmountBigInt = parseUnits(loanAmount, tokenADecimals);

    const router1 = new Contract(dexConfig1.router, ROUTER_ABI, provider);
    const amountsOut1 = await router1.getAmountsOut(loanAmountBigInt, [tokenA, tokenB]);
    const amountOutFromFirstSwap = amountsOut1[1];

    const router2 = new Contract(dexConfig2.router, ROUTER_ABI, provider);
    const finalAmountsOut = await router2.getAmountsOut(amountOutFromFirstSwap, [tokenB, tokenA]);
    const simulatedFinalAmount = finalAmountsOut[1];

    const netProfit = simulatedFinalAmount - loanAmountBigInt;
    const estimatedProfit = formatUnits(netProfit, tokenADecimals);

    const isProfitable = netProfit > 0;

    return {
        isProfitable,
        estimatedProfit,
        profitToken: tokenA, // Profit is calculated in the borrowed token
    };
}

module.exports = { simulateTrade };
