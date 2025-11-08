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
    address public immutable multiSig;
    IVault public immutable vault;
    UniswapV2TwapOracle public immutable twapOracle;

    mapping(address => bool) public whitelistedRouters;
    uint256 private constant BPS_DIVISOR = 10000;

    event FlashLoanExecuted(address indexed token, uint256 loanAmount, int256 netProfit);
    event ProfitWithdrawal(address indexed token, uint256 amount);
    event RouterAdded(address indexed router);
    event RouterRemoved(address indexed router);

    modifier onlyMultiSig() {
        require(msg.sender == multiSig, "Only multi-sig can call this function");
        _;
    }

    constructor(address _vault, address _twapOracle) {
        multiSig = 0x7D948Ca4D146Fc4fBD667060EB6D4bfD16fCa2f6;
        vault = IVault(_vault);
        twapOracle = UniswapV2TwapOracle(_twapOracle);

        // Whitelist popular Uniswap V2 compatible routers
        whitelistedRouters[0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D] = true; // Uniswap V2
        whitelistedRouters[0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F] = true; // Sushiswap
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

        (uint256 loanAmount, uint256 totalRepayment) = _getLoanDetails(amounts, feeAmounts);

        uint256 amountFromFirstSwap = _executeFirstSwap(data, loanAmount);

        _verifyPrice(data, loanAmount, amountFromFirstSwap);

        uint256 amountFromSecondSwap = _executeSecondSwap(data, amountFromFirstSwap, totalRepayment);

        if (data.twapMaxDeviationBps > 0) {
            twapOracle.update(data.inputToken, data.middleToken);
        }

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
            require(priceDifference * BPS_DIVISOR / twapAmountOut <= data.twapMaxDeviationBps, "Price deviates too much from TWAP");
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