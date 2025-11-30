// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "contracts/src/MultiV3Executor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BscV2Test is Test {
    MultiV3Executor executor;

    // BSC Mainnet Addresses
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address internal constant BUSD = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56;

    address internal constant PANCAKESWAP_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    function setUp() public {
        executor = new MultiV3Executor(address(this));
    }

    function test_PancakeSwap_V2_Swap() public {
        uint256 amountIn = 1 * 1e18; // 1 WBNB
        deal(WBNB, address(executor), amountIn);

        SwapV2[] memory swaps = new SwapV2[](1);

        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = BUSD;
        swaps[0] = SwapV2({
            router: PANCAKESWAP_V2_ROUTER,
            path: path,
            amountIn: amountIn,
            amountOutMin: 0,
            dexType: DexV2Type.PancakeSwapV2
        });

        uint256 initialExecutorBalance = IERC20(WBNB).balanceOf(address(executor));

        // Execute the swap
        uint256 finalAmount = executor._executeV2Swaps(swaps, initialExecutorBalance);

        assertTrue(finalAmount > 0, "Final amount is not greater than 0");
        assertEq(IERC20(BUSD).balanceOf(address(executor)), finalAmount, "Final BUSD balance mismatch");
    }
}
