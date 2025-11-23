// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AaveArbitrageV3} from "src/AaveArbitrageV3.sol";
import {MultiV3Executor, Swap, DexType} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwapTest is Test {
    AaveArbitrageV3 public arbitrage;
    address public owner = makeAddr("owner");
    address public keeper = makeAddr("keeper");
    address public deployer = makeAddr("deployer");

    // Base Mainnet
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Uniswap V3 on Base
    address public constant UNISWAP_V3_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address public constant UNISWAP_V3_WETH_USDC_POOL = 0x3951Ea9b1932315522533899C4145c804576392d;

    function setUp() public {
        vm.prank(deployer);
        arbitrage = new AaveArbitrageV3(owner);
    }

    function test_SingleSwap() public {
        uint256 amountIn = 1 * 1e18;
        deal(WETH, address(arbitrage), amountIn);

        Swap[] memory swaps = new Swap[](1);
        swaps[0] = Swap({
            router: UNISWAP_V3_ROUTER,
            pool: UNISWAP_V3_WETH_USDC_POOL,
            tokenIn: WETH,
            tokenOut: USDC,
            dexType: DexType.UniswapV3,
            amountIn: amountIn,
            amountOut: 0
        });

        arbitrage._executeSwaps(swaps, amountIn);

        uint256 usdcBalance = IERC20(USDC).balanceOf(address(arbitrage));
        assertTrue(usdcBalance > 0, "USDC balance should be greater than 0");
    }
}
