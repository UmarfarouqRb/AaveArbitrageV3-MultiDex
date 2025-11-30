// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter as IUniswapV3SwapRouter} from "v3-periphery/interfaces/ISwapRouter.sol";
import {ISwapRouter as IPancakeV3SwapRouter} from "pancake-v3-periphery/interfaces/ISwapRouter.sol";
import {IUniswapV3Pool} from "lib/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IUniswapV2Router} from "contracts/interfaces/IUniswapV2Router.sol";
import "forge-std/console.sol";

enum DexV3Type {
    UniswapV3,
    PancakeV3
}

enum DexV2Type {
    UniswapV2,
    PancakeSwapV2,
    SushiV2,
    AerodromeV2,
    BaseswapV2
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
}

contract MultiV3Executor is Ownable {
    error SwapFailed();

    event SwapAttempt(address indexed tokenIn, address indexed tokenOut, uint24 fee);
    event SwapSuccess(address indexed tokenIn, address indexed tokenOut, uint24 fee, uint256 amountOut);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function approveToken(address _token, address _spender, uint256 _amount) internal {
        IERC20(_token).approve(_spender, _amount);
    }

    function _executeV3Swaps(SwapV3[] memory _swaps, uint256 _initialAmount) public returns (uint256) {
        console.log("--- V3 Swaps ---");
        uint256 nextAmountIn = _initialAmount;
        for (uint256 i = 0; i < _swaps.length; i++) {
            SwapV3 memory currentSwap = _swaps[i];
            uint256 amountToSwap = currentSwap.amountIn > 0 ? currentSwap.amountIn : nextAmountIn;
            console.log("V3 Swap %d", i);
            console.log("  Router: %s", address(currentSwap.router));
            console.log("  Pool: %s", address(currentSwap.pool));
            console.log("  Token In: %s", address(currentSwap.tokenIn));
            console.log("  Token Out: %s", address(currentSwap.tokenOut));
            console.log("  Amount In: %d", amountToSwap);

            if (currentSwap.dexType == DexV3Type.UniswapV3) {
                nextAmountIn = swapExactInputSingleV3(
                    currentSwap.router,
                    currentSwap.pool,
                    currentSwap.tokenIn,
                    currentSwap.tokenOut,
                    amountToSwap,
                    currentSwap.amountOutMin,
                    address(this),
                    block.timestamp
                );
            } else if (currentSwap.dexType == DexV3Type.PancakeV3) {
                nextAmountIn = swapExactInputSinglePancakeV3(
                    currentSwap.router,
                    currentSwap.pool,
                    currentSwap.tokenIn,
                    currentSwap.tokenOut,
                    amountToSwap,
                    currentSwap.amountOutMin,
                    address(this),
                    block.timestamp
                );
            }
            console.log("  Amount Out: %d", nextAmountIn);
        }
        return nextAmountIn;
    }

    function _executeV2Swaps(SwapV2[] memory _swaps, uint256 _initialAmount) public returns (uint256) {
        console.log("--- V2 Swaps ---");
        uint256 nextAmountIn = _initialAmount;
        for (uint256 i = 0; i < _swaps.length; i++) {
            SwapV2 memory currentSwap = _swaps[i];
            uint256 amountToSwap = currentSwap.amountIn > 0 ? currentSwap.amountIn : nextAmountIn;
            console.log("V2 Swap %d", i);
            console.log("  Router: %s", address(currentSwap.router));
            console.log("  Path: %s -> %s", currentSwap.path[0], currentSwap.path[1]);
            console.log("  Amount In: %d", amountToSwap);

            nextAmountIn = swapExactTokensForTokensV2(
                currentSwap.router,
                amountToSwap,
                currentSwap.amountOutMin,
                currentSwap.path,
                address(this),
                block.timestamp
            );
            console.log("  Amount Out: %d", nextAmountIn);
        }
        return nextAmountIn;
    }

    function swapExactTokensForTokensV2(
        address router,
        uint amountIn,
        uint amountOutMin,
        address[] memory path,
        address to,
        uint deadline
    ) internal returns (uint) {
        approveToken(path[0], router, amountIn);
        uint[] memory amounts = IUniswapV2Router(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            to,
            deadline
        );
        return amounts[amounts.length - 1];
    }

    function swapExactInputSingleV3(
        address _router,
        address _pool,
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMinimum,
        address _recipient,
        uint256 _deadline
    ) internal returns (uint256 amountOut) {
        approveToken(_tokenIn, _router, _amountIn);

        uint24 fee = IUniswapV3Pool(_pool).fee();
        emit SwapAttempt(_tokenIn, _tokenOut, fee);

        try
            IUniswapV3SwapRouter(_router).exactInputSingle(
                IUniswapV3SwapRouter.ExactInputSingleParams({
                    tokenIn: _tokenIn,
                    tokenOut: _tokenOut,
                    fee: fee,
                    recipient: _recipient,
                    deadline: _deadline,
                    amountIn: _amountIn,
                    amountOutMinimum: _amountOutMinimum,
                    sqrtPriceLimitX96: 0
                })
            )
        returns (uint256 result) {
            emit SwapSuccess(_tokenIn, _tokenOut, fee, result);
            return result;
        } catch (bytes memory reason) {
            console.logBytes(reason);
            revert SwapFailed();
        }
    }

    function swapExactInputSinglePancakeV3(
        address _router,
        address _pool,
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMinimum,
        address _recipient,
        uint256 _deadline
    ) internal returns (uint256 amountOut) {
        approveToken(_tokenIn, _router, _amountIn);

        uint24 fee = 500;
        emit SwapAttempt(_tokenIn, _tokenOut, fee);

        try
            IPancakeV3SwapRouter(_router).exactInputSingle(
                IPancakeV3SwapRouter.ExactInputSingleParams({
                    tokenIn: _tokenIn,
                    tokenOut: _tokenOut,
                    fee: fee,
                    recipient: _recipient,
                    deadline: _deadline,
                    amountIn: _amountIn,
                    amountOutMinimum: _amountOutMinimum,
                    sqrtPriceLimitX96: 0
                })
            )
        returns (uint256 result) {
            emit SwapSuccess(_tokenIn, _tokenOut, fee, result);
            return result;
        } catch (bytes memory reason) {
            console.logBytes(reason);
            revert SwapFailed();
        }
    }
}
