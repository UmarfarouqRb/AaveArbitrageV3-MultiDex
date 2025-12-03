// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, SwapV2, DexV3Type} from "../src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IPancakeV3Factory} from "pancake-v3-core/interfaces/IPancakeV3Factory.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract PancakeV3Test is Test, Constants {
    AaveArbitrageV3 public executor;
    uint24 public constant WETH_USDC_FEE = 500; // 0.05%

    function setUp() public {
        vm.createSelectFork("base");
        executor = new AaveArbitrageV3(IPool(AAVE_V3_POOL));
    }

    function test_RoundTripPancakeV3() public {
        uint256 amountToBorrow = 10000e6; // 10,000 USDC

        // 1. Swap USDC for WETH on PancakeV3
        address pool1 = IPancakeV3Factory(PANCAKESWAP_V3_FACTORY).getPool(USDC, WETH, WETH_USDC_FEE);
        SwapV3 memory swap1 = SwapV3({
            router: PANCAKESWAP_V3_ROUTER,
            pool: pool1,
            tokenIn: USDC,
            tokenOut: WETH,
            amountOutMin: 0,
            dexType: DexV3Type.PancakeV3
        });

        // 2. Swap WETH for USDC on PancakeV3
        address pool2 = IPancakeV3Factory(PANCAKESWAP_V3_FACTORY).getPool(WETH, USDC, WETH_USDC_FEE);
        SwapV3 memory swap2 = SwapV3({
            router: PANCAKESWAP_V3_ROUTER,
            pool: pool2,
            tokenIn: WETH,
            tokenOut: USDC,
            amountOutMin: 0,
            dexType: DexV3Type.PancakeV3
        });

        SwapV3[] memory swapsV3 = new SwapV3[](2);
        swapsV3[0] = swap1;
        swapsV3[1] = swap2;
        
        SwapV2[] memory swapsV2 = new SwapV2[](0);

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V3, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V3, index: 1 });

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
    
    function test_MultiLegV3RoundTrip() public {
        uint256 amountToBorrow = 10000e6; // 10,000 USDC

        address pool1 = IPancakeV3Factory(PANCAKESWAP_V3_FACTORY).getPool(USDC, WETH, WETH_USDC_FEE);
        SwapV3 memory swap1 = SwapV3({
            router: UNISWAP_V3_ROUTER, // This is actually the PancakeV3 router address in Constants.sol
            pool: pool1,
            tokenIn: USDC,
            tokenOut: WETH,
            amountOutMin: 0,
            dexType: DexV3Type.PancakeV3 // Using PancakeV3 logic as Uniswap V3 isn't on Base
        });

        address pool2 = IPancakeV3Factory(PANCAKESWAP_V3_FACTORY).getPool(WETH, USDC, WETH_USDC_FEE);
        SwapV3 memory swap2 = SwapV3({
            router: PANCAKESWAP_V3_ROUTER,
            pool: pool2,
            tokenIn: WETH,
            tokenOut: USDC,
            amountOutMin: 0,
            dexType: DexV3Type.PancakeV3
        });

        SwapV3[] memory swapsV3 = new SwapV3[](2);
        swapsV3[0] = swap1;
        swapsV3[1] = swap2;

        SwapV2[] memory swapsV2 = new SwapV2[](0);

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V3, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V3, index: 1 });

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
