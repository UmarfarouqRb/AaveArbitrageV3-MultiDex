// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter as IUniswapV3SwapRouter} from "v3-periphery/interfaces/ISwapRouter.sol";
import {ISwapRouter as IPancakeV3SwapRouter} from "pancake-v3-periphery/interfaces/ISwapRouter.sol";
import {IUniswapV3Pool} from "lib/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "forge-std/console.sol";

enum DexType {
    UniswapV3,
    Aerodrome,
    PancakeV3
}

struct Swap {
    address router;
    address[] pools;
    address tokenIn;
    address tokenOut;
    DexType dexType;
    uint256 amountIn;
    uint256 amountOut;
    address factory; // This is not used in V3, kept for compatibility
}

contract MultiV3Executor is Ownable {
    error SwapFailed();

    event SwapAttempt(address indexed tokenIn, address indexed tokenOut, uint24 fee);
    event SwapSuccess(address indexed tokenIn, address indexed tokenOut, uint24 fee, uint256 amountOut);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function approveToken(address _token, address _spender, uint256 _amount) internal {
        IERC20(_token).approve(_spender, _amount);
    }

    function _executeSwaps(Swap[] memory _swaps, uint256 _initialAmount) public {
        uint256 nextAmountIn = _initialAmount;
        for (uint256 i = 0; i < _swaps.length; i++) {
            Swap memory currentSwap = _swaps[i];
            uint256 amountToSwap = currentSwap.amountIn > 0 ? currentSwap.amountIn : nextAmountIn;

            if (currentSwap.dexType == DexType.UniswapV3 || currentSwap.dexType == DexType.Aerodrome) {
                nextAmountIn = swapExactInputSingleV3(
                    currentSwap.router,
                    currentSwap.pools[0],
                    currentSwap.tokenIn,
                    currentSwap.tokenOut,
                    amountToSwap,
                    0,
                    address(this),
                    block.timestamp
                );
            } else if (currentSwap.dexType == DexType.PancakeV3) {
                nextAmountIn = swapExactInputSinglePancakeV3(
                    currentSwap.router,
                    currentSwap.pools[0],
                    currentSwap.tokenIn,
                    currentSwap.tokenOut,
                    amountToSwap,
                    0,
                    address(this),
                    block.timestamp
                );
            }
        }
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
            console.log(string(reason));
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

        uint24 fee = IUniswapV3Pool(_pool).fee();
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
            console.log(string(reason));
            revert SwapFailed();
        }
    }
}
