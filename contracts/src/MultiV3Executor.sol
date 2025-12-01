// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
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
    uint256 amountIn;
    uint256 amountOutMin;
    DexV3Type dexType;
}

struct SwapV2 {
    address router;
    address[] path;
    uint256 amountIn;
    uint256 amountOutMin;
    DexV2Type dexType;
    bytes data;
}

error SwapFailed();
error InvalidDexType();

contract MultiV3Executor is Ownable {
    using SafeERC20 for IERC20;

    event V3SwapAttempt(address router, DexV3Type dexType, address tokenIn, address tokenOut, uint256 amountIn);
    event V2SwapAttempt(address router, DexV2Type dexType, address tokenIn, address tokenOut, uint256 amountIn);
    event Approve(address token, address spender, uint256 amount);

    constructor(address _newOwner) Ownable(_newOwner) {}

    function executeV3Swaps(SwapV3[] memory _swaps, uint256 _initialAmount) public payable {
        uint256 amountToSwap = _initialAmount;

        for (uint256 i = 0; i < _swaps.length; i++) {
            if (i > 0) {
                amountToSwap = IERC20(_swaps[i].tokenIn).balanceOf(address(this));
            }
            if (amountToSwap > 0) {
                _executeV3Swap(_swaps[i], amountToSwap);
            }
        }
    }

    function _executeV3Swap(SwapV3 memory _swap, uint256 _amountIn) internal {
        IERC20(_swap.tokenIn).forceApprove(_swap.router, _amountIn);
        emit Approve(_swap.tokenIn, _swap.router, _amountIn);
        emit V3SwapAttempt(_swap.router, _swap.dexType, _swap.tokenIn, _swap.tokenOut, _amountIn);

        if (_swap.dexType == DexV3Type.UniswapV3) {
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                tokenIn: _swap.tokenIn,
                tokenOut: _swap.tokenOut,
                fee: IPancakeV3Pool(_swap.pool).fee(),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: _swap.amountOutMin,
                sqrtPriceLimitX96: 0
            });
            ISwapRouter(_swap.router).exactInputSingle(params);
        } else if (_swap.dexType == DexV3Type.PancakeV3) {
            ISwapRouter.ExactInputSingleParams memory pancakeParams = ISwapRouter.ExactInputSingleParams({
                tokenIn: _swap.tokenIn,
                tokenOut: _swap.tokenOut,
                fee: IPancakeV3Pool(_swap.pool).fee(),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: _swap.amountOutMin,
                sqrtPriceLimitX96: 0
            });
            ISwapRouter(_swap.router).exactInputSingle(pancakeParams);
        } else {
            revert InvalidDexType();
        }
    }

    function executeV2Swaps(SwapV2[] memory _swaps, uint256 _initialAmount) public payable {
        uint256 amountToSwap = _initialAmount;
        for (uint256 i = 0; i < _swaps.length; i++) {
            if (i > 0) {
                amountToSwap = IERC20(_swaps[i].path[0]).balanceOf(address(this));
            }
            if (amountToSwap > 0) {
                _executeV2Swap(_swaps[i], amountToSwap);
            }
        }
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

    function withdraw(address _token) external onlyOwner {
        if (_token == address(0)) {
            payable(owner()).transfer(address(this).balance);
            return;
        }
        IERC20(_token).safeTransfer(owner(), IERC20(_token).balanceOf(address(this)));
    }

    receive() external payable {}
}
