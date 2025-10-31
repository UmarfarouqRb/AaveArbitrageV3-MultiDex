// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
ArbitrageBalancer updated to integrate UniswapV2TwapOracle check.
- Caller provides minTwap in userData; if non-zero, contract queries oracle.consult and requires result >= minTwap.
Note: oracle.consult uses owner-updated cumulative; ensure oracle.update() is called regularly by off-chain agent.
*/

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

interface ITWAP {
    function consult(uint256 amountIn) external view returns (uint256 amountOut);
}

contract ArbitrageBalancer is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable owner;
    IVault public immutable vault;
    bool public paused;
    address public oracle; // TWAP oracle address

    event FlashLoanExecuted(address[] tokens, uint256[] amounts, uint256[] feeAmounts, int256 netProfit);

    modifier onlyOwner() { require(msg.sender == owner, "only owner"); _; }
    modifier notPaused() { require(!paused, "paused"); _; }

    constructor(address _vault, address _oracle) {
        owner = msg.sender;
        vault = IVault(_vault);
        oracle = _oracle;
        paused = false;
    }

    function setPaused(bool p) external onlyOwner { paused = p; }
    function setOracle(address o) external onlyOwner { oracle = o; }

    function startFlashloan(address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external onlyOwner {
        vault.flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata feeAmounts, bytes calldata userData) external nonReentrant notPaused {
        require(msg.sender == address(vault), "only vault");

        (
            address inputToken,
            address middleToken,
            address outputToken,
            address[] memory routers,
            address[][] memory paths,
            uint256 minOutsSecondSwap,
            uint256 minTwap
        ) = abi.decode(userData, (address, address, address, address[], address[][], uint256, uint256));

        require(routers.length >= 2 && paths.length >= 2 && amounts.length >= 1, "bad input");

        uint256 loanAmount = amounts[0];
        uint256 fee = feeAmounts.length >= 1 ? feeAmounts[0] : 0;

        // TWAP check: if minTwap > 0, consult oracle
        if(minTwap > 0){
            require(oracle != address(0), "no oracle");
            uint256 oracleOut = ITWAP(oracle).consult(loanAmount);
            require(oracleOut >= minTwap, "twap check failed");
        }

        // Approve router 0
        if (inputToken != address(0)) {
            IERC20(inputToken).safeApprove(routers[0], 0);
            IERC20(inputToken).safeApprove(routers[0], loanAmount);
        }

        uint256 amountAfterFirstSwap;
        {
            IUniswapV2Router routerA = IUniswapV2Router(routers[0]);
            uint deadline = block.timestamp + 300;
            uint[] memory amountsOut = routerA.swapExactTokensForTokens(loanAmount, 1, paths[0], address(this), deadline);
            amountAfterFirstSwap = amountsOut[amountsOut.length - 1];
        }

        if (outputToken != address(0)) {
            IERC20(outputToken).safeApprove(routers[1], 0);
            IERC20(outputToken).safeApprove(routers[1], amountAfterFirstSwap);
        }

        uint256 amountAfterSecondSwap;
        {
            IUniswapV2Router routerB = IUniswapV2Router(routers[1]);
            uint deadline = block.timestamp + 300;
            uint[] memory amountsOut2 = routerB.swapExactTokensForTokens(amountAfterFirstSwap, minOutsSecondSwap, paths[1], address(this), deadline);
            amountAfterSecondSwap = amountsOut2[amountsOut2.length - 1];
        }

        int256 net = int256(amountAfterSecondSwap) - int256(loanAmount + fee);
        IERC20(inputToken).safeTransfer(address(vault), loanAmount + fee);
        emit FlashLoanExecuted(tokens, amounts, feeAmounts, net);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
