// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "contracts/src/MultiV3Executor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapV2Test is Test {
    MultiV3Executor executor;

    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    address internal constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address internal constant SUSHISWAP_V2_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;

    function setUp() public {
        executor = new MultiV3Executor(address(this));
    }

    function test_MultiDexV2Swaps() public {
        uint256 amountIn = 1000 * 1e6; // 1000 USDC
        deal(USDC, address(executor), amountIn);

        SwapV2[] memory swaps = new SwapV2[](2);

        address[] memory path1 = new address[](2);
        path1[0] = USDC;
        path1[1] = WETH;
        swaps[0] = SwapV2({
            router: UNISWAP_V2_ROUTER,
            path: path1,
            amountIn: amountIn,
            amountOutMin: 0,
            dexType: DexV2Type.UniswapV2
        });

        address[] memory path2 = new address[](2);
        path2[0] = WETH;
        path2[1] = DAI;
        swaps[1] = SwapV2({
            router: SUSHISWAP_V2_ROUTER,
            path: path2,
            amountIn: 0, // Chained from previous swap
            amountOutMin: 0,
            dexType: DexV2Type.SushiV2
        });

        uint256 initialExecutorBalance = IERC20(USDC).balanceOf(address(executor));

        // Execute the swaps
        uint256 finalAmount = executor._executeV2Swaps(swaps, initialExecutorBalance);

        assertTrue(finalAmount > 0, "Final amount is not greater than 0");
        assertEq(IERC20(DAI).balanceOf(address(executor)), finalAmount, "Final DAI balance mismatch");
    }
}
