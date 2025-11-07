// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/utils/Pausable.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./UniswapV2TwapOracle.sol";

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
}

contract ArbitrageBalancer is ReentrancyGuard, Pausable {
    address public immutable owner;
    IVault public immutable vault;
    UniswapV2TwapOracle public immutable twapOracle;

    event FlashLoanExecuted(address indexed token, uint256 loanAmount, int256 netProfit);
    event ProfitWithdrawal(address indexed token, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(address _vault, address _twapOracle) {
        owner = msg.sender;
        vault = IVault(_vault);
        twapOracle = UniswapV2TwapOracle(_twapOracle);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function startFlashloan(
        address token,
        uint256 amount,
        bytes calldata userData
    ) external onlyOwner whenNotPaused {
        address[] memory tokens = new address[](1);
        tokens[0] = token;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        vault.flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external nonReentrant {
        _validateFlashLoan(tokens);
        FlashLoanData memory data = abi.decode(userData, (FlashLoanData));
        _validateLoanData(data);

        (uint256 loanAmount, uint256 totalRepayment) = _getLoanDetails(amounts, feeAmounts);

        uint256 amountFromFirstSwap = _executeFirstSwap(data, loanAmount);

        _verifyPrice(data, loanAmount, amountFromFirstSwap);

        uint256 amountFromSecondSwap = _executeSecondSwap(data, amountFromFirstSwap, totalRepayment);

        if (data.twapMaxDeviationBps > 0) {
            twapOracle.update(data.inputToken, data.middleToken);
        }

        _repayLoan(tokens[0], amountFromSecondSwap, totalRepayment);
        
        uint256 profit = amountFromSecondSwap - totalRepayment;
        if (profit > 0) {
            IERC20(tokens[0]).transfer(owner, profit);
        }

        emit FlashLoanExecuted(tokens[0], loanAmount, int256(profit));
    }

    function _validateFlashLoan(address[] calldata tokens) internal view {
        require(msg.sender == address(vault), "Only Balancer Vault can call this function");
        require(tokens.length == 1, "This contract only handles single-token flash loans");
    }

    function _validateLoanData(FlashLoanData memory data) internal pure {
        require(data.inputToken != address(0) && data.middleToken != address(0), "Invalid token address provided");
        require(data.routers.length == 2 && data.routers[0] != address(0) && data.routers[1] != address(0), "Invalid router configuration");
        require(data.paths.length == 2, "Invalid paths configuration");
    }

    function _getLoanDetails(uint256[] calldata amounts, uint256[] calldata feeAmounts) internal pure returns (uint256, uint256) {
        uint256 loanAmount = amounts[0];
        uint256 fee = feeAmounts[0];
        return (loanAmount, loanAmount + fee);
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

    function _verifyPrice(FlashLoanData memory data, uint256 loanAmount, uint256 amountFromFirstSwap) internal view {
        if (data.twapMaxDeviationBps > 0) {
            uint256 twapAmountOut = twapOracle.consult(data.inputToken, loanAmount, data.middleToken);
            uint256 priceDifference = (amountFromFirstSwap > twapAmountOut) ? amountFromFirstSwap - twapAmountOut : twapAmountOut - amountFromFirstSwap;
            require(priceDifference * 10000 / twapAmountOut <= data.twapMaxDeviationBps, "Price deviates too much from TWAP");
        }
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

    function _repayLoan(address loanToken, uint256 amountFromSecondSwap, uint256 totalRepayment) internal {
        require(amountFromSecondSwap >= totalRepayment, "Trade was not profitable after fees");
        IERC20(loanToken).transfer(address(vault), totalRepayment);
    }

    function withdraw(address tokenAddress) external onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.transfer(owner, balance);
            emit ProfitWithdrawal(tokenAddress, balance);
        }
    }
}
