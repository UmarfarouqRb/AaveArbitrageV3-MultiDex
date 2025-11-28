// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "v3-periphery/interfaces/ISwapRouter.sol";
import {IUniswapV3Pool} from "lib/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IRouter} from "aerodrome-v3/contracts/interfaces/IRouter.sol";
import "forge-std/console.sol";

enum DexType {
    UniswapV3,
    Aerodrome
}

struct Swap {
    address router;
    address[] pools;
    address tokenIn;
    address tokenOut;
    DexType dexType;
    uint256 amountIn;
    uint256 amountOut;
    address factory;
}

contract MultiV3Executor is Ownable {
    error SwapFailed();

    event SwapAttempt(address indexed tokenIn, address indexed tokenOut, uint24 fee);
    event SwapSuccess(address indexed tokenIn, address indexed tokenOut, uint24 fee, uint256 amountOut);
    event AerodromeSwapSuccess(address indexed tokenIn, address indexed tokenOut, uint256 amountOut);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function approveToken(address _token, address _spender, uint256 _amount) internal {
        IERC20(_token).approve(_spender, _amount);
    }

    function _executeSwaps(Swap[] memory _swaps, uint256 _initialAmount) public {
        uint256 nextAmountIn = _initialAmount;
        for (uint256 i = 0; i < _swaps.length; i++) {
            Swap memory currentSwap = _swaps[i];
            uint256 amountToSwap = currentSwap.amountIn > 0 ? currentSwap.amountIn : nextAmountIn;

            if (currentSwap.dexType == DexType.UniswapV3) {
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
            } else if (currentSwap.dexType == DexType.Aerodrome) {
                IRouter.Route[] memory routes = new IRouter.Route[](currentSwap.pools.length);
                for (uint j = 0; j < currentSwap.pools.length; j++) {
                    routes[j] = IRouter.Route({
                        from: j == 0 ? currentSwap.tokenIn : address(0),
                        to: j == currentSwap.pools.length - 1 ? currentSwap.tokenOut : address(0),
                        stable: false,
                        factory: currentSwap.factory
                    });
                }
                nextAmountIn = swapExactInputAerodrome(
                    currentSwap.router,
                    routes,
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
            ISwapRouter(_router).exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
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

    function swapExactInputAerodrome(
        address _router,
        IRouter.Route[] memory _routes,
        uint256 _amountIn,
        uint256 _amountOutMinimum,
        address _recipient,
        uint256 _deadline
    ) internal returns (uint256 amountOut) {
        approveToken(_routes[0].from, _router, _amountIn);

        try
            IRouter(_router).swapExactTokensForTokens(_amountIn, _amountOutMinimum, _routes, _recipient, _deadline)
        returns (uint[] memory amounts) {
            uint256 finalAmountOut = amounts[amounts.length - 1];
            emit AerodromeSwapSuccess(_routes[0].from, _routes[_routes.length - 1].to, finalAmountOut);
            return finalAmountOut;
        } catch (bytes memory reason) {
            console.log(string(reason));
            revert SwapFailed();
        }
    }
}
