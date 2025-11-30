// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "contracts/src/MultiV3Executor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BaseV2Test is Test {
    MultiV3Executor executor;

    // Base Mainnet Addresses
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant AERO = 0x940181a94a35a4569e4529a3cdfb74e38fD9860C;

    address internal constant BASESWAP_V2_ROUTER = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address internal constant AERODROME_V2_ROUTER = 0xCf77a3Ba9a5CA399b7C97C74D549B06fe04fA027;

    function setUp() public {
        executor = new MultiV3Executor(address(this));
    }

    function test_Single_Aerodrome_Swap() public {
        uint256 amountIn = 1 * 1e18; // 1 WETH
        deal(WETH, address(executor), amountIn);

        SwapV2[] memory swaps = new SwapV2[](1);

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = AERO;
        swaps[0] = SwapV2({
            router: AERODROME_V2_ROUTER,
            path: path,
            amountIn: amountIn,
            amountOutMin: 0,
            dexType: DexV2Type.AerodromeV2
        });

        uint256 initialExecutorBalance = IERC20(WETH).balanceOf(address(executor));

        // Execute the swaps
        uint256 finalAmount = executor._executeV2Swaps(swaps, initialExecutorBalance);

        assertTrue(finalAmount > 0, "Final amount is not greater than 0");
        assertEq(IERC20(AERO).balanceOf(address(executor)), finalAmount, "Final AERO balance mismatch");
    }
}
