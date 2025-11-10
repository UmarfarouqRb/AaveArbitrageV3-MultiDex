# Part 3/3 for Basescan Verification

**Instructions:** Copy the code block below. This is the final part of the flattened source code. After you have pasted all three parts together in Basescan, use the compiler and constructor details at the bottom of this file to complete the verification.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UniswapV2TwapOracle {
    uint32 public constant MIN_UPDATE_DELAY = 10; // 10 seconds

    struct PairData {
        address token0;
        uint32 blockTimestampLast;
        uint price0CumulativeLast;
        uint price1CumulativeLast;
    }

    // factory -> pair -> data
    mapping(address => mapping(address => PairData)) public pairData;

    constructor() {}

    function update(address factory, address tokenA, address tokenB) external {
        address pairAddress = UniswapV2Library.pairFor(factory, tokenA, tokenB);
        PairData storage pair = pairData[factory][pairAddress];

        // require that at least MIN_UPDATE_DELAY has passed since the last update
        require(block.timestamp - pair.blockTimestampLast >= MIN_UPDATE_DELAY, "Oracle: UPDATE_COOLDOWN");

        (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) =
            UniswapV2Library.currentCumulativePrices(pairAddress);

        // if the pair has been updated already in the same block, do nothing
        if (pair.blockTimestampLast == blockTimestamp) {
            return;
        }

        pair.price0CumulativeLast = price0Cumulative;
        pair.price1CumulativeLast = price1Cumulative;
        pair.blockTimestampLast = blockTimestamp;

        if (pair.token0 == address(0)) {
            pair.token0 = IUniswapV2Pair(pairAddress).token0();
        }
    }

    function consult(
        address factory,
        address tokenIn,
        uint amountIn,
        address tokenOut
    ) external view returns (uint amountOut) {
        address pairAddress = UniswapV2Library.pairFor(factory, tokenIn, tokenOut);
        PairData memory pair = pairData[factory][pairAddress];

        require(pair.blockTimestampLast != 0, "Oracle: PAIR_NOT_INITIALIZED");

        (uint price0Cumulative, uint price1Cumulative, ) = UniswapV2Library.currentCumulativePrices(pairAddress);
        uint32 timeElapsed = uint32(block.timestamp) - pair.blockTimestampLast;

        // ensure that there is a last observation and it's not in the same block
        require(timeElapsed > 0, "Oracle: NO_NEW_OBSERVATION");

        uint price0Average = (price0Cumulative - pair.price0CumulativeLast) / timeElapsed;
        uint price1Average = (price1Cumulative - pair.price1CumulativeLast) / timeElapsed;

        if (tokenIn == pair.token0) {
            amountOut = (amountIn * price0Average) / price1Average;
        } else {
            amountOut = (amountIn * price1Average) / price0Average;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}

struct FlashLoanData {
    address inputToken;
    address middleToken;
    address[] routers;
    address[][] paths;
    uint256 minProfit;
    uint256 minAmountOutFromFirstSwap;
    uint256 twapMaxDeviationBps;
    address oracleAddress;
    address factory;
}

contract ArbitrageBalancer is ReentrancyGuard, Pausable {
    address public multiSig;
    IVault public immutable vault;

    mapping(address => bool) public whitelistedRouters;
    uint256 private constant BPS_DIVISOR = 10000;

    event FlashLoanExecuted(address indexed token, uint256 loanAmount, int256 netProfit);
    event ProfitWithdrawal(address indexed token, uint256 amount);
    event RouterAdded(address indexed router);
    event RouterRemoved(address indexed router);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyMultiSig() {
        require(msg.sender == multiSig, "Only multi-sig can call this function");
        _;
    }

    constructor(address _vault, address _multiSig) {
        multiSig = _multiSig;
        vault = IVault(_vault);

        // Whitelist popular Uniswap V2 compatible routers
        whitelistedRouters[0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D] = true; // Uniswap V2
        whitelistedRouters[0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F] = true; // Sushiswap

        emit OwnershipTransferred(address(0), _multiSig);
    }

    function transferOwnership(address newMultiSig) public virtual onlyMultiSig {
        require(newMultiSig != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(multiSig, newMultiSig);
        multiSig = newMultiSig;
    }

    function addRouter(address router) external onlyMultiSig {
        require(router != address(0), "Invalid router address");
        whitelistedRouters[router] = true;
        emit RouterAdded(router);
    }

    function removeRouter(address router) external onlyMultiSig {
        require(router != address(0), "Invalid router address");
        whitelistedRouters[router] = false;
        emit RouterRemoved(router);
    }

    function pause() public onlyMultiSig {
        _pause();
    }

    function unpause() public onlyMultiSig {
        _unpause();
    }

    function startFlashloan(
        address token,
        uint256 amount,
        bytes calldata userData
    ) external whenNotPaused {
        address[] memory tokens = new address[](1);
        tokens[0] = token;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        bytes memory newUserData = abi.encode(msg.sender, userData);
        vault.flashLoan(address(this), tokens, amounts, newUserData);
    }

    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external nonReentrant {
        (address initiator, bytes memory originalUserData) = abi.decode(userData, (address, bytes));

        _validateFlashLoan(tokens);
        FlashLoanData memory data = abi.decode(originalUserData, (FlashLoanData));
        _validateLoanData(data);

        if (data.twapMaxDeviationBps > 0) {
            UniswapV2TwapOracle(data.oracleAddress).update(data.factory, data.inputToken, data.middleToken);
        }

        (uint256 loanAmount, uint256 totalRepayment) = _getLoanDetails(amounts, feeAmounts);

        _verifyPrice(data, loanAmount);

        uint256 amountFromFirstSwap = _executeFirstSwap(data, loanAmount);
        uint256 amountFromSecondSwap = _executeSecondSwap(data, amountFromFirstSwap, totalRepayment);

        int256 netProfit = int256(amountFromSecondSwap) - int256(totalRepayment);
        require(netProfit >= 0, "Trade was not profitable after fees");

        _repayLoan(tokens[0], totalRepayment);

        if (netProfit > 0) {
            IERC20(tokens[0]).transfer(initiator, uint256(netProfit));
        }

        emit FlashLoanExecuted(tokens[0], loanAmount, netProfit);
    }

    function _validateFlashLoan(address[] calldata tokens) internal view {
        require(msg.sender == address(vault), "Only Balancer Vault can call this function");
        require(tokens.length == 1, "This contract only handles single-token flash loans");
    }

    function _validateLoanData(FlashLoanData memory data) internal view {
        require(data.inputToken != address(0) && data.middleToken != address(0), "Invalid token address provided");
        require(data.routers.length == 2 && whitelistedRouters[data.routers[0]] && whitelistedRouters[data.routers[1]], "Invalid router configuration");
        require(data.paths.length == 2, "Invalid paths configuration: must have two paths");
        require(data.paths[0].length == 2, "Invalid paths configuration: path 0 must have two tokens");
        require(data.paths[1].length == 2, "Invalid paths configuration: path 1 must have two tokens");
        require(data.paths[0][0] == data.inputToken, "Invalid paths configuration: path 0 must start with input token");
        require(data.paths[0][1] == data.middleToken, "Invalid paths configuration: path 0 must end with middle token");
        require(data.paths[1][0] == data.middleToken, "Invalid paths configuration: path 1 must start with middle token");
        require(data.paths[1][1] == data.inputToken, "Invalid paths configuration: path 1 must end with input token");
        require(data.oracleAddress != address(0), "Invalid oracle address");
        require(data.factory != address(0), "Invalid factory address");
    }

    function _getLoanDetails(uint256[] calldata amounts, uint256[] calldata feeAmounts) internal pure returns (uint256, uint256) {
        uint256 loanAmount = amounts[0];
        uint256 fee = feeAmounts[0];
        return (loanAmount, loanAmount + fee);
    }

    function _verifyPrice(FlashLoanData memory data, uint256 loanAmount) internal view {
        if (data.twapMaxDeviationBps > 0) {
            uint256 twapAmountOut = UniswapV2TwapOracle(data.oracleAddress).consult(data.factory, data.inputToken, loanAmount, data.middleToken);
            uint256 priceDifference = (data.minAmountOutFromFirstSwap > twapAmountOut) ? data.minAmountOutFromFirstSwap - twapAmountOut : twapAmountOut - data.minAmountOutFromFirstSwap;
            require(priceDifference * BPS_DIVISOR / twapAmountOut <= data.twapMaxDeviationBps, "Price deviates too much from TWAP");
        }
    }

    function _executeFirstSwap(FlashLoanData memory data, uint256 loanAmount) internal returns (uint256) {
        IERC20(data.inputToken).approve(data.routers[0], loanAmount);
        uint[] memory amountsOut = IUniswapV2Router(data.routers[0]).swapExactTokensForTokens(
            loanAmount,
            data.minAmountOutFromFirstSwap, // Slippage protection
            data.paths[0],
            address(this),
            block.timestamp
        );
        return amountsOut[amountsOut.length - 1];
    }

    function _executeSecondSwap(FlashLoanData memory data, uint256 amountFromFirstSwap, uint256 totalRepayment) internal returns (uint256) {
        IERC20(data.middleToken).approve(data.routers[1], amountFromFirstSwap);

        uint256 minAmountOutForRepayment = totalRepayment + data.minProfit;

        uint[] memory amountsOut = IUniswapV2Router(data.routers[1]).swapExactTokensForTokens(
            amountFromFirstSwap,
            minAmountOutForRepayment,
            data.paths[1],
            address(this),
            block.timestamp
        );
        return amountsOut[amountsOut.length - 1];
    }

    function _repayLoan(address loanToken, uint256 totalRepayment) internal {
        IERC20(loanToken).transfer(address(vault), totalRepayment);
    }

    function withdraw(address tokenAddress) external onlyMultiSig {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.transfer(multiSig, balance);
            emit ProfitWithdrawal(tokenAddress, balance);
        }
    }
}
```

---

## Basescan Verification Details

Use the following settings on the Basescan contract verification page.

### Compiler Settings

- **Compiler Type:** Solidity (Single File)
- **Compiler Version:** `v0.8.20+commit.a1b79de6`
- **License:** `MIT`

### Optimization Settings

- **Optimization Enabled:** Yes
- **Runs:** 200 (This is the Foundry default)
- **EVM Version:** `paris` (This is the default for the chosen compiler version)

### Constructor Arguments

Your contract requires two arguments for its constructor:

- `_vault` (address): `0xBA12222222228d8Ba445958a75a0704d566BF2C8`
- `_multiSig` (address): This is the address you provided in your **`MULTISIG_ADDRESS`** environment variable when you ran the `DeployBase.s.sol` script. It is **not** the same as the deployer wallet address that sent the transaction.

After pasting the combined source code and filling in these details, you should be able to successfully verify your contract.
