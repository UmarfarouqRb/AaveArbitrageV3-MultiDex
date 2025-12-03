// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, SwapV2, DexV2Type} from "../src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract UniswapV2Test is Test, Constants {
    AaveArbitrageV3 public executor;
    address public initiator = 0xC3f2c61C4836Afeb9Ae601c91F6FE661df3D634E;
    address public multisig = 0x1111111111111111111111111111111111111111;

    function setUp() public {
        vm.createSelectFork("base");

        address[] memory initialWhitelistedRouters = new address[](4);
        initialWhitelistedRouters[0] = UNISWAP_V3_ROUTER;
        initialWhitelistedRouters[1] = UNISWAP_V2_ROUTER;
        initialWhitelistedRouters[2] = SUSHISWAP_V2_ROUTER;
        initialWhitelistedRouters[3] = AERODROME_ROUTER;

        executor = new AaveArbitrageV3(
            IPool(AAVE_V3_POOL),
            multisig,
            initialWhitelistedRouters
        );
    }

    function test_RoundTripUniswapV2() public {
        uint256 amountToBorrow = 10000e6; // 10,000 USDC
        uint256 simulatedProfit = 100e6; // 100 USDC

        // 1. Swap USDC for WETH on Uniswap V2
        address[] memory path1 = new address[](2);
        path1[0] = USDC;
        path1[1] = WETH;
        SwapV2 memory swap1 = SwapV2({
            router: UNISWAP_V2_ROUTER,
            path: path1,
            amountOutMin: 0,
            dexType: DexV2Type.UniswapV2,
            data: bytes("")
        });

        // 2. Swap WETH for USDC on Uniswap V2
        address[] memory path2 = new address[](2);
        path2[0] = WETH;
        path2[1] = USDC;
        SwapV2 memory swap2 = SwapV2({
            router: UNISWAP_V2_ROUTER,
            path: path2,
            amountOutMin: 0,
            dexType: DexV2Type.UniswapV2,
            data: bytes("")
        });

        SwapV3[] memory swapsV3 = new SwapV3[](0);
        SwapV2[] memory swapsV2 = new SwapV2[](2);
        swapsV2[0] = swap1;
        swapsV2[1] = swap2;

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V2, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V2, index: 1 });

        deal(USDC, address(executor), amountToBorrow + simulatedProfit);

        uint256 initiatorBalanceBefore = IERC20(USDC).balanceOf(initiator);
        uint256 multisigBalanceBefore = IERC20(USDC).balanceOf(multisig);

        vm.prank(initiator);
        executor.executeArbitrage(
            USDC,
            amountToBorrow,
            swapPath,
            swapsV3,
            swapsV2
        );

        uint256 initiatorBalanceAfter = IERC20(USDC).balanceOf(initiator);
        uint256 multisigBalanceAfter = IERC20(USDC).balanceOf(multisig);

        console.log("UniswapV2Test: Loan Amount (USDC):", amountToBorrow);
        console.log("UniswapV2Test: Simulated Profit (USDC):", simulatedProfit);
        console.log("UniswapV2Test: Initiator Balance Before (USDC):", initiatorBalanceBefore);
        console.log("UniswapV2Test: Multisig Balance Before (USDC):", multisigBalanceBefore);
        console.log("UniswapV2Test: Initiator Balance After (USDC):", initiatorBalanceAfter);
        console.log("UniswapV2Test: Multisig Balance After (USDC):", multisigBalanceAfter);
        console.log("UniswapV2Test: Initiator Profit (USDC):", initiatorBalanceAfter - initiatorBalanceBefore);
        console.log("UniswapV2Test: Multisig Profit (USDC):", multisigBalanceAfter - multisigBalanceBefore);

        assertGt(initiatorBalanceAfter, initiatorBalanceBefore, "Initiator should have received a fee");
        assertGt(multisigBalanceAfter, multisigBalanceBefore, "Multisig should have received profit");
    }
}
