// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, DexV3Type, SwapV2, DexV2Type} from "../src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Constants} from "./Constants.sol";
import {IPancakeV3Factory} from "pancake-v3-core/interfaces/IPancakeV3Factory.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract SwapTest is Test, Constants {
    AaveArbitrageV3 public executor;
    uint24 public constant WETH_USDC_FEE_PANCAKE = 500;
    address public initiator = 0xC3f2c61C4836Afeb9Ae601c91F6FE661df3D634E;
    address public multisig = 0x1111111111111111111111111111111111111111;

    function setUp() public {
        vm.createSelectFork("base");

        address[] memory initialWhitelistedRouters = new address[](5);
        initialWhitelistedRouters[0] = UNISWAP_V3_ROUTER;
        initialWhitelistedRouters[1] = UNISWAP_V2_ROUTER;
        initialWhitelistedRouters[2] = SUSHISWAP_V2_ROUTER;
        initialWhitelistedRouters[3] = AERODROME_ROUTER;
        initialWhitelistedRouters[4] = PANCAKESWAP_V3_ROUTER;

        executor = new AaveArbitrageV3(
            IPool(AAVE_V3_POOL),
            multisig,
            initialWhitelistedRouters
        );
    }

    function test_RoundTripPancakeV3() public {
        uint256 loanAmount = 10000e6; // 10,000 USDC
        uint256 simulatedProfit = 100e6; // 100 USDC

        address expectedPool = IPancakeV3Factory(PANCAKESWAP_V3_FACTORY).getPool(
            USDC,
            WETH,
            WETH_USDC_FEE_PANCAKE
        );

        SwapV3[] memory swapsV3 = new SwapV3[](1);
        swapsV3[0] = SwapV3({
            router: PANCAKESWAP_V3_ROUTER,
            pool: expectedPool,
            tokenIn: USDC,
            tokenOut: WETH,
            amountOutMin: 0,
            dexType: DexV3Type.PancakeV3
        });

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        SwapV2[] memory swapsV2 = new SwapV2[](1);
        swapsV2[0] = SwapV2({
            router: UNISWAP_V2_ROUTER,
            path: path,
            amountOutMin: 0,
            dexType: DexV2Type.UniswapV2,
            data: bytes("")
        });

        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V3, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V2, index: 0 });

        deal(USDC, address(executor), loanAmount + simulatedProfit);

        uint256 initiatorBalanceBefore = IERC20(USDC).balanceOf(initiator);
        uint256 multisigBalanceBefore = IERC20(USDC).balanceOf(multisig);

        vm.prank(initiator);
        executor.executeArbitrage(USDC, loanAmount, swapPath, swapsV3, swapsV2);

        uint256 initiatorBalanceAfter = IERC20(USDC).balanceOf(initiator);
        uint256 multisigBalanceAfter = IERC20(USDC).balanceOf(multisig);

        console.log("SwapTest: Loan Amount (USDC):", loanAmount);
        console.log("SwapTest: Simulated Profit (USDC):", simulatedProfit);
        console.log("SwapTest: Initiator Balance Before (USDC):", initiatorBalanceBefore);
        console.log("SwapTest: Multisig Balance Before (USDC):", multisigBalanceBefore);
        console.log("SwapTest: Initiator Balance After (USDC):", initiatorBalanceAfter);
        console.log("SwapTest: Multisig Balance After (USDC):", multisigBalanceAfter);
        console.log("SwapTest: Initiator Profit (USDC):", initiatorBalanceAfter - initiatorBalanceBefore);
        console.log("SwapTest: Multisig Profit (USDC):", multisigBalanceAfter - multisigBalanceBefore);

        assertGt(initiatorBalanceAfter, initiatorBalanceBefore, "Initiator should have received a fee");
        assertGt(multisigBalanceAfter, multisigBalanceBefore, "Multisig should have received profit");
    }
}
