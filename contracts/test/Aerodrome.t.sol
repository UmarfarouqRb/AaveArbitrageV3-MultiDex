// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {MultiV3Executor, SwapV2, DexV2Type} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";

contract AerodromeSwapTest is Test, Constants {
    MultiV3Executor public executor;
    address public owner = 0x7c8999dC9a822c1f0Df42023113EDB4FDd543266;

    function setUp() public {
        vm.createSelectFork("https://mainnet.base.org");
        executor = new MultiV3Executor(owner);
    }

    function test_SingleSwapAerodrome() public {
        uint256 amountIn = 1_000_000_000; // 1000 USDC
        deal(USDC, address(this), amountIn);
        IERC20(USDC).transfer(address(executor), amountIn);

        address[] memory path = new address[](2);
        path[0] = USDC;
        path[1] = WETH;

        bool[] memory stable = new bool[](1);
        stable[0] = false;

        bytes memory routeData = abi.encode(path, stable, AERODROME_FACTORY);

        SwapV2[] memory swaps = new SwapV2[](1);
        swaps[0] = SwapV2({
            router: AERODROME_ROUTER,
            path: path,
            amountIn: amountIn,
            amountOutMin: 0,
            dexType: DexV2Type.AerodromeV2,
            data: routeData
        });

        uint256 wethBalanceBefore = IERC20(WETH).balanceOf(address(executor));
        executor.executeV2Swaps(swaps, amountIn);
        uint256 wethBalanceAfter = IERC20(WETH).balanceOf(address(executor));

        assertGt(wethBalanceAfter, wethBalanceBefore, "WETH balance should have increased after swap");
    }
}
