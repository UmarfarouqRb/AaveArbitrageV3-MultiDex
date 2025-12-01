// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {MultiV3Executor, SwapV3, DexV3Type} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

contract SwapTest is Test, Constants {
    MultiV3Executor public executor;
    address public owner = 0x7c8999dC9a822c1f0Df42023113EDB4FDd543266;
    uint24 public constant WETH_USDC_FEE_UNISWAP = 500;

    function setUp() public {
        vm.createSelectFork("https://mainnet.base.org");
        executor = new MultiV3Executor(owner);
    }

    function test_SingleSwapUniswapV3() public {
        uint256 amountIn = 10 ether;
        deal(WETH, address(this), amountIn);
        IERC20(WETH).transfer(address(executor), amountIn);

        address expectedPool = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(
            WETH,
            USDC,
            WETH_USDC_FEE_UNISWAP
        );

        SwapV3[] memory swaps = new SwapV3[](1);
        swaps[0] = SwapV3({
            router: UNISWAP_V3_ROUTER,
            pool: expectedPool,
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: amountIn,
            amountOutMin: 0,
            dexType: DexV3Type.UniswapV3
        });

        uint256 usdcBalanceBefore = IERC20(USDC).balanceOf(address(executor));
        executor.executeV3Swaps(swaps, amountIn);
        uint256 usdcBalanceAfter = IERC20(USDC).balanceOf(address(executor));

        assertGt(usdcBalanceAfter, usdcBalanceBefore, "USDC balance should have increased after swap");
    }
}
