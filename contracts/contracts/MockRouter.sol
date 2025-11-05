// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IUniswapV2Router.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockRouter is IUniswapV2Router {
    mapping(bytes32 => uint256) private _amountsOut;

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view override returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[1] = _amountsOut[keccak256(abi.encodePacked(path, amountIn))];
        return amounts;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[1] = _amountsOut[keccak256(abi.encodePacked(path, amountIn))];
        require(amounts[1] >= amountOutMin, "MockRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(block.timestamp <= deadline, "MockRouter: EXPIRED");

        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).transfer(to, amounts[1]);
    }

    function setAmountOut(
        address[] calldata path,
        uint256 amountIn,
        uint256 amountOut
    ) external {
        _amountsOut[keccak256(abi.encodePacked(path, amountIn))] = amountOut;
    }

     function WETH() external pure override returns (address) {
        return address(0);
    }

    function factory() external pure override returns (address) {
        return address(0);
    }

    function getAmountIn(uint /*amountOut*/, uint /*reserveIn*/, uint /*reserveOut*/) external pure override returns (uint /*amountIn*/) {
        revert("Not implemented");
    }

    function getAmountOut(uint /*amountIn*/, uint /*reserveIn*/, uint /*reserveOut*/) external pure override returns (uint /*amountOut*/) {
        revert("Not implemented");
    }

    function getAmountsIn(uint /*amountOut*/, address[] calldata /*path*/) external pure override returns (uint[] memory /*amounts*/) {
        revert("Not implemented");
    }

    function quote(uint /*amountA*/, uint /*reserveA*/, uint /*reserveB*/) external pure override returns (uint /*amountB*/) {
        revert("Not implemented");
    }

    // The following functions are not used in this test, but are required by the interface

    function swapETHForExactTokens(uint /*amountOut*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external payable override returns (uint[] memory /*amounts*/) { revert("Not implemented"); }
    function swapExactETHForTokens(uint /*amountOutMin*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external payable override returns (uint[] memory /*amounts*/) { revert("Not implemented"); }
    function swapExactTokensForETH(uint /*amountIn*/, uint /*amountOutMin*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external pure override returns (uint[] memory /*amounts*/) { revert("Not implemented"); }
    function swapTokensForExactETH(uint /*amountOut*/, uint /*amountInMax*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external pure override returns (uint[] memory /*amounts*/) { revert("Not implemented"); }
    function swapTokensForExactTokens(uint /*amountOut*/, uint /*amountInMax*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external pure override returns (uint[] memory /*amounts*/) { revert("Not implemented"); }
    function addLiquidity(address /*tokenA*/, address /*tokenB*/, uint /*amountADesired*/, uint /*amountBDesired*/, uint /*amountAMin*/, uint /*amountBMin*/, address /*to*/, uint /*deadline*/) external pure override returns (uint, uint, uint) { revert("Not implemented"); }
    function addLiquidityETH(address /*token*/, uint /*amountTokenDesired*/, uint /*amountTokenMin*/, uint /*amountETHMin*/, address /*to*/, uint /*deadline*/) external payable override returns (uint, uint, uint) { revert("Not implemented"); }
    function removeLiquidity(address /*tokenA*/, address /*tokenB*/, uint /*liquidity*/, uint /*amountAMin*/, uint /*amountBMin*/, address /*to*/, uint /*deadline*/) external pure override returns (uint, uint) { revert("Not implemented"); }
    function removeLiquidityETH(address /*token*/, uint /*liquidity*/, uint /*amountTokenMin*/, uint /*amountETHMin*/, address /*to*/, uint /*deadline*/) external pure override returns (uint, uint) { revert("Not implemented"); }
    function removeLiquidityWithPermit(address /*tokenA*/, address /*tokenB*/, uint /*liquidity*/, uint /*amountAMin*/, uint /*amountBMin*/, address /*to*/, uint /*deadline*/, bool /*approveMax*/, uint8 /*v*/, bytes32 /*r*/, bytes32 /*s*/) external pure override returns (uint, uint) { revert("Not implemented"); }
    function removeLiquidityETHWithPermit(address /*token*/, uint /*liquidity*/, uint /*amountTokenMin*/, uint /*amountETHMin*/, address /*to*/, uint /*deadline*/, bool /*approveMax*/, uint8 /*v*/, bytes32 /*r*/, bytes32 /*s*/) external pure override returns (uint, uint) { revert("Not implemented"); }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint /*amountIn*/, uint /*amountOutMin*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external pure override { revert("Not implemented"); }
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint /*amountOutMin*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external payable override { revert("Not implemented"); }
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint /*amountIn*/, uint /*amountOutMin*/, address[] calldata /*path*/, address /*to*/, uint /*deadline*/) external pure override { revert("Not implemented"); }
    function removeLiquidityETHSupportingFeeOnTransferTokens(address /*token*/, uint /*liquidity*/, uint /*amountTokenMin*/, uint /*amountETHMin*/, address /*to*/, uint /*deadline*/) external pure override returns (uint /*amountETH*/) { revert("Not implemented"); }
    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address /*token*/, uint /*liquidity*/, uint /*amountTokenMin*/, uint /*amountETHMin*/, address /*to*/, uint /*deadline*/, bool /*approveMax*/, uint8 /*v*/, bytes32 /*r*/, bytes32 /*s*/) external pure override returns (uint /*amountETH*/) { revert("Not implemented"); }

}
