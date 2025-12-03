// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, SwapV2, DexV3Type} from "../src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract UniswapV3Test is Test, Constants {
    AaveArbitrageV3 public executor;
    uint24 public constant WETH_USDC_FEE = 500;
    address public initiator = 0xC3f2c61C4836Afeb9Ae601c91F6FE661df3D634E;


    function setUp() public {
        vm.createSelectFork("base");
        executor = new AaveArbitrageV3(IPool(AAVE_V3_POOL));
    }

    function test_RoundTripUniswapV3() public {
        uint256 amountToBorrow = 10000e6; // 10,000 USDC
        uint256 simulatedProfit = 100e6; // 100 USDC

        // 1. Swap USDC for WETH on Uniswap V3
        address pool1 = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(USDC, WETH, WETH_USDC_FEE);
        SwapV3 memory swap1 = SwapV3({
            router: UNISWAP_V3_ROUTER,
            pool: pool1,
            tokenIn: USDC,
            tokenOut: WETH,
            amountOutMin: 0,
            dexType: DexV3Type.UniswapV3
        });

        // 2. Swap WETH for USDC on Uniswap V3
        address pool2 = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(WETH, USDC, WETH_USDC_FEE);
        SwapV3 memory swap2 = SwapV3({
            router: UNISWAP_V3_ROUTER,
            pool: pool2,
            tokenIn: WETH,
            tokenOut: USDC,
            amountOutMin: 0,
            dexType: DexV3Type.UniswapV3
        });

        SwapV3[] memory swapsV3 = new SwapV3[](2);
        swapsV3[0] = swap1;
        swapsV3[1] = swap2;

        SwapV2[] memory swapsV2 = new SwapV2[](0);

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V3, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V3, index: 1 });

        // deal profit to contract
        deal(USDC, address(executor), amountToBorrow + simulatedProfit);

        uint256 initiatorBalanceBefore = IERC20(USDC).balanceOf(initiator);

        vm.prank(initiator);
        executor.executeArbitrage(
            USDC,
            amountToBorrow,
            swapPath,
            swapsV3,
            swapsV2
        );

        uint256 initiatorBalanceAfter = IERC20(USDC).balanceOf( initiator);
        assertGt(initiatorBalanceAfter, initiatorBalanceBefore, "Initiator should have received a fee");
    }
}
