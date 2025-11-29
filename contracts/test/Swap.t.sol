// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AaveArbitrageV3} from "src/AaveArbitrageV3.sol";
import {Swap, DexType} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwapTest is Test {
    AaveArbitrageV3 public arbitrage;
    address public owner = makeAddr("owner");
    address public keeper = makeAddr("keeper");
    address public deployer = makeAddr("deployer");

    // Ethereum Mainnet
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;

    // Uniswap V3 on Ethereum
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant UNISWAP_V3_WETH_USDC_POOL = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640;

    function setUp() public {
        vm.prank(deployer);
        arbitrage = new AaveArbitrageV3(owner, AAVE_POOL);
    }

    function test_SingleSwapUniswapV3() public {
        uint256 amountIn = 1 * 1e18;
        deal(WETH, address(arbitrage), amountIn);

        Swap[] memory swaps = new Swap[](1);
        address[] memory pools = new address[](1);
        pools[0] = UNISWAP_V3_WETH_USDC_POOL;

        swaps[0] = Swap({
            router: UNISWAP_V3_ROUTER,
            pools: pools,
            tokenIn: WETH,
            tokenOut: USDC,
            dexType: DexType.UniswapV3,
            amountIn: amountIn,
            amountOut: 0,
            factory: address(0)
        });

        arbitrage._executeSwaps(swaps, amountIn);

        uint256 usdcBalance = IERC20(USDC).balanceOf(address(arbitrage));
        assertTrue(usdcBalance > 0, "USDC balance should be greater than 0");
    }
}
