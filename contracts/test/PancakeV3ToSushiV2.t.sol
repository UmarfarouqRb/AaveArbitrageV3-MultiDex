// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "contracts/src/MultiV3Executor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PancakeV3ToSushiV2Test is Test {
    MultiV3Executor executor;

    // Base Mainnet Addresses
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant SUSHI = 0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a;

    // DEX Routers on Base
    address internal constant PANCAKESWAP_V3_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address internal constant SUSHISWAP_V2_ROUTER = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;

    // PancakeSwap V3 Pool on Base
    address internal constant USDC_WETH_PANCAKESWAP_V3_POOL = 0x0d5B6325B11520462fbfe28F7936168a9a284648;

    function setUp() public {
        executor = new MultiV3Executor(address(this));
    }

    function test_PancakeV3_to_SushiV2_MultiHop() public {
        uint256 wethAmountIn = 332359044748525551;
        deal(WETH, address(executor), wethAmountIn);

        // === SWAP 2: SushiSwap V2 (WETH -> SUSHI) ===
        SwapV2[] memory swapsV2 = new SwapV2[](1);
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = SUSHI;
        swapsV2[0] = SwapV2({
            router: SUSHISWAP_V2_ROUTER,
            path: path,
            amountIn: wethAmountIn, // Input is the output from the first swap
            amountOutMin: 0,
            dexType: DexV2Type.SushiV2
        });

        // Execute the second swap
        uint256 finalAmount = executor._executeV2Swaps(swapsV2, wethAmountIn);

        assertTrue(finalAmount > 0, "Final SUSHI amount is not greater than 0");
        assertEq(IERC20(SUSHI).balanceOf(address(executor)), finalAmount, "Final SUSHI balance mismatch");
    }
}
