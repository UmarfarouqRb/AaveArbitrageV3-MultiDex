// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPool as IAaveV3Pool, IPoolAddressesProvider} from "aave-v3-core/contracts/interfaces/IPool.sol";
import {FlashLoanSimpleReceiverBase} from "aave-v3-core/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {ISwapRouter} from "v3-periphery/interfaces/ISwapRouter.sol";
import {IUniswapV2Router02 as IUniswapV2Router} from "v2-periphery/interfaces/IUniswapV2Router02.sol";

import {MultiV3Executor, SwapV3, SwapV2} from "./MultiV3Executor.sol";

enum SwapResult {
    SUCCESS,
    INSUFFICIENT_PROFIT,
    SWAP_FAILED
}

contract AaveArbitrageV3 is FlashLoanSimpleReceiverBase, Ownable {
    using SafeERC20 for IERC20;

    MultiV3Executor internal immutable executor;
    address public keeper;
    uint256 public keeperFee;

    error InvalidLoanAmount();
    error NotKeeper();
    error LoanNotInitiated();
    error InsufficientProfit();

    event ProfitDistribution(address indexed keeper, uint256 keeperAmount, uint256 ownerAmount);
    event ArbitrageExecuted(SwapResult result, uint256 profit);

    modifier onlyKeeper() {
        if (msg.sender != keeper) {
            revert NotKeeper();
        }
        _;
    }

    constructor(
        IPoolAddressesProvider _aavePoolAddressProvider,
        address payable _executor,
        address _owner,
        address _keeper
    ) FlashLoanSimpleReceiverBase(_aavePoolAddressProvider) Ownable(_owner) {
        executor = MultiV3Executor(_executor);
        keeper = _keeper;
        keeperFee = 500; // 5%
    }

    function executeArbitrage(
        address _asset,
        uint256 _amount,
        SwapV3[] calldata _swapsV3,
        SwapV2[] calldata _swapsV2
    ) external onlyKeeper {
        if (_amount == 0) {
            revert InvalidLoanAmount();
        }

        bytes memory params = abi.encode(_swapsV3, _swapsV2, msg.sender);
        uint16 referralCode = 0;

        POOL.flashLoanSimple(address(this), _asset, _amount, params, referralCode);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (initiator != address(this)) {
            revert LoanNotInitiated();
        }

        (SwapV3[] memory swapsV3, SwapV2[] memory swapsV2, ) = abi.decode(params, (SwapV3[], SwapV2[], address));

        uint256 initialBalance = IERC20(asset).balanceOf(address(this));

        executor.executeV3Swaps(swapsV3, amount);
        executor.executeV2Swaps(swapsV2, 0);

        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 profit = finalBalance - initialBalance;

        if (profit < premium) {
            emit ArbitrageExecuted(SwapResult.INSUFFICIENT_PROFIT, profit);
            revert InsufficientProfit();
        }

        distributeProfit(asset, profit, premium);
        return true;
    }

    function distributeProfit(address _asset, uint256 _profit, uint256 _premium) internal {
        uint256 totalRepayAmount = _profit + _premium;
        uint256 netProfit = _profit - _premium;

        uint256 keeperAmount = (netProfit * keeperFee) / 10000;
        uint256 ownerAmount = netProfit - keeperAmount;

        IERC20(_asset).approve(address(POOL), totalRepayAmount);

        if (keeperAmount > 0) {
            IERC20(_asset).safeTransfer(keeper, keeperAmount);
        }
        if (ownerAmount > 0) {
            IERC20(_asset).safeTransfer(owner(), ownerAmount);
        }

        emit ProfitDistribution(keeper, keeperAmount, ownerAmount);
    }

    function setKeeper(address _newKeeper) external onlyOwner {
        keeper = _newKeeper;
    }

    function setKeeperFee(uint256 _newFee) external onlyOwner {
        keeperFee = _newFee;
    }

    function withdraw(address _token) external onlyOwner {
        if (_token == address(0)) {
            payable(owner()).transfer(address(this).balance);
            return;
        }
        IERC20(_token).safeTransfer(owner(), IERC20(_token).balanceOf(address(this)));
    }
}
