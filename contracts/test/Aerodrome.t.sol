// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, SwapV2, DexV2Type} from "../src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract AerodromeSwapTest is Test, Constants {
    AaveArbitrageV3 public executor;

    function setUp() public {
        vm.createSelectFork("base");
        executor = new AaveArbitrageV3(IPool(AAVE_V3_POOL));
    }

    function test_RoundTripAerodrome() public {
        uint256 amountToBorrow = 10000e6; // 10,000 USDC

        // 1. Swap USDC for WETH on Aerodrome
        address[] memory path1 = new address[](2);
        path1[0] = USDC;
        path1[1] = WETH;
        bool[] memory stable1 = new bool[](1);
        stable1[0] = false; // volatile pool
        bytes memory routeData1 = abi.encode(path1, stable1, AERODROME_FACTORY);
        SwapV2 memory swap1 = SwapV2({
            router: AERODROME_ROUTER,
            path: path1,
            amountOutMin: 0,
            dexType: DexV2Type.AerodromeV2,
            data: routeData1
        });

        // 2. Swap WETH for USDC on Aerodrome
        address[] memory path2 = new address[](2);
        path2[0] = WETH;
        path2[1] = USDC;
        bool[] memory stable2 = new bool[](1);
        stable2[0] = false; // volatile pool
        bytes memory routeData2 = abi.encode(path2, stable2, AERODROME_FACTORY);
        SwapV2 memory swap2 = SwapV2({
            router: AERODROME_ROUTER,
            path: path2,
            amountOutMin: 0,
            dexType: DexV2Type.AerodromeV2,
            data: routeData2
        });

        SwapV3[] memory swapsV3 = new SwapV3[](0);
        SwapV2[] memory swapsV2 = new SwapV2[](2);
        swapsV2[0] = swap1;
        swapsV2[1] = swap2;

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V2, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V2, index: 1 });

        bytes memory expectedError = abi.encodeWithSelector(AaveArbitrageV3.InsufficientProfit.selector);
        vm.expectRevert(expectedError);

        executor.executeArbitrage(
            USDC,
            amountToBorrow,
            swapPath,
            swapsV3,
            swapsV2
        );
    }
}
