// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IUniswapV2Router.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockRouter is IUniswapV2Router {
    mapping(bytes32 => uint256) private _amountsOut;
    mapping(address => mapping(address => uint)) public reserves;

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint, //amountAMin,
        uint, //amountBMin,
        address, //to,
        uint //deadline
    ) external override returns (uint, uint, uint) {
        reserves[tokenA][tokenB] += amountADesired;
        reserves[tokenB][tokenA] += amountBDesired;
        return (amountADesired, amountBDesired, 0);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view override returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        if (reserves[path[0]][path[1]] > 0) {
            amounts[1] = (amountIn * reserves[path[1]][path[0]]) / reserves[path[0]][path[1]];
        } else {
            amounts[1] = _amountsOut[keccak256(abi.encodePacked(path, amountIn))];
        }
        return amounts;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override returns (uint256[] memory amounts) {
        amounts = this.getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "MockRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(block.timestamp <= deadline, "MockRouter: EXPIRED");

        // Simulate transfer
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[path.length - 1]).transfer(to, amounts[amounts.length - 1]);
    }

    function setAmountOut(
        address[] calldata path,
        uint256 amountIn,
        uint256 amountOut
    ) external {
        _amountsOut[keccak256(abi.encodePacked(path, amountIn))] = amountOut;
    }

     function WETH() external pure override returns (address) {
        return 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    }

    function factory() external pure override returns (address) {
        return address(0xdead);
    }

    function quote(uint amountA, uint reserveA, uint reserveB) external pure override returns (uint amountB) {
        return (amountA * reserveB) / reserveA;
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure override returns (uint amountOut) {
        return (amountIn * reserveOut) / reserveIn;
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) external pure override returns (uint amountIn) {
        return (amountOut * reserveIn) / reserveOut;
    }

    function getAmountsIn(uint amountOut, address[] calldata path) external view override returns (uint[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[path.length - 1] = amountOut;
        for (uint i = path.length - 1; i > 0; i--) {
            amounts[i-1] = this.getAmountIn(amounts[i], reserves[path[i-1]][path[i]], reserves[path[i]][path[i-1]]);
        }
    }

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable override returns (uint, uint, uint) {
        revert("Not implemented");
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external override returns (uint, uint) {
        revert("Not implemented");
    }

    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external override returns (uint, uint) {
        revert("Not implemented");
    }

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint, uint) {
        revert("Not implemented");
    }

    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint, uint) {
        revert("Not implemented");
    }

    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        revert("Not implemented");
    }

    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        payable
        override
        returns (uint[] memory amounts) {
            revert("Not implemented");
        }

    function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        override
        returns (uint[] memory amounts) {
            revert("Not implemented");
        }

    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        override
        returns (uint[] memory amounts) {
            revert("Not implemented");
        }

    function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        payable
        override
        returns (uint[] memory amounts) {
            revert("Not implemented");
        }
}