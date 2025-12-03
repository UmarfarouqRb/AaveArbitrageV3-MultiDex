// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, DexV3Type, SwapV2, DexV2Type} from "../src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract SushiswapV2Test is Test, Constants {
    AaveArbitrageV3 public executor;
    address public initiator = 0xC3f2c61C4836Afeb9Ae601c91F6FE661df3D634E;

    function setUp() public {
        vm.createSelectFork("base");
        executor = new AaveArbitrageV3(IPool(AAVE_V3_POOL));
    }

    function test_RoundTripSushiswapV2() public {
        uint256 loanAmount = 10000e6; // 10,000 USDC
        uint256 simulatedProfit = 100e6; // 100 USDC

        address[] memory path = new address[](2);
        path[0] = USDC;
        path[1] = WETH;

        SwapV2[] memory swapsV2 = new SwapV2[](2);
        swapsV2[0] = SwapV2({
            router: SUSHISWAP_V2_ROUTER,
            path: path,
            amountOutMin: 0,
            dexType: DexV2Type.SushiswapV2,
            data: bytes("")
        });

        address[] memory path2 = new address[](2);
        path2[0] = WETH;
        path2[1] = USDC;

        swapsV2[1] = SwapV2({
            router: SUSHISWAP_V2_ROUTER,
            path: path2,
            amountOutMin: 0,
            dexType: DexV2Type.SushiswapV2,
            data: bytes("")
        });

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V2, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V2, index: 1 });

        deal(USDC, address(executor), loanAmount + simulatedProfit);

        uint256 initiatorBalanceBefore = IERC20(USDC).balanceOf(initiator);

        vm.prank(initiator);
        executor.executeArbitrage(USDC, loanAmount, swapPath, new SwapV3[](0), swapsV2);

        uint256 initiatorBalanceAfter = IERC20(USDC).balanceOf(initiator);

        assertGt(initiatorBalanceAfter, initiatorBalanceBefore, "Initiator should have received a fee");
    }
}
