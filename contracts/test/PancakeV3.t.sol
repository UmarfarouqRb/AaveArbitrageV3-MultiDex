// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MultiV3Executor, SwapV3, DexV3Type} from "../src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPancakeV3Factory} from "pancake-v3-core/interfaces/IPancakeV3Factory.sol";

contract PancakeV3Test is Test {
    MultiV3Executor public executor;
    address public owner = makeAddr("owner");

    // Ethereum Mainnet
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // PancakeSwap V3 on Ethereum
    address public constant PANCAKE_V3_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address public constant PANCAKE_V3_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    uint24 public constant WETH_USDC_FEE_PANCAKE = 500;

    // Uniswap V3 on Ethereum
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant UNISWAP_V3_WETH_USDC_POOL = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640;

    function setUp() public {
        executor = new MultiV3Executor(owner);
    }

    function test_SingleSwapPancakeV3() public {
        uint256 amountIn = 1 * 1e18;
        deal(WETH, address(executor), amountIn);

        address expectedPool = IPancakeV3Factory(PANCAKE_V3_FACTORY).getPool(WETH, USDC, WETH_USDC_FEE_PANCAKE);
        assertTrue(expectedPool != address(0), "Pool does not exist");

        SwapV3[] memory swaps = new SwapV3[](1);

        swaps[0] = SwapV3({
            router: PANCAKE_V3_ROUTER,
            pool: expectedPool,
            tokenIn: WETH,
            tokenOut: USDC,
            dexType: DexV3Type.PancakeV3,
            amountIn: amountIn,
            amountOutMin: 0
        });

        executor._executeV3Swaps(swaps, amountIn);

        uint256 usdcBalance = IERC20(USDC).balanceOf(address(executor));
        assertTrue(usdcBalance > 0, "USDC balance should be greater than 0");
    }

    function test_SwapUniswapV3ToPancakeV3() public {
        uint256 amountIn = 1 * 1e18;
        deal(WETH, address(executor), amountIn);

        SwapV3[] memory swaps = new SwapV3[](2);

        swaps[0] = SwapV3({
            router: UNISWAP_V3_ROUTER,
            pool: UNISWAP_V3_WETH_USDC_POOL,
            tokenIn: WETH,
            tokenOut: USDC,
            dexType: DexV3Type.UniswapV3,
            amountIn: amountIn,
            amountOutMin: 0
        });

        address expectedPancakePool = IPancakeV3Factory(PANCAKE_V3_FACTORY).getPool(USDC, WETH, WETH_USDC_FEE_PANCAKE);
        assertTrue(expectedPancakePool != address(0), "Pancake pool does not exist");

        swaps[1] = SwapV3({
            router: PANCAKE_V3_ROUTER,
            pool: expectedPancakePool,
            tokenIn: USDC,
            tokenOut: WETH,
            dexType: DexV3Type.PancakeV3,
            amountIn: 0, // Amount in is the output of the previous swap
            amountOutMin: 0
        });

        executor._executeV3Swaps(swaps, amountIn);

        uint256 wethBalance = IERC20(WETH).balanceOf(address(executor));
        assertTrue(wethBalance > 0, "WETH balance should be greater than 0");
    }
}
