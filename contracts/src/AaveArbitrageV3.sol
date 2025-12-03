// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPool as IAaveV3Pool} from "aave-v3-core/contracts/interfaces/IPool.sol";
import {IQuoterV2} from "v3-periphery/interfaces/IQuoterV2.sol";
import {ISwapRouter} from "v3-periphery/interfaces/ISwapRouter.sol";
import {IUniswapV2Router02 as IUniswapV2Router} from "v2-periphery/interfaces/IUniswapV2Router02.sol";
import {IPancakeV3Pool} from "pancake-v3-core/interfaces/IPancakeV3Pool.sol";


struct Route {
    address from;
    address to;
    bool stable;
    address factory;
}

interface IAerodromeRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, Route[] calldata routes) external view returns (uint[] memory amounts);
}

enum SwapStepType {
    V3,
    V2
}

struct SwapStep {
    SwapStepType stepType;
    uint256 index;
}

enum DexV3Type {
    UniswapV3,
    PancakeV3
}

enum DexV2Type {
    UniswapV2,
    AerodromeV2
}

struct SwapV3 {
    address router;
    address pool;
    address tokenIn;
    address tokenOut;
    uint256 amountOutMin;
    DexV3Type dexType;
}

struct SwapV2 {
    address router;
    address[] path;
    uint256 amountOutMin;
    DexV2Type dexType;
    bytes data;
}

error SwapFailed();
error InvalidDexType();

enum SwapResult {
    SUCCESS,
    INSUFFICIENT_PROFIT,
    SWAP_FAILED
}

interface IUniswapV3Pool {
    function fee() external view returns (uint24);
}

contract AaveArbitrageV3 is Ownable {
    using SafeERC20 for IERC20;

    IAaveV3Pool public immutable POOL;

    address public constant MULTISIG = 0x1111111111111111111111111111111111111111;
    uint256 public initiatorFee;

    error InvalidLoanAmount();
    error LoanNotInitiated();
    error InsufficientProfit();

    event ProfitDistribution(address indexed initiator, uint256 initiatorAmount, uint256 multisigAmount);
    event ArbitrageExecuted(SwapResult result, uint256 profit);
    event V3SwapAttempt(address router, DexV3Type dexType, address tokenIn, address tokenOut, uint256 amountIn);
    event V2SwapAttempt(address router, DexV2Type dexType, address tokenIn, address tokenOut, uint256 amountIn);
    event Approve(address token, address spender, uint256 amount);

    constructor(
        IAaveV3Pool _aavePool
    ) Ownable(msg.sender) {
        POOL = _aavePool;
        initiatorFee = 500; // 5%
        transferOwnership(MULTISIG);
    }

    function executeArbitrage(
        address _asset,
        uint256 _amount,
        SwapStep[] calldata _swapPath,
        SwapV3[] calldata _swapsV3,
        SwapV2[] calldata _swapsV2
    ) external {
        if (_amount == 0) {
            revert InvalidLoanAmount();
        }

        bytes memory params = abi.encode(_swapPath, _swapsV3, _swapsV2, msg.sender);
        uint16 referralCode = 0;

        POOL.flashLoanSimple(address(this), _asset, _amount, params, referralCode);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        if (msg.sender != address(POOL)) {
            revert LoanNotInitiated();
        }

        (SwapStep[] memory swapPath, SwapV3[] memory swapsV3, SwapV2[] memory swapsV2, address initiatorAddress) = abi.decode(params, (SwapStep[], SwapV3[], SwapV2[], address));

        uint256 amountToSwap = amount;

        for (uint i = 0; i < swapPath.length; i++) {
            if (swapPath[i].stepType == SwapStepType.V3) {
                SwapV3 memory swap = swapsV3[swapPath[i].index];
                if (i > 0) {
                    amountToSwap = IERC20(swap.tokenIn).balanceOf(address(this));
                }
                if (amountToSwap > 0) {
                    _executeV3Swap(swap, amountToSwap);
                }
            } else if (swapPath[i].stepType == SwapStepType.V2) {
                SwapV2 memory swap = swapsV2[swapPath[i].index];
                if (i > 0) {
                    amountToSwap = IERC20(swap.path[0]).balanceOf(address(this));
                }
                if (amountToSwap > 0) {
                    _executeV2Swap(swap, amountToSwap);
                }
            }
        }

        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 totalRepayAmount = amount + premium;

        if (finalBalance < totalRepayAmount) {
            emit ArbitrageExecuted(SwapResult.INSUFFICIENT_PROFIT, 0);
            revert InsufficientProfit();
        }

        uint256 netProfit = finalBalance - totalRepayAmount;
        
        distributeProfit(asset, netProfit, totalRepayAmount, initiatorAddress);
        return true;
    }

    function _executeV3Swap(SwapV3 memory _swap, uint256 _amountIn) internal {
        IERC20(_swap.tokenIn).forceApprove(_swap.router, _amountIn);
        emit Approve(_swap.tokenIn, _swap.router, _amountIn);
        emit V3SwapAttempt(_swap.router, _swap.dexType, _swap.tokenIn, _swap.tokenOut, _amountIn);

        uint24 fee;
        if (_swap.dexType == DexV3Type.UniswapV3) {
            fee = IUniswapV3Pool(_swap.pool).fee();
        } else if (_swap.dexType == DexV3Type.PancakeV3) {
            fee = IPancakeV3Pool(_swap.pool).fee();
        } else {
            revert InvalidDexType();
        }

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: _swap.tokenIn,
            tokenOut: _swap.tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: _amountIn,
            amountOutMinimum: _swap.amountOutMin,
            sqrtPriceLimitX96: 0
        });
        ISwapRouter(_swap.router).exactInputSingle(params);
    }

    function _executeV2Swap(SwapV2 memory _swap, uint256 _amountIn) internal {
        IERC20(_swap.path[0]).forceApprove(_swap.router, _amountIn);
        emit Approve(_swap.path[0], _swap.router, _amountIn);
        emit V2SwapAttempt(
            _swap.router,
            _swap.dexType,
            _swap.path[0],
            _swap.path[_swap.path.length - 1],
            _amountIn
        );

        if (_swap.dexType == DexV2Type.UniswapV2) {
            try IUniswapV2Router(_swap.router).swapExactTokensForTokens(
                _amountIn,
                _swap.amountOutMin,
                _swap.path,
                address(this),
                block.timestamp
            ) {} catch {
                revert SwapFailed();
            }
        } else if (_swap.dexType == DexV2Type.AerodromeV2) {
            (address[] memory path, bool[] memory stable, address factory) = abi.decode(
                _swap.data,
                (address[], bool[], address)
            );
            Route[] memory routes = new Route[](path.length - 1);
            for (uint i = 0; i < path.length - 1; i++) {
                routes[i] = Route({
                    from: path[i],
                    to: path[i+1],
                    stable: stable[i],
                    factory: factory
                });
            }
            try IAerodromeRouter(_swap.router).swapExactTokensForTokens(
                _amountIn,
                _swap.amountOutMin,
                routes,
                address(this),
                block.timestamp
            ) {} catch {
                revert SwapFailed();
            }
        } else {
            revert InvalidDexType();
        }
    }


    function distributeProfit(address _asset, uint256 _netProfit, uint256 _totalRepayAmount, address _initiator) internal {
        IERC20(_asset).approve(address(POOL), _totalRepayAmount);

        uint256 initiatorAmount = (_netProfit * initiatorFee) / 10000;
        uint256 multisigAmount = _netProfit - initiatorAmount;

        if (initiatorAmount > 0) {
            IERC20(_asset).safeTransfer(_initiator, initiatorAmount);
        }
        if (multisigAmount > 0) {
            IERC20(_asset).safeTransfer(MULTISIG, multisigAmount);
        }

        emit ProfitDistribution(_initiator, initiatorAmount, multisigAmount);
    }

    function setInitiatorFee(uint256 _newFee) external onlyOwner {
        initiatorFee = _newFee;
    }

    function withdraw(address _token) external onlyOwner {
        if (_token == address(0)) {
            payable(owner()).transfer(address(this).balance);
            return;
        }
        IERC20(_token).safeTransfer(owner(), IERC20(_token).balanceOf(address(this)));
    }
    
    receive() external payable {}
}
