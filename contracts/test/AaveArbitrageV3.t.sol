// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AaveArbitrageV3} from "src/AaveArbitrageV3.sol";
import {MultiV3Executor, Swap, DexType} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AaveArbitrageV3Test is Test {
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
        vm.label(owner, "Owner (Multisig)");
        vm.label(keeper, "Keeper");
        vm.label(address(arbitrage), "Arbitrage Contract");
    }

    function test_FullArbitrage_ProfitDistribution() public {
        address flashLoanToken = USDC;
        uint256 flashLoanAmount = 10_000 * 1e6;
        uint256 fakeProfit = 30_000 * 1e6;
        deal(USDC, address(arbitrage), fakeProfit);

        Swap[] memory swaps = new Swap[](2);
        address[] memory pools = new address[](1);
        pools[0] = UNISWAP_V3_WETH_USDC_POOL;

        swaps[0] = Swap({
            router: UNISWAP_V3_ROUTER,
            pools: pools,
            tokenIn: USDC,
            tokenOut: WETH,
            dexType: DexType.UniswapV3,
            amountIn: flashLoanAmount,
            amountOut: 0,
            factory: address(0)
        });
        swaps[1] = Swap({
            router: UNISWAP_V3_ROUTER,
            pools: pools,
            tokenIn: WETH,
            tokenOut: USDC,
            dexType: DexType.UniswapV3,
            amountIn: 0,
            amountOut: 0,
            factory: address(0)
        });

        vm.prank(keeper);
        arbitrage.executeArbitrage(flashLoanToken, flashLoanAmount, swaps);

        assertTrue(IERC20(USDC).balanceOf(keeper) > 0);
        assertTrue(IERC20(USDC).balanceOf(owner) > 0);
    }

    function test_SetKeeperFee() public {
        vm.prank(owner);
        arbitrage.setKeeperFee(2500); // 25%
        assertEq(arbitrage.keeperFeeBps(), 2500);
    }

    function test_SetKeeperFee_NotOwner() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        arbitrage.setKeeperFee(2500);
    }

    function test_SetPool() public {
        address newPool = makeAddr("newPool");
        vm.prank(owner);
        arbitrage.setPool(newPool);
        assertEq(address(arbitrage.LENDING_POOL()), newPool);
    }
}
